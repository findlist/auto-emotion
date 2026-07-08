// server/src/services/skill-service.test.ts
// 技能服务单元测试：覆盖列表查询、解锁事务（5 分支）、升级事务（3 分支）、激活事务（2 分支）
// 设计原因：unlockSkill/upgradeSkill/activateSkill 均涉及金币与状态变更，是数据一致性风险点，
// 必须逐分支覆盖异常路径与 ROLLBACK 释放；所有事务内查询统一用 client.query 保证事务隔离。
// mock 策略：clientQueryMock 含 BEGIN/COMMIT/ROLLBACK 等事务语句，mockResolvedValueOnce 的 FIFO
// 队列会被事务语句消耗导致顺序错位，故采用 mockImplementation 按 SQL 文本区分返回值，稳健且可读。

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCode } from '../utils/error.js';

// 使用 vi.hoisted 提升 mock，确保 vi.mock 工厂能引用
const mocks = vi.hoisted(() => ({
  // pool.query：非事务查询（listSkills 列表查询）
  queryMock: vi.fn(),
  // 事务客户端的 query：BEGIN/UPDATE/INSERT/COMMIT/ROLLBACK + unlockSkill 内查 skills 模板
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

import { listSkills, unlockSkill, upgradeSkill, activateSkill } from './skill-service.js';

describe('skill-service 技能服务', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectMock.mockResolvedValue({
      query: mocks.clientQueryMock,
      release: mocks.releaseMock,
    });
    // 默认返回空行，单测可按需覆盖
    mocks.queryMock.mockResolvedValue({ rows: [] });
    mocks.clientQueryMock.mockResolvedValue({ rows: [] });
  });

  describe('listSkills 技能列表', () => {
    it('返回技能列表并 LEFT JOIN user_skills 合并用户进度', async () => {
      mocks.queryMock.mockResolvedValueOnce({
        rows: [
          { id: 1, name: '心平气和', level: 3, is_active: true },
          { id: 2, name: '情绪护盾', level: null, is_active: null },
        ],
      });

      const result = await listSkills('u1');

      expect(result).toHaveLength(2);
      // SQL 必须含 LEFT JOIN user_skills，未解锁技能也展示
      const sql = mocks.queryMock.mock.calls[0][0];
      expect(sql).toContain('LEFT JOIN user_skills');
      expect(sql).toContain('ORDER BY s.id');
      // 参数为 userId
      expect(mocks.queryMock.mock.calls[0][1]).toEqual(['u1']);
    });
  });

  describe('unlockSkill 解锁技能', () => {
    it('技能不存在抛 NOT_FOUND', async () => {
      // clientQueryMock 默认返回空行（beforeEach），skills 查询自动返回空行命中 NOT_FOUND

      await expect(unlockSkill('u1', 999)).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
      });
      // 抛错后必须 ROLLBACK 并 release
      const sqls = mocks.clientQueryMock.mock.calls.map(([sql]) => sql);
      expect(sqls).toContain('ROLLBACK');
      expect(mocks.releaseMock).toHaveBeenCalled();
    });

    it('已解锁该技能抛 CONFLICT', async () => {
      mocks.clientQueryMock.mockImplementation((sql: string) => {
        if (sql.includes('FROM skills')) return Promise.resolve({ rows: [{ id: 1, name: '心平气和' }] });
        if (sql.includes('FROM user_skills')) return Promise.resolve({ rows: [{ user_id: 'u1', skill_id: 1 }] });
        return Promise.resolve({ rows: [] }); // BEGIN/ROLLBACK 等
      });

      await expect(unlockSkill('u1', 1)).rejects.toMatchObject({
        code: ErrorCode.CONFLICT,
      });
      expect(mocks.releaseMock).toHaveBeenCalled();
    });

    it('角色不存在抛 NOT_FOUND', async () => {
      mocks.clientQueryMock.mockImplementation((sql: string) => {
        if (sql.includes('FROM skills')) return Promise.resolve({ rows: [{ id: 1, name: '心平气和' }] });
        // user_skills 无记录 → 继续查 characters → 无角色
        if (sql.includes('FROM characters')) return Promise.resolve({ rows: [] });
        return Promise.resolve({ rows: [] });
      });

      await expect(unlockSkill('u1', 1)).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
      });
      expect(mocks.releaseMock).toHaveBeenCalled();
    });

    it('等级不足抛 FORBIDDEN，错误信息含所需等级', async () => {
      mocks.clientQueryMock.mockImplementation((sql: string) => {
        if (sql.includes('FROM skills')) return Promise.resolve({ rows: [{ id: 2, name: '情绪护盾' }] });
        if (sql.includes('FROM characters')) return Promise.resolve({ rows: [{ level: 3 }] }); // 角色等级 3
        return Promise.resolve({ rows: [] }); // user_skills 无记录
      });

      // skillId=2 需 5 级，角色 3 级不足
      await expect(unlockSkill('u1', 2)).rejects.toMatchObject({
        code: ErrorCode.FORBIDDEN,
        message: expect.stringContaining('5'),
      });
      expect(mocks.releaseMock).toHaveBeenCalled();
    });

    it('成功路径：BEGIN → INSERT user_skills → COMMIT', async () => {
      const insertCall = vi.fn();
      mocks.clientQueryMock.mockImplementation((sql: string, params?: unknown[]) => {
        if (sql.includes('FROM skills')) return Promise.resolve({ rows: [{ id: 1, name: '心平气和' }] });
        if (sql.includes('INSERT INTO user_skills')) {
          insertCall(sql, params);
          return Promise.resolve({ rows: [] });
        }
        if (sql.includes('FROM characters')) return Promise.resolve({ rows: [{ level: 5 }] });
        return Promise.resolve({ rows: [] }); // BEGIN/COMMIT/user_skills 查询
      });

      const result = await unlockSkill('u1', 1);

      // 事务序列校验
      const sqls = mocks.clientQueryMock.mock.calls.map(([sql]) => sql);
      expect(sqls[0]).toBe('BEGIN');
      expect(sqls.at(-1)).toBe('COMMIT');
      // INSERT 参数：[userId, skillId]，level=1 与 is_active=FALSE 为 SQL 字面量
      expect(insertCall).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_skills'),
        ['u1', 1]
      );
      // 返回结果
      expect(result).toEqual({ success: true, skillId: 1 });
      expect(mocks.releaseMock).toHaveBeenCalled();
    });

    it('事务失败触发 ROLLBACK 并透传错误', async () => {
      mocks.clientQueryMock.mockImplementation((sql: string) => {
        if (sql.includes('FROM skills')) return Promise.resolve({ rows: [{ id: 1, name: '心平气和' }] });
        if (sql.includes('INSERT INTO user_skills')) {
          return Promise.reject(new Error('INSERT 失败'));
        }
        if (sql.includes('FROM characters')) return Promise.resolve({ rows: [{ level: 5 }] });
        return Promise.resolve({ rows: [] });
      });

      await expect(unlockSkill('u1', 1)).rejects.toThrow('INSERT 失败');

      const sqls = mocks.clientQueryMock.mock.calls.map(([sql]) => sql);
      expect(sqls).toContain('ROLLBACK');
      expect(mocks.releaseMock).toHaveBeenCalled();
    });
  });

  describe('upgradeSkill 升级技能', () => {
    it('未解锁该技能抛 NOT_FOUND', async () => {
      mocks.clientQueryMock.mockImplementation(() => Promise.resolve({ rows: [] })); // user_skills 无记录

      await expect(upgradeSkill('u1', 1)).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
      });
      expect(mocks.releaseMock).toHaveBeenCalled();
    });

    it('金币不足抛 FORBIDDEN，错误信息含所需金币', async () => {
      mocks.clientQueryMock.mockImplementation((sql: string) => {
        if (sql.includes('FROM user_skills')) return Promise.resolve({ rows: [{ level: 5 }] }); // 已拥有 level=5
        if (sql.includes('FROM users')) return Promise.resolve({ rows: [{ gold: 100 }] }); // 金币 100
        return Promise.resolve({ rows: [] });
      });

      // goldCost = 100 * 5 = 500，用户 100 不足
      await expect(upgradeSkill('u1', 1)).rejects.toMatchObject({
        code: ErrorCode.FORBIDDEN,
        message: expect.stringContaining('500'),
      });
      expect(mocks.releaseMock).toHaveBeenCalled();
    });

    it('成功路径：扣金币 + 升级，返回 newLevel 与 cost', async () => {
      const updateUsersCall = vi.fn();
      const updateUserSkillsCall = vi.fn();
      mocks.clientQueryMock.mockImplementation((sql: string, params?: unknown[]) => {
        if (sql.includes('FROM user_skills')) return Promise.resolve({ rows: [{ level: 3 }] }); // level=3
        if (sql.includes('FROM users')) return Promise.resolve({ rows: [{ gold: 1000 }] }); // 金币充足
        if (sql.includes('UPDATE users SET gold')) {
          updateUsersCall(sql, params);
          // RETURNING gold 需返回非空 rows 表示原子守卫通过（1000-300=700）
          return Promise.resolve({ rows: [{ gold: 700 }] });
        }
        if (sql.includes('UPDATE user_skills SET level')) {
          updateUserSkillsCall(sql, params);
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] }); // BEGIN/COMMIT
      });

      const result = await upgradeSkill('u1', 1);

      // goldCost = 100 * 3 = 300
      expect(updateUsersCall).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET gold'),
        [300, 'u1']
      );
      expect(updateUserSkillsCall).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE user_skills SET level = level + 1'),
        ['u1', 1]
      );
      // 事务序列
      const sqls = mocks.clientQueryMock.mock.calls.map(([sql]) => sql);
      expect(sqls[0]).toBe('BEGIN');
      expect(sqls.at(-1)).toBe('COMMIT');
      expect(result).toEqual({ success: true, newLevel: 4, cost: 300 });
      expect(mocks.releaseMock).toHaveBeenCalled();
    });
  });

  describe('activateSkill 激活/停用技能', () => {
    it('未解锁该技能抛 NOT_FOUND', async () => {
      mocks.clientQueryMock.mockImplementation(() => Promise.resolve({ rows: [] }));

      await expect(activateSkill('u1', 1, true)).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
      });
      expect(mocks.releaseMock).toHaveBeenCalled();
    });

    it('成功路径：UPDATE is_active 并返回新状态', async () => {
      const updateCall = vi.fn();
      mocks.clientQueryMock.mockImplementation((sql: string, params?: unknown[]) => {
        if (sql.includes('FROM user_skills')) return Promise.resolve({ rows: [{ level: 1 }] }); // 已拥有
        if (sql.includes('UPDATE user_skills SET is_active')) {
          updateCall(sql, params);
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] }); // BEGIN/COMMIT
      });

      const result = await activateSkill('u1', 1, true);

      // UPDATE 参数：[active, userId, skillId]
      expect(updateCall).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE user_skills SET is_active'),
        [true, 'u1', 1]
      );
      const sqls = mocks.clientQueryMock.mock.calls.map(([sql]) => sql);
      expect(sqls[0]).toBe('BEGIN');
      expect(sqls.at(-1)).toBe('COMMIT');
      expect(result).toEqual({ success: true, skillId: 1, isActive: true });
      expect(mocks.releaseMock).toHaveBeenCalled();
    });
  });
});
