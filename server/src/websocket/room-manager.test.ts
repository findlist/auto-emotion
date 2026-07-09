// server/src/websocket/room-manager.test.ts
// 房间管理器单元测试
// 设计原因：roomManager 直接操作 Redis 房间数据并广播事件，是多人对战核心状态机；
// 依赖 io 实例（import 时会触发 httpServer.listen 启动真实服务器）与 redis 客户端，
// 必须 mock 整个 ./index.js 模块避免副作用，mock redis 与 ai 模块隔离业务逻辑

import { describe, it, expect, vi, beforeEach } from 'vitest';

// 使用 vi.hoisted 提升 mock 引用，确保 vi.mock 工厂能访问
const mocks = vi.hoisted(() => ({
  // Redis 命令 mock
  setexMock: vi.fn(),
  getMock: vi.fn(),
  delMock: vi.fn(),
  setMock: vi.fn(),
  // io.to().emit() 链式调用 mock
  toEmitMock: vi.fn(),
  toMock: vi.fn(),
  // AI 生成器 mock
  generateMonsterMock: vi.fn(),
  generateLevelMock: vi.fn(),
  generateEventsMock: vi.fn(),
}));

// mock redis 客户端，避免真实连接
vi.mock('../config/redis.js', () => ({
  default: {
    setex: mocks.setexMock,
    get: mocks.getMock,
    del: mocks.delMock,
    set: mocks.setMock,
  },
}));

// mock io 实例，避免 import ./index.js 时触发 httpServer.listen 启动真实服务器
vi.mock('./index.js', () => ({
  io: {
    to: mocks.toMock,
  },
}));

// mock 三个 AI 生成器，避免依赖 AI_API_KEY 与外部服务
vi.mock('../ai/monster-generator.js', () => ({
  generate: mocks.generateMonsterMock,
}));
vi.mock('../ai/level-generator.js', () => ({
  generateLevel: mocks.generateLevelMock,
}));
vi.mock('../ai/event-generator.js', () => ({
  generateEvents: mocks.generateEventsMock,
}));

import { roomManager, type Room } from './room-manager.js';
import { ErrorCode } from '../utils/error.js';

