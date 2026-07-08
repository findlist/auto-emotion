// server/src/services/settle-service.test.ts
// 游戏结算服务单元测试：覆盖幂等检查、MVP 排序、奖励倍率、事务边界与字段写入
// 设计原因：结算服务涉及资金/经验变更，事务边界与幂等性是核心质量风险点，必须通过 mock 验证契约

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCode } from '../utils/error.js';
import type { GameMode } from '../types/game.js';

// 使用 vi.hoisted 提升事务客户端 mock，确保 vi.mock 工厂能引用到
// 设计原因：vi.mock 工厂在模块导入前执行，普通变量无法被工厂闭包捕获
const mocks = vi.hoisted(() => ({
  // pool.query：幂等检查入口
  queryMock: vi.fn(),
  // 事务客户端的 query：BEGIN/INSERT/UPDATE/COMMIT/ROLLBACK
  clientQueryMock: vi.fn(),
  // 事务客户端 release：归还连接，泄漏会导致连接池耗尽
  releaseMock: vi.fn(),
  // pool.connect：获取事务客户端
  connectMock: vi.fn(),
}));

vi.mock('../config/database.js', () => ({
  default: {
    query: mocks.queryMock,
    connect: mocks.connectMock,
  },
}));

import { settleGame } from './settle-service.js';

// 构造标准对局输入：两个玩家，分数与伤害不同以便验证排序
function buildInput(mode: GameMode = 'boss') {
  return {
    roomId: 'room-1',
    mode,
    durationSeconds: 180,
    players: [
      { userId: 'u1', nickname: '玩家1', score: 100, damage: 500, isMvp: false },
      { userId: 'u2', nickname: '玩家2', score: 200, damage: 300, isMvp: false },
    ],
  };
}

// 让事务客户端按 SQL 文本区分返回：game_records 插入需返回 id，其余空行
// 设计原因：settleGame 依赖 recordResult.rows[0].id 继续写入玩家记录，必须 mock 出 id
function setupClientQueryReturningRecordId(recordId = 'record-1') {
  mocks.clientQueryMock.mockImplementation((sql: string) => {
    if (typeof sql === 'string' && sql.includes('INSERT INTO game_records')) {
      return Promise.resolve({ rows: [{ id: recordId }] });
    }
    return Promise.resolve({ rows: [] });
  });
}

// 按调用顺序提取所有 SQL 文本，便于断言事务执行序列
function getSqls(): string[] {
  return mocks.clientQueryMock.mock.calls.map(([sql]) => sql as string);
}

