// server/src/services/match-service.test.ts
// 快速匹配服务单元测试：覆盖匹配状态机、队列满员创建房间、超时清理、状态查询
// 设计原因：匹配队列使用 Redis List 存储，状态流转涉及多次 lrange/lrem 异步调用，
// 满员时自动创建房间是核心业务路径；超时清理依赖 setTimeout 异步回调，是质量风险点。
// 通过脚本化 lrange 返回值，精确控制每次调用结果，避免 mock 计数混乱。

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCode } from '../utils/error.js';

// 使用 vi.hoisted 提升 mock，确保 vi.mock 工厂能引用
// 设计原因：vi.mock 工厂在模块导入前执行，普通变量无法被工厂闭包捕获
const mocks = vi.hoisted(() => ({
  lrange: vi.fn(),
  rpush: vi.fn(),
  lrem: vi.fn(),
  del: vi.fn(),
  exists: vi.fn(),
  setex: vi.fn(),
  createRoom: vi.fn(),
  joinRoom: vi.fn(),
}));

vi.mock('../config/redis.js', () => ({
  default: {
    lrange: mocks.lrange,
    rpush: mocks.rpush,
    lrem: mocks.lrem,
    del: mocks.del,
    exists: mocks.exists,
    setex: mocks.setex,
  },
}));

// mock 整个 room-manager 模块，避免触发 io/ai 生成器等副作用导入
vi.mock('../websocket/room-manager.js', () => ({
  roomManager: {
    createRoom: mocks.createRoom,
    joinRoom: mocks.joinRoom,
  },
}));

import {
  joinQuickMatch,
  leaveQuickMatch,
  getMatchStatus,
  checkAndMatch,
} from './match-service.js';

/**
 * 构造 lrange 返回的队列数组
 * 每个玩家序列化为一条 JSON 字符串，与 match-service 的存储结构对齐
 * 设计原因：match-service 采用 JSON 单条存储保证 lrem 原子删除，
 * 测试需模拟真实 Redis List 结构，避免按值误删风险被测试掩盖
 */
function queue(...players: Array<[string, string, string, number]>): string[] {
  return players.map(([uid, nick, sid, t]) =>
    JSON.stringify({ userId: uid, nickname: nick, socketId: sid, joinedAt: t })
  );
}