describe('room-manager 房间管理器', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认 to() 返回带 emit 方法的对象，支持链式调用 io.to(roomId).emit(event, data)
    mocks.toMock.mockReturnValue({ emit: mocks.toEmitMock });
    // del 默认返回 Promise，避免 startGame 的 .finally 释放锁链式 .catch 报 undefined
    mocks.delMock.mockResolvedValue(1);
  });

  describe('createRoom 创建房间', () => {
    it('创建成功：写入 Redis 并返回房间初始状态', async () => {
      const room = await roomManager.createRoom('u1', 'sock1', '玩家1');

      expect(room.id).toHaveLength(6);
      expect(room.hostId).toBe('u1');
      expect(room.status).toBe('waiting');
      expect(room.mode).toBe('boss');
      expect(room.players).toEqual([
        { userId: 'u1', nickname: '玩家1', socketId: 'sock1', isReady: false },
      ]);
      expect(room.stressSources).toEqual({});
      // 写入 Redis 时 TTL 为 5 分钟（300 秒）
      expect(mocks.setexMock).toHaveBeenCalledOnce();
      const [key, ttl, value] = mocks.setexMock.mock.calls[0];
      expect(key).toBe(`room:${room.id}`);
      expect(ttl).toBe(300);
      expect(JSON.parse(value).id).toBe(room.id);
    });
  });

  describe('getRoom 获取房间', () => {
    it('房间存在时反序列化返回 Room 对象', async () => {
      const roomData: Room = {
        id: 'ABC123',
        hostId: 'u1',
        status: 'waiting',
        mode: 'boss',
        players: [],
        stressSources: {},
      };
      mocks.getMock.mockResolvedValue(JSON.stringify(roomData));

      const result = await roomManager.getRoom('ABC123');

      expect(result).toEqual(roomData);
      expect(mocks.getMock).toHaveBeenCalledWith('room:ABC123');
    });

    it('房间不存在时返回 null', async () => {
      mocks.getMock.mockResolvedValue(null);

      const result = await roomManager.getRoom('NOTEXIST');

      expect(result).toBeNull();
    });
  });

  describe('joinRoom 加入房间', () => {
    it('房间不存在时抛 NOT_FOUND 错误', async () => {
      mocks.getMock.mockResolvedValue(null);

      await expect(roomManager.joinRoom('NOPE', 'u2', 's2', '玩家2'))
        .rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
    });

    it('重连场景：玩家已在房间，刷新 socketId 与 nickname 后返回当前状态', async () => {
      const existing: Room = {
        id: 'R1',
        hostId: 'u1',
        status: 'playing',
        mode: 'boss',
        players: [{ userId: 'u1', nickname: '旧名', socketId: 'oldsock', isReady: true }],
        stressSources: {},
      };
      mocks.getMock.mockResolvedValue(JSON.stringify(existing));

      const result = await roomManager.joinRoom('R1', 'u1', 'newsock', '新名');

      expect(result.players[0].socketId).toBe('newsock');
      expect(result.players[0].nickname).toBe('新名');
      // playing 状态下重连不应抛错
      expect(result.status).toBe('playing');
    });

    it('新玩家加入 waiting 房间成功', async () => {
      const existing: Room = {
        id: 'R1',
        hostId: 'u1',
        status: 'waiting',
        mode: 'boss',
        players: [{ userId: 'u1', nickname: '玩家1', socketId: 's1', isReady: false }],
        stressSources: {},
      };
      mocks.getMock.mockResolvedValue(JSON.stringify(existing));

      const result = await roomManager.joinRoom('R1', 'u2', 's2', '玩家2');

      expect(result.players).toHaveLength(2);
      expect(result.players[1]).toEqual({
        userId: 'u2', nickname: '玩家2', socketId: 's2', isReady: false,
      });
    });

    it('房间已开始（非 waiting 状态）时抛 BAD_REQUEST', async () => {
      const existing: Room = {
        id: 'R1', hostId: 'u1', status: 'playing', mode: 'boss',
        players: [{ userId: 'u1', nickname: '玩家1', socketId: 's1', isReady: true }],
        stressSources: {},
      };
      mocks.getMock.mockResolvedValue(JSON.stringify(existing));

      await expect(roomManager.joinRoom('R1', 'u2', 's2', '玩家2'))
        .rejects.toMatchObject({ code: ErrorCode.BAD_REQUEST });
    });

    it('房间已满（8 人）时抛 BAD_REQUEST', async () => {
      const existing: Room = {
        id: 'R1', hostId: 'u1', status: 'waiting', mode: 'boss',
        players: Array.from({ length: 8 }, (_, i) => ({
          userId: `u${i}`, nickname: `玩家${i}`, socketId: `s${i}`, isReady: false,
        })),
        stressSources: {},
      };
      mocks.getMock.mockResolvedValue(JSON.stringify(existing));

      await expect(roomManager.joinRoom('R1', 'u9', 's9', '玩家9'))
        .rejects.toMatchObject({ code: ErrorCode.BAD_REQUEST });
    });
  });

  describe('leaveRoom 离开房间', () => {
    it('房间不存在时返回 null', async () => {
      mocks.getMock.mockResolvedValue(null);

      const result = await roomManager.leaveRoom('NOPE', 'u1');

      expect(result).toBeNull();
    });

    it('最后一个玩家离开：删除房间，返回 null', async () => {
      const existing: Room = {
        id: 'R1', hostId: 'u1', status: 'waiting', mode: 'boss',
        players: [{ userId: 'u1', nickname: '玩家1', socketId: 's1', isReady: false }],
        stressSources: { u1: '工作压力' },
      };
      mocks.getMock.mockResolvedValue(JSON.stringify(existing));

      const result = await roomManager.leaveRoom('R1', 'u1');

      expect(result).toBeNull();
      expect(mocks.delMock).toHaveBeenCalledWith('room:R1');
    });

    it('房主离开：房主转移给第一个剩余玩家', async () => {
      const existing: Room = {
        id: 'R1', hostId: 'u1', status: 'waiting', mode: 'boss',
        players: [
          { userId: 'u1', nickname: '房主', socketId: 's1', isReady: false },
          { userId: 'u2', nickname: '玩家2', socketId: 's2', isReady: false },
        ],
        stressSources: {},
      };
      mocks.getMock.mockResolvedValue(JSON.stringify(existing));

      const result = await roomManager.leaveRoom('R1', 'u1');

      expect(result).not.toBeNull();
      expect(result!.hostId).toBe('u2');
      expect(result!.players).toHaveLength(1);
      expect(result!.players[0].userId).toBe('u2');
      // 写回 Redis
      expect(mocks.setexMock).toHaveBeenCalledOnce();
    });

    it('普通玩家离开：房主不变', async () => {
      const existing: Room = {
        id: 'R1', hostId: 'u1', status: 'waiting', mode: 'boss',
        players: [
          { userId: 'u1', nickname: '房主', socketId: 's1', isReady: false },
          { userId: 'u2', nickname: '玩家2', socketId: 's2', isReady: false },
        ],
        stressSources: { u2: 'KPI' },
      };
      mocks.getMock.mockResolvedValue(JSON.stringify(existing));

      const result = await roomManager.leaveRoom('R1', 'u2');

      expect(result!.hostId).toBe('u1');
      // 离开玩家的压力源同步清理
      expect(result!.stressSources.u2).toBeUndefined();
    });
  });

  describe('setReady 设置准备状态', () => {
    it('房间不存在时抛 NOT_FOUND', async () => {
      mocks.getMock.mockResolvedValue(null);

      await expect(roomManager.setReady('NOPE', 'u1', true))
        .rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
    });

    it('所有玩家准备就绪时房间状态切到 ready', async () => {
      const existing: Room = {
        id: 'R1', hostId: 'u1', status: 'waiting', mode: 'boss',
        players: [{ userId: 'u1', nickname: '玩家1', socketId: 's1', isReady: false }],
        stressSources: {},
      };
      mocks.getMock.mockResolvedValue(JSON.stringify(existing));

      const result = await roomManager.setReady('R1', 'u1', true);

      expect(result.players[0].isReady).toBe(true);
      expect(result.status).toBe('ready');
    });

    it('任一玩家未准备时状态切回 waiting', async () => {
      const existing: Room = {
        id: 'R1', hostId: 'u1', status: 'ready', mode: 'boss',
        players: [
          { userId: 'u1', nickname: '玩家1', socketId: 's1', isReady: true },
          { userId: 'u2', nickname: '玩家2', socketId: 's2', isReady: true },
        ],
        stressSources: {},
      };
      mocks.getMock.mockResolvedValue(JSON.stringify(existing));

      const result = await roomManager.setReady('R1', 'u2', false);

      expect(result.status).toBe('waiting');
    });
  });

  describe('setMode 设置游戏模式', () => {
    it('非房主抛 FORBIDDEN', async () => {
      const existing: Room = {
        id: 'R1', hostId: 'u1', status: 'waiting', mode: 'boss',
        players: [], stressSources: {},
      };
      mocks.getMock.mockResolvedValue(JSON.stringify(existing));

      await expect(roomManager.setMode('R1', 'u2', 'brawl'))
        .rejects.toMatchObject({ code: ErrorCode.FORBIDDEN });
    });

    it('房主设置模式成功', async () => {
      const existing: Room = {
        id: 'R1', hostId: 'u1', status: 'waiting', mode: 'boss',
        players: [], stressSources: {},
      };
      mocks.getMock.mockResolvedValue(JSON.stringify(existing));

      const result = await roomManager.setMode('R1', 'u1', 'brawl');

      expect(result.mode).toBe('brawl');
    });
  });

  describe('submitStress 提交压力源', () => {
    it('房间不存在时抛 NOT_FOUND', async () => {
      mocks.getMock.mockResolvedValue(null);

      await expect(roomManager.submitStress('NOPE', 'u1', '工作压力'))
        .rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
    });

    it('提交成功：以 userId 为键写入 stressSources', async () => {
      const existing: Room = {
        id: 'R1', hostId: 'u1', status: 'waiting', mode: 'boss',
        players: [], stressSources: {},
      };
      mocks.getMock.mockResolvedValue(JSON.stringify(existing));

      const result = await roomManager.submitStress('R1', 'u1', '工作压力');

      expect(result.stressSources.u1).toBe('工作压力');
    });
  });

  describe('startGame 开始游戏', () => {
    it('非房主抛 FORBIDDEN', async () => {
      const existing: Room = {
        id: 'R1', hostId: 'u1', status: 'waiting', mode: 'boss',
        players: [], stressSources: {},
      };
      mocks.getMock.mockResolvedValue(JSON.stringify(existing));

      await expect(roomManager.startGame('R1', 'u2'))
        .rejects.toMatchObject({ code: ErrorCode.FORBIDDEN });
    });

    it('房主启动：状态切到 generating，触发异步关卡生成', async () => {
      const existing: Room = {
        id: 'R1', hostId: 'u1', status: 'ready', mode: 'boss',
        players: [{ userId: 'u1', nickname: '玩家1', socketId: 's1', isReady: true }],
        stressSources: { u1: '工作压力' },
      };
      mocks.getMock.mockResolvedValue(JSON.stringify(existing));
      // 模拟 SET NX EX 获取开始锁成功（ioredis 成功返回 'OK'）
      mocks.setMock.mockResolvedValue('OK');
      // AI 生成器全部成功返回（mock 数据与 MonsterConfig 完整结构对齐，含 stressTags/attack）
      mocks.generateMonsterMock.mockResolvedValue({
        name: '压力怪兽', hp: 1000, attack: 60,
        skills: [{ name: '冲击', type: 'attack', effect: '伤害', cooldown: 5 }],
        weakness: '被情绪释放技能击破', stressTags: ['工作压力'],
        avatar: '👾', appearance: { color: '#888888', shape: 'circle', size: 1.5 },
      });
      mocks.generateLevelMock.mockResolvedValue({
        mode: 'boss', difficulty: 1,
        destructibles: [{ id: 'd1', type: 'box', x: 0, y: 0, width: 60, height: 60, hp: 15, reward: 12 }],
        spawnPoints: [{ x: 400, y: 500 }],
      });
      mocks.generateEventsMock.mockReturnValue([
        { id: 'e1', type: 'buff', name: '加速', effect: '移速+10%', triggerTime: 30, duration: 10, payload: {} },
      ]);

      const result = await roomManager.startGame('R1', 'u1');

      // 立即返回时状态为 generating
      expect(result.status).toBe('generating');
      expect(mocks.setexMock).toHaveBeenCalled();
      // 验证获取开始锁调用：set(key, '1', 'EX', 30, 'NX')
      expect(mocks.setMock).toHaveBeenCalledWith('room:lock:start:R1', '1', 'EX', 30, 'NX');
    });

    it('重复开始（锁已被持有）抛 CONFLICT，不触发关卡生成', async () => {
      // 设计原因：房主连点两次，第一次 SET NX EX 成功获取锁，第二次返回 null（锁已被持有），
      // 应抛 CONFLICT 阻止重复触发 generateLevelAndEvents，避免 AI 生成两次 + 广播两次 LEVEL_READY
      const existing: Room = {
        id: 'R1', hostId: 'u1', status: 'ready', mode: 'boss',
        players: [{ userId: 'u1', nickname: '玩家1', socketId: 's1', isReady: true }],
        stressSources: { u1: '工作压力' },
      };
      mocks.getMock.mockResolvedValue(JSON.stringify(existing));
      // 模拟锁已被持有，SET NX EX 返回 null
      mocks.setMock.mockResolvedValue(null);

      await expect(roomManager.startGame('R1', 'u1'))
        .rejects.toMatchObject({ code: ErrorCode.CONFLICT, message: '游戏正在开始，请勿重复点击' });
      // 锁获取失败时不应写入房间状态，也不应触发 AI 生成
      expect(mocks.setexMock).not.toHaveBeenCalled();
      expect(mocks.generateMonsterMock).not.toHaveBeenCalled();
    });

    it('关卡生成失败时恢复房间状态为 ready 并广播错误', async () => {
      // 设计原因：generateLevelAndEvents 抛错时原 catch 仅记录日志，房间卡死 generating 无法重新开局；
      // 修复后 catch 应重置 status=ready 持久化并广播 room:error 通知前端重试
      const existing: Room = {
        id: 'R1', hostId: 'u1', status: 'ready', mode: 'boss',
        players: [{ userId: 'u1', nickname: '玩家1', socketId: 's1', isReady: true }],
        stressSources: { u1: '工作压力' },
      };
      mocks.getMock.mockResolvedValue(JSON.stringify(existing));
      mocks.setMock.mockResolvedValue('OK');
      // generateMonsterMock 返回 undefined（fulfilled），触发 monster.stressTags 取值抛 TypeError
      mocks.generateMonsterMock.mockResolvedValue(undefined);
      mocks.generateLevelMock.mockResolvedValue({
        mode: 'boss', difficulty: 1, destructibles: [], spawnPoints: [{ x: 400, y: 500 }],
      });
      mocks.generateEventsMock.mockReturnValue([]);

      await roomManager.startGame('R1', 'u1');

      // 异步 catch 恢复逻辑需等待其执行完成
      await vi.waitFor(() => {
        // 房间状态恢复为 ready 并持久化，房主可重新开局
        expect(mocks.setexMock).toHaveBeenCalledWith(
          'room:R1', expect.any(Number), expect.stringContaining('"status":"ready"')
        );
      });
      // 广播 room:error 通知前端开局失败
      expect(mocks.toEmitMock).toHaveBeenCalledWith(
        'room:error', expect.objectContaining({ message: '开局失败，请重试' })
      );
    });
  });

  describe('generateLevelAndEvents 关卡与事件生成', () => {
    it('空压力源列表时使用默认"工作压力"', async () => {
      const room: Room = {
        id: 'R1', hostId: 'u1', status: 'generating', mode: 'boss',
        players: [{ userId: 'u1', nickname: '玩家1', socketId: 's1', isReady: true }],
        stressSources: {}, // 空压力源
      };
      mocks.generateMonsterMock.mockResolvedValue({
        name: '怪兽', hp: 1000, attack: 60, skills: [], weakness: 'stress', stressTags: ['工作压力'],
      });
      mocks.generateLevelMock.mockResolvedValue({
        mode: 'boss', difficulty: 1,
        destructibles: [], spawnPoints: [{ x: 0, y: 0 }],
      });
      mocks.generateEventsMock.mockReturnValue([]);

      await roomManager.generateLevelAndEvents(room);

      // 验证怪兽生成器被调用时 stressKeywords 包含"工作压力"
      expect(mocks.generateMonsterMock).toHaveBeenCalledOnce();
      const monsterArgs = mocks.generateMonsterMock.mock.calls[0][0];
      expect(monsterArgs.stressKeywords).toContain('工作压力');
    });

    it('三个生成器全部成功：广播 LEVEL_READY 事件含完整数据', async () => {
      const room: Room = {
        id: 'R1', hostId: 'u1', status: 'generating', mode: 'boss',
        players: [{ userId: 'u1', nickname: '玩家1', socketId: 's1', isReady: true }],
        stressSources: { u1: 'KPI' },
      };
      mocks.generateMonsterMock.mockResolvedValue({
        name: 'KPI 噩梦兽', hp: 2000, attack: 60,
        skills: [{ name: '冲击', type: 'attack', effect: '伤害', cooldown: 5 }],
        weakness: '被连击眩晕', stressTags: ['KPI'],
      });
      mocks.generateLevelMock.mockResolvedValue({
        mode: 'boss', difficulty: 1,
        destructibles: [
          { id: 'd1', type: 'box', x: 100, y: 100, width: 60, height: 60, hp: 15, reward: 12 },
        ],
        spawnPoints: [{ x: 400, y: 500 }],
        bossSpawn: { x: 400, y: 150 },
      });
      mocks.generateEventsMock.mockReturnValue([
        { id: 'e1', type: 'buff', name: '加速', effect: '移速+10%',
          triggerTime: 30, duration: 10, payload: {} },
      ]);

      await roomManager.generateLevelAndEvents(room);

      // 验证广播事件被调用
      expect(mocks.toMock).toHaveBeenCalledWith('R1');
      expect(mocks.toEmitMock).toHaveBeenCalled();
      const [event, data] = mocks.toEmitMock.mock.calls[0];
      expect(event).toBe('game:level-ready');
      const levelReady = data as {
        monster: { name: string; attack: number; emotion: string };
        level: { bossPoint: { x: number } };
      };
      expect(levelReady.monster.name).toBe('KPI 噩梦兽');
      // H-01 修复：emotion 取自 stressTags[0]（压力关键词），非 weakness 描述字符串
      expect(levelReady.monster.emotion).toBe('KPI');
      // H-01 修复：attack 由 monster-generator 产出，非 room-manager 硬编码
      expect(levelReady.monster.attack).toBe(60);
      expect(levelReady.level.bossPoint).toEqual({ x: 400, y: 150 });
    });

    it('怪兽生成失败时使用兜底数据，仍广播 LEVEL_READY', async () => {
      const room: Room = {
        id: 'R1', hostId: 'u1', status: 'generating', mode: 'boss',
        players: [{ userId: 'u1', nickname: '玩家1', socketId: 's1', isReady: true }],
        stressSources: { u1: 'KPI' },
      };
      // 怪兽生成器 reject
      mocks.generateMonsterMock.mockRejectedValue(new Error('AI 不可用'));
      mocks.generateLevelMock.mockResolvedValue({
        mode: 'boss', difficulty: 1,
        destructibles: [], spawnPoints: [{ x: 0, y: 0 }],
      });
      mocks.generateEventsMock.mockReturnValue([]);

      await roomManager.generateLevelAndEvents(room);

      expect(mocks.toEmitMock).toHaveBeenCalled();
      const [, data] = mocks.toEmitMock.mock.calls[0];
      const levelReady = data as { monster: { name: string; hp: number } };
      // 兜底怪兽名称为"压力怪兽"
      expect(levelReady.monster.name).toBe('压力怪兽');
    });

    it('关卡生成失败时使用兜底数据', async () => {
      const room: Room = {
        id: 'R1', hostId: 'u1', status: 'generating', mode: 'boss',
        players: [{ userId: 'u1', nickname: '玩家1', socketId: 's1', isReady: true }],
        stressSources: { u1: 'KPI' },
      };
      mocks.generateMonsterMock.mockResolvedValue({
        name: '怪兽', hp: 1000, attack: 60, skills: [], weakness: 'stress', stressTags: ['工作压力'],
      });
      // 关卡生成器 reject
      mocks.generateLevelMock.mockRejectedValue(new Error('AI 不可用'));
      mocks.generateEventsMock.mockReturnValue([]);

      await roomManager.generateLevelAndEvents(room);

      const [, data] = mocks.toEmitMock.mock.calls[0];
      const levelReady = data as { level: { spawnPoints: Array<{ x: number }> } };
      // 兜底关卡 spawnPoints 为 2 个固定出生点
      expect(levelReady.level.spawnPoints).toHaveLength(2);
    });

    it('事件生成失败时使用空数组兜底', async () => {
      const room: Room = {
        id: 'R1', hostId: 'u1', status: 'generating', mode: 'boss',
        players: [{ userId: 'u1', nickname: '玩家1', socketId: 's1', isReady: true }],
        stressSources: { u1: 'KPI' },
      };
      mocks.generateMonsterMock.mockResolvedValue({
        name: '怪兽', hp: 1000, attack: 60, skills: [], weakness: 'stress', stressTags: ['工作压力'],
      });
      mocks.generateLevelMock.mockResolvedValue({
        mode: 'boss', difficulty: 1,
        destructibles: [], spawnPoints: [{ x: 0, y: 0 }],
      });
      // 事件生成器 reject
      mocks.generateEventsMock.mockImplementation(() => {
        throw new Error('AI 不可用');
      });

      await roomManager.generateLevelAndEvents(room);

      const [, data] = mocks.toEmitMock.mock.calls[0];
      const levelReady = data as { events: unknown[] };
      expect(levelReady.events).toEqual([]);
    });
  });

  describe('updateRoomStatus 更新房间状态', () => {
    it('房间不存在时返回 null', async () => {
      mocks.getMock.mockResolvedValue(null);

      const result = await roomManager.updateRoomStatus('NOPE', 'playing');

      expect(result).toBeNull();
    });

    it('更新成功：写入新状态并返回 room', async () => {
      const existing: Room = {
        id: 'R1', hostId: 'u1', status: 'waiting', mode: 'boss',
        players: [], stressSources: {},
      };
      mocks.getMock.mockResolvedValue(JSON.stringify(existing));

      const result = await roomManager.updateRoomStatus('R1', 'playing');

      expect(result!.status).toBe('playing');
      expect(mocks.setexMock).toHaveBeenCalledOnce();
    });
  });

  describe('broadcast 广播事件', () => {
    it('调用 io.to(roomId).emit(event, data) 链式接口', () => {
      roomManager.broadcast('R1', 'game:start', { foo: 'bar' });

      expect(mocks.toMock).toHaveBeenCalledWith('R1');
      expect(mocks.toEmitMock).toHaveBeenCalledWith('game:start', { foo: 'bar' });
    });
  });
});
