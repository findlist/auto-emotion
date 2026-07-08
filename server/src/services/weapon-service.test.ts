// server/src/services/weapon-service.test.ts
// 武器服务单元测试：覆盖列表查询、升级事务（4 分支）、装备事务（2 分支）、购买事务（4 分支）
// 设计原因：upgradeWeapon/equipWeapon/buyWeapon 均涉及金币扣减与装备状态变更，是数据一致性风险点，
// 逐分支覆盖异常路径与 ROLLBACK 释放；buyWeapon 中武器不存在需前置拦截，避免后续无效查询。
// mock 策略：clientQueryMock 含 BEGIN/COMMIT/ROLLBACK 等事务语句，mockResolvedValueOnce 的 FIFO
// 队列会被事务语句消耗导致顺序错位，故采用 mockImplementation 按 SQL 文本区分返回值，稳健且可读。

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCode } from '../utils/error.js';

// 使用 vi.hoisted 提升 mock，确保 vi.mock 工厂能引用
const mocks = vi.hoisted(() => ({
  // pool.query：非事务查询（listWeapons）
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

import { listWeapons, upgradeWeapon, equipWeapon, buyWeapon } from './weapon-service.js';

describe('weapon-service 武器服务', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectMock.mockResolvedValue({
      query: mocks.clientQueryMock,
      release: mocks.releaseMock,
    });
    mocks.queryMock.mockResolvedValue({ rows: [] });
    mocks.clientQueryMock.mockResolvedValue({ rows: [] });
  });

  describe('listWeapons 武器列表', () => {
    it('返回武器列表并 LEFT JOIN user_weapons 合并用户装备状态', async () => {
      mocks.queryMock.mockResolvedValueOnce({
        rows: [
          { id: 1, name: '解压锤', level: 5, is_equipped: true, current_exp: 200 },
          { id: 2, name: '情绪飞镖', level: null, is_equipped: null, current_exp: null },
        ],
      });

      const result = await listWeapons('u1');

      expect(result).toHaveLength(2);
      // SQL 必须含 LEFT JOIN user_weapons，未拥有武器也展示
      const sql = mocks.queryMock.mock.calls[0][0];
      expect(sql).toContain('LEFT JOIN user_weapons');
      expect(sql).toContain('ORDER BY w.id');
      expect(mocks.queryMock.mock.calls[0][1]).toEqual(['u1']);
    });
  });

  describe('upgradeWeapon 升级武器', () => {
    it('未拥有该武器抛 NOT_FOUND', async () => {
      mocks.clientQueryMock.mockImplementation(() => Promise.resolve({ rows: [] }));

      await expect(upgradeWeapon('u1', 1)).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
      });
      expect(mocks.releaseMock).toHaveBeenCalled();
    });

    it('用户不存在抛 NOT_FOUND', async () => {
      mocks.clientQueryMock.mockImplementation((sql: string) => {
        if (sql.includes('FROM user_weapons')) return Promise.resolve({ rows: [{ level: 3 }] });
        if (sql.includes('FROM users')) return Promise.resolve({ rows: [] }); // 用户不存在
        return Promise.resolve({ rows: [] });
      });

      await expect(upgradeWeapon('u1', 1)).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
      });
      expect(mocks.releaseMock).toHaveBeenCalled();
    });

    it('金币不足抛 FORBIDDEN，错误信息含所需金币', async () => {
      mocks.clientQueryMock.mockImplementation((sql: string) => {
        if (sql.includes('FROM user_weapons')) return Promise.resolve({ rows: [{ level: 5 }] }); // level=5
        if (sql.includes('FROM users')) return Promise.resolve({ rows: [{ gold: 100 }] }); // 金币 100
        return Promise.resolve({ rows: [] });
      });

      // weaponUpgradeCost(5) = { gold: 50*25=1250, fragments: 50 }，用户 100 不足
      await expect(upgradeWeapon('u1', 1)).rejects.toMatchObject({
        code: ErrorCode.FORBIDDEN,
        message: expect.stringContaining('1250'),
      });
      expect(mocks.releaseMock).toHaveBeenCalled();
    });

    it('成功路径：扣金币 + 升级，返回 newLevel 与 cost', async () => {
      const updateUsersCall = vi.fn();
      const updateUserWeaponsCall = vi.fn();
      mocks.clientQueryMock.mockImplementation((sql: string, params?: unknown[]) => {
        if (sql.includes('FROM user_weapons')) return Promise.resolve({ rows: [{ level: 3 }] }); // level=3
        if (sql.includes('FROM users')) return Promise.resolve({ rows: [{ gold: 2000 }] }); // 金币充足
        if (sql.includes('UPDATE users SET gold')) {
          updateUsersCall(sql, params);
          // RETURNING gold 需返回非空 rows 表示原子守卫通过（2000-450=1550）
          return Promise.resolve({ rows: [{ gold: 1550 }] });
        }
        if (sql.includes('UPDATE user_weapons SET level')) {
          updateUserWeaponsCall(sql, params);
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] }); // BEGIN/COMMIT
      });

      const result = await upgradeWeapon('u1', 1);

      // weaponUpgradeCost(3) = { gold: 50*9=450, fragments: 30 }
      expect(updateUsersCall).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET gold'),
        [450, 'u1']
      );
      // UPDATE user_weapons 参数：[fragments, userId, weaponId]
      expect(updateUserWeaponsCall).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE user_weapons SET level = level + 1'),
        [30, 'u1', 1]
      );
      const sqls = mocks.clientQueryMock.mock.calls.map(([sql]) => sql);
      expect(sqls[0]).toBe('BEGIN');
      expect(sqls.at(-1)).toBe('COMMIT');
      expect(result).toEqual({
        success: true,
        newLevel: 4,
        cost: { gold: 450, fragments: 30 },
      });
      expect(mocks.releaseMock).toHaveBeenCalled();
    });
  });

  describe('equipWeapon 装备武器', () => {
    it('未拥有该武器抛 NOT_FOUND', async () => {
      mocks.clientQueryMock.mockImplementation(() => Promise.resolve({ rows: [] }));

      await expect(equipWeapon('u1', 1)).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
      });
      expect(mocks.releaseMock).toHaveBeenCalled();
    });

    it('成功路径：取消当前装备 + 装备新武器 + 更新 characters', async () => {
      const updateCalls: Array<[string, unknown[]]> = [];
      mocks.clientQueryMock.mockImplementation((sql: string, params?: unknown[]) => {
        if (sql.includes('FROM user_weapons')) return Promise.resolve({ rows: [{ level: 1 }] });
        if (sql.includes('UPDATE user_weapons')) {
          updateCalls.push([sql, params ?? []]);
          return Promise.resolve({ rows: [] });
        }
        if (sql.includes('UPDATE characters')) {
          updateCalls.push([sql, params ?? []]);
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] }); // BEGIN/COMMIT
      });

      const result = await equipWeapon('u1', 2);

      // 三次 UPDATE：取消当前装备 → 装备新武器 → 更新 characters.weapon_id
      expect(updateCalls).toHaveLength(3);
      // 第一次：取消所有装备 WHERE user_id
      expect(updateCalls[0][0]).toContain('is_equipped = FALSE');
      expect(updateCalls[0][1]).toEqual(['u1']);
      // 第二次：装备新武器 WHERE user_id AND weapon_id
      expect(updateCalls[1][0]).toContain('is_equipped = TRUE');
      expect(updateCalls[1][1]).toEqual(['u1', 2]);
      // 第三次：更新 characters.weapon_id
      expect(updateCalls[2][0]).toContain('UPDATE characters SET weapon_id');
      expect(updateCalls[2][1]).toEqual([2, 'u1']);
      const sqls = mocks.clientQueryMock.mock.calls.map(([sql]) => sql);
      expect(sqls[0]).toBe('BEGIN');
      expect(sqls.at(-1)).toBe('COMMIT');
      expect(result).toEqual({ success: true, weaponId: 2 });
      expect(mocks.releaseMock).toHaveBeenCalled();
    });
  });

  describe('buyWeapon 购买武器', () => {
    it('武器不存在抛 NOT_FOUND', async () => {
      mocks.clientQueryMock.mockImplementation(() => Promise.resolve({ rows: [] }));

      await expect(buyWeapon('u1', 999)).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
      });
      expect(mocks.releaseMock).toHaveBeenCalled();
    });

    it('已拥有该武器抛 CONFLICT', async () => {
      mocks.clientQueryMock.mockImplementation((sql: string) => {
        if (sql.includes('FROM weapons')) return Promise.resolve({ rows: [{ id: 1, name: '解压锤', unlock_cost_gold: 500 }] });
        if (sql.includes('FROM user_weapons')) return Promise.resolve({ rows: [{ user_id: 'u1', weapon_id: 1 }] });
        return Promise.resolve({ rows: [] });
      });

      await expect(buyWeapon('u1', 1)).rejects.toMatchObject({
        code: ErrorCode.CONFLICT,
      });
      expect(mocks.releaseMock).toHaveBeenCalled();
    });

    it('金币不足抛 FORBIDDEN，错误信息含所需金币', async () => {
      mocks.clientQueryMock.mockImplementation((sql: string) => {
        if (sql.includes('FROM weapons')) return Promise.resolve({ rows: [{ id: 1, unlock_cost_gold: 1000 }] });
        if (sql.includes('FROM user_weapons')) return Promise.resolve({ rows: [] }); // 未拥有
        if (sql.includes('FROM users')) return Promise.resolve({ rows: [{ gold: 100 }] }); // 金币不足
        return Promise.resolve({ rows: [] });
      });

      await expect(buyWeapon('u1', 1)).rejects.toMatchObject({
        code: ErrorCode.FORBIDDEN,
        message: expect.stringContaining('1000'),
      });
      expect(mocks.releaseMock).toHaveBeenCalled();
    });

    it('成功路径：扣金币 + 创建 user_weapons 记录', async () => {
      const updateUsersCall = vi.fn();
      const insertCall = vi.fn();
      mocks.clientQueryMock.mockImplementation((sql: string, params?: unknown[]) => {
        if (sql.includes('FROM weapons')) return Promise.resolve({ rows: [{ id: 1, unlock_cost_gold: 500 }] });
        if (sql.includes('FROM user_weapons')) return Promise.resolve({ rows: [] }); // 未拥有
        if (sql.includes('FROM users')) return Promise.resolve({ rows: [{ gold: 2000 }] }); // 金币充足
        if (sql.includes('UPDATE users SET gold')) {
          updateUsersCall(sql, params);
          // RETURNING gold 需返回非空 rows 表示原子守卫通过（2000-500=1500）
          return Promise.resolve({ rows: [{ gold: 1500 }] });
        }
        if (sql.includes('INSERT INTO user_weapons')) {
          insertCall(sql, params);
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] }); // BEGIN/COMMIT
      });

      const result = await buyWeapon('u1', 1);

      // 扣金币参数：[unlock_cost_gold, userId]
      expect(updateUsersCall).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET gold'),
        [500, 'u1']
      );
      // INSERT 参数：[userId, weaponId]，level=1 与 is_equipped=FALSE 为 SQL 字面量
      expect(insertCall).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_weapons'),
        ['u1', 1]
      );
      const sqls = mocks.clientQueryMock.mock.calls.map(([sql]) => sql);
      expect(sqls[0]).toBe('BEGIN');
      expect(sqls.at(-1)).toBe('COMMIT');
      expect(result).toEqual({ success: true, weaponId: 1 });
      expect(mocks.releaseMock).toHaveBeenCalled();
    });
  });
});