describe('match-service 快速匹配服务', () => {
  // lrange 返回脚本：每次调用 shift 一个，模拟队列状态演进
  // 设计原因：joinQuickMatch 内部多次调用 getQueuePlayers（cleanup+主体+加入后），
  // 用脚本数组按次序返回，避免 mockImplementation 计数错乱
  let script: string[][];

  beforeEach(() => {
    vi.clearAllMocks();
    script = [];
    mocks.lrange.mockImplementation(() => Promise.resolve(script.shift() ?? []));
  });

  describe('joinQuickMatch 加入匹配', () => {
    it('已在队列中时抛 BAD_REQUEST', async () => {
      // cleanup 返回空，主体检查返回包含自己的队列
      script = [[], queue(['u1', 'nick1', 's1', Date.now()])];

      await expect(joinQuickMatch('u1', 'nick1', 's1')).rejects.toMatchObject({
        code: ErrorCode.BAD_REQUEST,
        message: '已在匹配队列中',
      });
      // 不应写入队列
      expect(mocks.rpush).not.toHaveBeenCalled();
    });

    it('队列未满时加入队列并抛"正在匹配中"，验证 rpush 与 setex', async () => {
      // cleanup 空、主体空、加入后仅自己（1 人未满）
      script = [[], [], queue(['u1', 'nick1', 's1', Date.now()])];

      await expect(joinQuickMatch('u1', 'nick1', 's1')).rejects.toMatchObject({
        code: ErrorCode.BAD_REQUEST,
      });

      // rpush 写入单条 JSON 字符串（含 userId/nickname/socketId/joinedAt）
      expect(mocks.rpush).toHaveBeenCalledWith(
        'match:queue',
        expect.stringContaining('"userId":"u1"')
      );
      expect(mocks.rpush).toHaveBeenCalledWith(
        'match:queue',
        expect.stringContaining('"nickname":"nick1"')
      );
      // setex 设置 30 秒匹配状态
      expect(mocks.setex).toHaveBeenCalledWith(
        'match:status:u1',
        30,
        'matching'
      );
    });

    it('队列满 4 人时取前 4 创建房间，验证 createRoom 1 次 joinRoom 3 次', async () => {
      // cleanup 空、主体空、加入后 4 人（满员）
      const now = Date.now();
      script = [
        [],
        [],
        queue(
          ['u1', 'n1', 's1', now],
          ['u2', 'n2', 's2', now],
          ['u3', 'n3', 's3', now],
          ['u4', 'n4', 's4', now]
        ),
        // 后续 4 次 removeFromQueue 内的 lrange 返回空（不触发 lrem）
        [],
        [],
        [],
        [],
      ];
      mocks.createRoom.mockResolvedValue({ id: 'ROOM1' });

      const result = await joinQuickMatch('u4', 'n4', 's4');

      expect(result).toEqual({ roomId: 'ROOM1' });
      // 第一个玩家作为房主创建房间
      expect(mocks.createRoom).toHaveBeenCalledTimes(1);
      expect(mocks.createRoom).toHaveBeenCalledWith('u1', 's1', 'n1');
      // 其余 3 个玩家加入房间
      expect(mocks.joinRoom).toHaveBeenCalledTimes(3);
      // 4 个玩家的匹配状态全部清除
      expect(mocks.del).toHaveBeenCalledTimes(4);
    });

    it('队列满 5 人时仅取前 4 创建房间', async () => {
      const now = Date.now();
      script = [
        [],
        [],
        queue(
          ['u1', 'n1', 's1', now],
          ['u2', 'n2', 's2', now],
          ['u3', 'n3', 's3', now],
          ['u4', 'n4', 's4', now],
          ['u5', 'n5', 's5', now]
        ),
        [],
        [],
        [],
        [],
      ];
      mocks.createRoom.mockResolvedValue({ id: 'ROOM1' });

      const result = await joinQuickMatch('u5', 'n5', 's5');

      expect(result).toEqual({ roomId: 'ROOM1' });
      // 仍只创建 1 个房间（取前 4）
      expect(mocks.createRoom).toHaveBeenCalledTimes(1);
      expect(mocks.joinRoom).toHaveBeenCalledTimes(3);
    });

    it('cleanup 清理超时玩家（joinedAt 超过 30 秒）触发 lrem 1 次', async () => {
      // 超时玩家：joinedAt 为 60 秒前
      const timeoutTime = Date.now() - 60_000;
      // cleanup 第 1 次 lrange 返回超时玩家，removeFromQueue 内 lrange 返回超时玩家（触发 lrem）
      // 主体检查返回空，加入后返回自己（未满）
      script = [
        queue(['old', 'oldnick', 'oldsock', timeoutTime]), // cleanup getQueuePlayers
        queue(['old', 'oldnick', 'oldsock', timeoutTime]), // removeFromQueue 内 getQueuePlayers
        [], // 主体检查已在队列
        queue(['u1', 'n1', 's1', Date.now()]), // 加入后
      ];

      await expect(joinQuickMatch('u1', 'n1', 's1')).rejects.toMatchObject({
        code: ErrorCode.BAD_REQUEST,
      });

      // 超时玩家被 lrem 移除整条 JSON 记录（1 次）
      expect(mocks.lrem).toHaveBeenCalledTimes(1);
    });

    it('未满时 30 秒后 setTimeout 自动清理出队', async () => {
      vi.useFakeTimers();
      try {
        const now = Date.now();
        // cleanup 空、主体空、加入后自己（未满）
        // setTimeout 回调内 getQueuePlayers 返回自己，removeFromQueue 内 lrange 返回自己
        script = [
          [],
          [],
          queue(['u1', 'n1', 's1', now]),
          queue(['u1', 'n1', 's1', now]), // setTimeout 回调 getQueuePlayers
          queue(['u1', 'n1', 's1', now]), // removeFromQueue 内 getQueuePlayers
        ];

        await expect(joinQuickMatch('u1', 'n1', 's1')).rejects.toMatchObject({
          code: ErrorCode.BAD_REQUEST,
        });

        // 推进 30 秒触发 setTimeout 回调
        await vi.advanceTimersByTimeAsync(30_000);

        // 回调内 removeFromQueue 执行 lrem 1 次（删除整条 JSON）+ del 状态 1 次
        expect(mocks.lrem).toHaveBeenCalledTimes(1);
        expect(mocks.del).toHaveBeenCalledWith('match:status:u1');
      } finally {
        vi.useRealTimers();
      }
    });

    it('setTimeout 回调时玩家已不在队列则不执行清理', async () => {
      vi.useFakeTimers();
      try {
        const now = Date.now();
        // 加入后自己（未满）；setTimeout 回调时 getQueuePlayers 返回空（玩家已离开）
        script = [
          [],
          [],
          queue(['u1', 'n1', 's1', now]),
          [], // setTimeout 回调 getQueuePlayers 返回空，find 找不到 player
        ];

        await expect(joinQuickMatch('u1', 'n1', 's1')).rejects.toMatchObject({
          code: ErrorCode.BAD_REQUEST,
        });

        await vi.advanceTimersByTimeAsync(30_000);

        // player 不存在，不触发 removeFromQueue 与 del
        expect(mocks.lrem).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('leaveQuickMatch 离开匹配', () => {
    it('调用 removeFromQueue 与 del 清理状态', async () => {
      const now = Date.now();
      // removeFromQueue 内 lrange 返回包含自己的队列
      script = [queue(['u1', 'n1', 's1', now])];

      await leaveQuickMatch('u1');

      // 玩家被 lrem 移除整条 JSON 记录（1 次）
      expect(mocks.lrem).toHaveBeenCalledTimes(1);
      expect(mocks.del).toHaveBeenCalledWith('match:status:u1');
    });

    it('队列中无自己时 lrem 不触发，del 仍清理状态', async () => {
      // lrange 返回空，找不到自己
      script = [[]];

      await leaveQuickMatch('u1');

      expect(mocks.lrem).not.toHaveBeenCalled();
      // 状态仍清理，保证幂等
      expect(mocks.del).toHaveBeenCalledWith('match:status:u1');
    });

    it('加入后离开会清除匹配超时 timer，30 秒后回调不再执行', async () => {
      vi.useFakeTimers();
      try {
        const now = Date.now();
        // 加入匹配：cleanup 空、主体空、加入后自己（未满）
        script = [
          [],
          [],
          queue(['u1', 'n1', 's1', now]),
        ];

        await expect(joinQuickMatch('u1', 'n1', 's1')).rejects.toMatchObject({
          code: ErrorCode.BAD_REQUEST,
        });

        // 离开匹配：removeFromQueue 内 lrange 返回自己（整条 JSON 被 lrem）
        script = [queue(['u1', 'n1', 's1', now])];
        await leaveQuickMatch('u1');

        // leaveQuickMatch 应已调用 clearMatchTimer 取消 timer
        // 验证方式：推进 30 秒后，若 timer 未被取消，回调会再触发 1 次 getQueuePlayers（lrange +1）
        // 若 timer 已被取消，回调不执行，lrange 调用次数不变
        const lrangeCountBeforeAdvance = mocks.lrange.mock.calls.length;
        await vi.advanceTimersByTimeAsync(30_000);
        expect(mocks.lrange.mock.calls.length).toBe(lrangeCountBeforeAdvance);
        // lrem 仍是 leaveQuickMatch 内的 1 次，回调未额外触发
        expect(mocks.lrem).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('getMatchStatus 匹配状态查询', () => {
    it('在队列中时返回 inQueue=true 与 queueCount', async () => {
      mocks.exists.mockResolvedValue(1);
      const now = Date.now();
      // 队列中已有 2 人
      script = [queue(['u1', 'n1', 's1', now], ['u2', 'n2', 's2', now])];

      const status = await getMatchStatus('me');

      // queueCount = 当前队列人数 + 1（包含自己）
      expect(status).toEqual({ inQueue: true, queueCount: 3 });
      expect(mocks.exists).toHaveBeenCalledWith('match:status:me');
    });

    it('不在队列时返回 inQueue=false', async () => {
      mocks.exists.mockResolvedValue(0);

      const status = await getMatchStatus('me');

      expect(status).toEqual({ inQueue: false });
      // 不查询队列
      expect(mocks.lrange).not.toHaveBeenCalled();
    });
  });

  describe('checkAndMatch 定时匹配检查', () => {
    it('队列 4 人时创建 1 个房间', async () => {
      const now = Date.now();
      // getQueuePlayers 1 次；4 次 removeFromQueue 各 1 次 lrange
      script = [
        queue(
          ['u1', 'n1', 's1', now],
          ['u2', 'n2', 's2', now],
          ['u3', 'n3', 's3', now],
          ['u4', 'n4', 's4', now]
        ),
        [],
        [],
        [],
        [],
      ];
      mocks.createRoom.mockResolvedValue({ id: 'ROOM1' });

      await checkAndMatch();

      expect(mocks.createRoom).toHaveBeenCalledTimes(1);
      expect(mocks.joinRoom).toHaveBeenCalledTimes(3);
      // 4 人状态全部清除
      expect(mocks.del).toHaveBeenCalledTimes(4);
    });

    it('队列 8 人时创建 2 个房间', async () => {
      const now = Date.now();
      const four = queue(
        ['u1', 'n1', 's1', now],
        ['u2', 'n2', 's2', now],
        ['u3', 'n3', 's3', now],
        ['u4', 'n4', 's4', now]
      );
      const eight = four.concat(
        queue(
          ['u5', 'n5', 's5', now],
          ['u6', 'n6', 's6', now],
          ['u7', 'n7', 's7', now],
          ['u8', 'n8', 's8', now]
        )
      );
      // 第 1 次 getQueuePlayers 返回 8 人；前 4 人各 removeFromQueue lrange 返回空
      // while 循环 splice 后 length=4，再创建第 2 个房间（不再调 getQueuePlayers，用本地数组）
      script = [
        eight,
        [], [], [], [], // 第 1 轮 4 次 removeFromQueue
      ];
      mocks.createRoom
        .mockResolvedValueOnce({ id: 'ROOM1' })
        .mockResolvedValueOnce({ id: 'ROOM2' });

      await checkAndMatch();

      expect(mocks.createRoom).toHaveBeenCalledTimes(2);
      expect(mocks.joinRoom).toHaveBeenCalledTimes(6);
      // 8 人状态全部清除
      expect(mocks.del).toHaveBeenCalledTimes(8);
    });

    it('队列不足 4 人时不创建房间', async () => {
      const now = Date.now();
      script = [queue(['u1', 'n1', 's1', now], ['u2', 'n2', 's2', now], ['u3', 'n3', 's3', now])];

      await checkAndMatch();

      expect(mocks.createRoom).not.toHaveBeenCalled();
      expect(mocks.joinRoom).not.toHaveBeenCalled();
    });
  });
});