describe('settle-service 游戏结算服务', () => {
  beforeEach(() => {
    // clearAllMocks 会清空 mock 实现与调用记录，需重新补回 connect 的默认返回值
    vi.clearAllMocks();
    mocks.connectMock.mockResolvedValue({
      query: mocks.clientQueryMock,
      release: mocks.releaseMock,
    });
    setupClientQueryReturningRecordId();
  });

  describe('幂等检查', () => {
    it('房间已结算时抛 CONFLICT "该房间已结算"，不获取事务客户端', async () => {
      mocks.queryMock.mockResolvedValue({ rows: [{ id: 'existing-record' }] });

      await expect(settleGame(buildInput())).rejects.toMatchObject({
        code: ErrorCode.CONFLICT,
        message: '该房间已结算',
      });
      // 幂等命中不应再开启事务，避免重复写入
      expect(mocks.connectMock).not.toHaveBeenCalled();
    });

    it('房间未结算时放行进入事务流程', async () => {
      mocks.queryMock.mockResolvedValue({ rows: [] });

      await settleGame(buildInput());

      expect(mocks.connectMock).toHaveBeenCalledOnce();
      const sqls = getSqls();
      // BEGIN 与 COMMIT 必然成对出现，保证事务边界完整
      expect(sqls[0]).toBe('BEGIN');
      expect(sqls[sqls.length - 1]).toBe('COMMIT');
    });
  });

  describe('MVP 排序逻辑', () => {
    it('boss 模式按伤害降序排序，伤害最高者为 MVP', async () => {
      mocks.queryMock.mockResolvedValue({ rows: [] });
      // 玩家1伤害500 > 玩家2伤害300，按伤害排序玩家1为MVP
      await settleGame(buildInput('boss'));

      const inserts = mocks.clientQueryMock.mock.calls.filter(
        ([sql]) => (sql as string).includes('INSERT INTO game_record_players')
      );
      // for...of 按 sortedPlayers 顺序遍历，第一次插入即 MVP
      const firstParams = inserts[0][1] as unknown[];
      expect(firstParams[1]).toBe('u1'); // user_id
      expect(firstParams[6]).toBe(true); // is_mvp
    });

    it('非 boss 模式按分数降序排序，分数最高者为 MVP', async () => {
      mocks.queryMock.mockResolvedValue({ rows: [] });
      // 玩家2 score=200 > 玩家1 score=100，按分数排序玩家2为MVP
      await settleGame(buildInput('brawl'));

      const inserts = mocks.clientQueryMock.mock.calls.filter(
        ([sql]) => (sql as string).includes('INSERT INTO game_record_players')
      );
      const firstParams = inserts[0][1] as unknown[];
      expect(firstParams[1]).toBe('u2'); // user_id
      expect(firstParams[6]).toBe(true); // is_mvp
    });
  });

  describe('奖励倍率与 MVP 加成', () => {
    it('boss 模式奖励倍率 2x，MVP 额外 1.5x', async () => {
      mocks.queryMock.mockResolvedValue({ rows: [] });
      // baseExp = floor(50*2) = 100，MVP exp = floor(100*1.5) = 150
      // baseGold = floor(30*2) = 60，MVP gold = floor(60*1.5) = 90
      await settleGame(buildInput('boss'));

      const userUpdates = mocks.clientQueryMock.mock.calls.filter(
        ([sql]) => (sql as string).includes('UPDATE users')
      );
      // for...of 按 sortedPlayers 顺序，第一个 UPDATE 对应 MVP
      const mvpParams = userUpdates[0][1] as unknown[];
      expect(mvpParams[0]).toBe(150); // exp_reward
      expect(mvpParams[1]).toBe(90); // gold_reward
    });

    it('brawl 模式奖励倍率 1.5x', async () => {
      mocks.queryMock.mockResolvedValue({ rows: [] });
      // baseExp = floor(50*1.5) = 75，MVP exp = floor(75*1.5) = 112
      await settleGame(buildInput('brawl'));

      const userUpdates = mocks.clientQueryMock.mock.calls.filter(
        ([sql]) => (sql as string).includes('UPDATE users')
      );
      const mvpParams = userUpdates[0][1] as unknown[];
      expect(mvpParams[0]).toBe(112);
    });

    it('其他模式奖励倍率 1x', async () => {
      mocks.queryMock.mockResolvedValue({ rows: [] });
      // baseExp = floor(50*1) = 50，MVP exp = floor(50*1.5) = 75
      await settleGame(buildInput('speed'));

      const userUpdates = mocks.clientQueryMock.mock.calls.filter(
        ([sql]) => (sql as string).includes('UPDATE users')
      );
      const mvpParams = userUpdates[0][1] as unknown[];
      expect(mvpParams[0]).toBe(75);
    });
  });

  describe('事务边界与字段写入', () => {
    it('事务成功路径：按 BEGIN → 写记录 → 写玩家 → 更新用户 → COMMIT 顺序执行，2 玩家各 2 次写入', async () => {
      mocks.queryMock.mockResolvedValue({ rows: [] });
      await settleGame(buildInput('boss'));

      const sqls = getSqls();
      // BEGIN 在最前，COMMIT 在最后，构成完整事务边界
      expect(sqls[0]).toBe('BEGIN');
      expect(sqls[sqls.length - 1]).toBe('COMMIT');
      // 2 个玩家 → 2 次 INSERT game_record_players + 2 次 UPDATE users
      const playerInserts = sqls.filter((s) => s.includes('INSERT INTO game_record_players')).length;
      const userUpdates = sqls.filter((s) => s.includes('UPDATE users')).length;
      expect(playerInserts).toBe(2);
      expect(userUpdates).toBe(2);
      // 无论成功失败都应释放连接，避免连接池泄漏
      expect(mocks.releaseMock).toHaveBeenCalledOnce();
    });

    it('game_records 写入 total_score 为全体玩家分数之和', async () => {
      mocks.queryMock.mockResolvedValue({ rows: [] });
      // 100 + 200 = 300
      await settleGame(buildInput('boss'));

      const recordInsert = mocks.clientQueryMock.mock.calls.find(
        ([sql]) => (sql as string).includes('INSERT INTO game_records')
      );
      // find 可能返回 undefined，本用例 INSERT game_records 必然被调用，显式断言存在后再访问
      expect(recordInsert).toBeDefined();
      const params = recordInsert![1] as unknown[];
      expect(params[3]).toBe(300);
    });

    it('users 更新 pvp_points = floor(score / 100)', async () => {
      mocks.queryMock.mockResolvedValue({ rows: [] });
      // boss 模式 MVP 是玩家1(score=100)，第二是玩家2(score=200)
      await settleGame(buildInput('boss'));

      const userUpdates = mocks.clientQueryMock.mock.calls.filter(
        ([sql]) => (sql as string).includes('UPDATE users')
      );
      // 参数顺序：[exp, gold, pvp_points, userId]
      // 玩家1 score=100 → pvp_points += 1；玩家2 score=200 → pvp_points += 2
      const params1 = userUpdates[0][1] as unknown[];
      const params2 = userUpdates[1][1] as unknown[];
      expect(params1[2]).toBe(1);
      expect(params2[2]).toBe(2);
    });

    it('事务中途抛错时执行 ROLLBACK 并释放连接，错误透传', async () => {
      mocks.queryMock.mockResolvedValue({ rows: [] });
      // 让 UPDATE users 抛错，模拟事务中途失败
      mocks.clientQueryMock.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('INSERT INTO game_records')) {
          return Promise.resolve({ rows: [{ id: 'record-1' }] });
        }
        if (typeof sql === 'string' && sql.includes('UPDATE users')) {
          return Promise.reject(new Error('连接中断'));
        }
        return Promise.resolve({ rows: [] });
      });

      await expect(settleGame(buildInput('boss'))).rejects.toThrow('连接中断');

      const sqls = getSqls();
      // 失败路径必须以 ROLLBACK 收尾，不能误用 COMMIT
      expect(sqls[sqls.length - 1]).toBe('ROLLBACK');
      // finally 块确保连接释放，异常路径也不应泄漏
      expect(mocks.releaseMock).toHaveBeenCalledOnce();
    });
  });
});
