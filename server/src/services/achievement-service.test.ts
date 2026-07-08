// server/src/services/achievement-service.test.ts
// 成就服务单元测试：覆盖成就初始化、进度合并、进度更新（已有/新增/已完成跳过）、奖励领取事务
// 设计原因：claimAchievementReward 涉及事务化奖励发放，是数据一致性风险点；
// updateAchievementProgress 含 UPDATE/INSERT 分支与 completed 边界判定，需逐项覆盖；
// ensureAchievementsExist 通过 getAchievements 间接验证 count=0 初始化与 count>0 跳过两条路径。

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCode } from '../utils/error.js';

// 使用 vi.hoisted 提升 mock，确保 vi.mock 工厂能引用
// 设计原因：vi.mock 工厂在模块导入前执行，普通变量无法被工厂闭包捕获
const mocks = vi.hoisted(() => ({
  // pool.query：非事务查询入口（成就查询、用户进度查询、初始化 INSERT）
  queryMock: vi.fn(),
  // 事务客户端的 query：BEGIN/UPDATE/INSERT/COMMIT/ROLLBACK
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

import {
  getAchievements,
  updateAchievementProgress,
  claimAchievementReward,
} from './achievement-service.js';

describe('achievement-service 成就服务', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 事务客户端默认返回空行，单测可按需覆盖
    mocks.connectMock.mockResolvedValue({
      query: mocks.clientQueryMock,
      release: mocks.releaseMock,
    });
    mocks.queryMock.mockResolvedValue({ rows: [] });
    mocks.clientQueryMock.mockResolvedValue({ rows: [] });
  });

  describe('getAchievements 成就列表', () => {
    it('count>0 跳过初始化，合并用户进度与默认值', async () => {
      // 第一次 query：SELECT COUNT 成就模板已存在
      mocks.queryMock.mockResolvedValueOnce({ rows: [{ count: '2' }] });
      // 第二次 query：SELECT 成就列表
      mocks.queryMock.mockResolvedValueOnce({
        rows: [
          { id: 1, code: 'first_battle', name: '初次解压', description: '完成首局对战', type: 0, target: 1, reward_type: 'skin', reward_id: 1 },
          { id: 2, code: 'battle_100', name: '百战不殆', description: '累计100局对战', type: 0, target: 100, reward_type: 'pet', reward_id: 3 },
        ],
      });
      // 第三次 query：SELECT 用户进度（仅成就1有进度）
      mocks.queryMock.mockResolvedValueOnce({
        rows: [{ achievement_id: 1, progress: 1, completed: true, claimed: false }],
      });

      const result = await getAchievements('u1');

      // 成就1：合并用户进度
      expect(result[0]).toMatchObject({ id: 1, progress: 1, completed: true, claimed: false });
      // 成就2：无用户进度，使用默认值
      expect(result[1]).toMatchObject({ id: 2, progress: 0, completed: false, claimed: false });
      // 仅 3 次查询：count + 成就列表 + 用户进度，未触发 INSERT
      expect(mocks.queryMock).toHaveBeenCalledTimes(3);
    });

    it('count=0 触发模板批量初始化', async () => {
      // count=0 → 循环 INSERT 10 个模板 → 成就列表 → 用户进度
      // 设计原因：mockResolvedValueOnce 是 FIFO 队列，10 次 INSERT 会消耗后续 mock 值，
      // 改用 mockImplementation 按 SQL 文本区分返回，避免精确计数调用顺序的脆弱性。
      mocks.queryMock.mockImplementation((sql: string) => {
        if (sql.includes('SELECT COUNT')) return Promise.resolve({ rows: [{ count: '0' }] });
        if (sql.includes('INSERT INTO achievements')) return Promise.resolve({ rows: [] });
        if (sql.includes('FROM achievements ORDER BY')) return Promise.resolve({ rows: [{ id: 1 }] });
        return Promise.resolve({ rows: [] }); // 用户进度查询等默认空
      });

      const result = await getAchievements('u1');

      // INSERT 模板调用 10 次（模板表内置 10 条）
      const insertCalls = mocks.queryMock.mock.calls.filter(([sql]) =>
        typeof sql === 'string' && sql.includes('INSERT INTO achievements')
      );
      expect(insertCalls).toHaveLength(10);
      // 返回值含成就列表查询结果（getAchievements 的 map 会补全默认字段，此处只校验 id）
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });
  });

  describe('updateAchievementProgress 进度更新', () => {
    it('已完成的成就跳过更新', async () => {
      mocks.queryMock.mockResolvedValueOnce({
        rows: [{ id: 1, target: 100, progress: 100, completed: true, user_achievement_id: 5 }],
      });

      await updateAchievementProgress('u1', 0, 10);

      // 仅类型查询 1 次，无后续 UPDATE/INSERT
      expect(mocks.queryMock).toHaveBeenCalledTimes(1);
    });

    it('已有记录走 UPDATE 路径，未达目标 completed=false', async () => {
      mocks.queryMock.mockResolvedValueOnce({
        rows: [{ id: 1, target: 100, progress: 50, completed: false, user_achievement_id: 5 }],
      });

      await updateAchievementProgress('u1', 0, 30);

      // newProgress = 50 + 30 = 80, completed = 80 >= 100 ? false
      expect(mocks.queryMock).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE user_achievements'),
        [80, false, 5]
      );
    });

    it('已有记录达到目标 completed=true', async () => {
      mocks.queryMock.mockResolvedValueOnce({
        rows: [{ id: 1, target: 100, progress: 50, completed: false, user_achievement_id: 5 }],
      });

      await updateAchievementProgress('u1', 0, 60);

      // newProgress = 110, completed = 110 >= 100 ? true
      expect(mocks.queryMock).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE user_achievements'),
        [110, true, 5]
      );
    });

    it('无记录走 INSERT 路径', async () => {
      mocks.queryMock.mockResolvedValueOnce({
        rows: [{ id: 1, target: 100, progress: 0, completed: false, user_achievement_id: null }],
      });

      await updateAchievementProgress('u1', 0, 30);

      expect(mocks.queryMock).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_achievements'),
        ['u1', 1, 30, false]
      );
    });

    it('多个成就循环：已完成跳过、已有 UPDATE、无记录 INSERT 并存', async () => {
      mocks.queryMock.mockResolvedValueOnce({
        rows: [
          { id: 1, target: 100, progress: 100, completed: true, user_achievement_id: 5 }, // 跳过
          { id: 2, target: 50, progress: 20, completed: false, user_achievement_id: 6 }, // UPDATE
          { id: 3, target: 10, progress: 0, completed: false, user_achievement_id: null }, // INSERT
        ],
      });

      await updateAchievementProgress('u1', 0, 5);

      // 共 3 次调用：1 次类型查询 + 1 次 UPDATE + 1 次 INSERT
      expect(mocks.queryMock).toHaveBeenCalledTimes(3);
      // UPDATE 成就2：25, false
      expect(mocks.queryMock).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE user_achievements'),
        [25, false, 6]
      );
      // INSERT 成就3
      expect(mocks.queryMock).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_achievements'),
        ['u1', 3, 5, false]
      );
    });
  });

  describe('claimAchievementReward 领取奖励', () => {
    it('成就不存在抛 NOT_FOUND', async () => {
      mocks.queryMock.mockResolvedValueOnce({ rows: [] });

      await expect(claimAchievementReward('u1', 999)).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
      });
    });

    it('成就未完成抛 BAD_REQUEST', async () => {
      mocks.queryMock.mockResolvedValueOnce({
        rows: [{ id: 1, completed: false, claimed: false }],
      });

      await expect(claimAchievementReward('u1', 1)).rejects.toMatchObject({
        code: ErrorCode.BAD_REQUEST,
      });
    });

    it('奖励已领取抛 CONFLICT', async () => {
      mocks.queryMock.mockResolvedValueOnce({
        rows: [{ id: 1, completed: true, claimed: true }],
      });

      await expect(claimAchievementReward('u1', 1)).rejects.toMatchObject({
        code: ErrorCode.CONFLICT,
      });
    });

    it('已有 user_achievement 走 UPDATE 成功路径', async () => {
      mocks.queryMock.mockResolvedValueOnce({
        rows: [{
          id: 1, completed: true, claimed: false, user_achievement_id: 5,
          reward_type: 'skin', reward_id: 1,
        }],
      });

      const result = await claimAchievementReward('u1', 1);

      // 事务序列：BEGIN → UPDATE claimed → INSERT inventory → COMMIT
      const sqls = mocks.clientQueryMock.mock.calls.map(([sql]) => sql);
      expect(sqls[0]).toBe('BEGIN');
      expect(sqls[1]).toContain('UPDATE user_achievements SET claimed = true');
      expect(sqls[2]).toContain('INSERT INTO user_inventory');
      expect(sqls[3]).toBe('COMMIT');
      // 返回奖励信息
      expect(result).toEqual({ success: true, reward_type: 'skin', reward_id: 1 });
      // release 必须调用，避免连接泄漏
      expect(mocks.releaseMock).toHaveBeenCalled();
    });

    it('无 user_achievement 走 INSERT 成功路径', async () => {
      mocks.queryMock.mockResolvedValueOnce({
        rows: [{
          id: 1, completed: true, claimed: false, user_achievement_id: null,
          target: 100, reward_type: 'pet', reward_id: 2,
        }],
      });

      const result = await claimAchievementReward('u1', 1);

      // 事务序列：BEGIN → INSERT user_achievements（带 target 进度）→ INSERT inventory → COMMIT
      const sqls = mocks.clientQueryMock.mock.calls.map(([sql]) => sql);
      expect(sqls[0]).toBe('BEGIN');
      expect(sqls[1]).toContain('INSERT INTO user_achievements');
      // SQL 为 VALUES ($1, $2, $3, true, true)，参数仅 3 个：userId, achievementId, target
      // completed/claimed 用字面 true 直接写入，避免参数化冗余
      expect(mocks.clientQueryMock.mock.calls[1][1]).toEqual(['u1', 1, 100]);
      expect(sqls[2]).toContain('INSERT INTO user_inventory');
      expect(sqls[3]).toBe('COMMIT');
      expect(result).toEqual({ success: true, reward_type: 'pet', reward_id: 2 });
    });

    it('事务失败触发 ROLLBACK 并透传错误', async () => {
      mocks.queryMock.mockResolvedValueOnce({
        rows: [{
          id: 1, completed: true, claimed: false, user_achievement_id: 5,
          reward_type: 'skin', reward_id: 1,
        }],
      });
      // 第三步 INSERT inventory 失败
      mocks.clientQueryMock
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // UPDATE claimed
        .mockRejectedValueOnce(new Error('inventory 写入失败'));

      await expect(claimAchievementReward('u1', 1)).rejects.toThrow('inventory 写入失败');

      // 验证 ROLLBACK 调用
      const sqls = mocks.clientQueryMock.mock.calls.map(([sql]) => sql);
      expect(sqls).toContain('ROLLBACK');
      // 失败也必须 release
      expect(mocks.releaseMock).toHaveBeenCalled();
    });
  });
});
