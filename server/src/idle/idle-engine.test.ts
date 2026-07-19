// server/src/idle/idle-engine.test.ts
// 挂机引擎单元测试：覆盖收益结算、区域切换、属性升级核心路径与异常路径
// 设计原因：idle-engine 直接操作数据库事务（BEGIN/COMMIT/ROLLBACK），
// 涉及金币经验写入与升级判定，是核心质量风险点；idle-service.test.ts 已 mock 掉本模块，
// 本测试用 mock pool 直接覆盖引擎内部的事务流程与升级算法

import { describe, it, expect, vi, beforeEach } from 'vitest';

// 使用 vi.hoisted 提升 mock，确保 vi.mock 工厂能引用
const mocks = vi.hoisted(() => ({
  // pool.query：getStatus 入口查询
  queryMock: vi.fn(),
  // 事务客户端 query：BEGIN/UPDATE/COMMIT/ROLLBACK
  clientQueryMock: vi.fn(),
  // 事务客户端 release：归还连接
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

// 不 mock growth-curve，使用真实 expForLevel 测试升级算法
import { getStatus, settle, switchArea, upgradeCharacter } from './idle-engine.js';

describe('idle-engine 挂机引擎', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 事务客户端默认返回空行，单测按需覆盖
    mocks.connectMock.mockResolvedValue({
      query: mocks.clientQueryMock,
      release: mocks.releaseMock,
    });
    mocks.clientQueryMock.mockResolvedValue({ rows: [] });
    mocks.queryMock.mockResolvedValue({ rows: [] });
    // Math.random 默认返回 1（不触发碎片掉落），单测按需覆盖
    vi.spyOn(Math, 'random').mockReturnValue(1);
  });

  describe('getStatus 状态查询', () => {
    it('查询命中时返回角色状态行', async () => {
      const row = { character_id: 'c1', user_id: 'u1', level: 5, area_id: 2 };
      mocks.queryMock.mockResolvedValue({ rows: [row] });

      const result = await getStatus('u1');

      expect(result).toEqual(row);
      // 参数顺序：[userId]
      expect(mocks.queryMock.mock.calls[0][1]).toEqual(['u1']);
    });

    it('查询无结果时返回 null', async () => {
      mocks.queryMock.mockResolvedValue({ rows: [] });

      const result = await getStatus('u1');

      expect(result).toBeNull();
    });
  });

  describe('settle 在线结算', () => {
    it('角色不存在时抛 "角色不存在" 并 ROLLBACK 释放连接', async () => {
      mocks.clientQueryMock.mockResolvedValue({ rows: [] });

      await expect(settle('u1', 60)).rejects.toThrow('角色不存在');

      const sqls = mocks.clientQueryMock.mock.calls.map(([sql]) => sql as string);
      expect(sqls[0]).toBe('BEGIN');
      expect(sqls[sqls.length - 1]).toBe('ROLLBACK');
      expect(mocks.releaseMock).toHaveBeenCalledOnce();
    });

    it('正常结算无升级：累加经验金币、更新 offline_exp、不触发等级更新', async () => {
      // level=1, exp=0, efficiency=1, exp_rate=1, gold_rate=1, gold=1000, offline_exp=0
      mocks.clientQueryMock.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM characters')) {
          return Promise.resolve({
            rows: [{
              level: 1, exp: 0, efficiency: '1', exp_rate: '1', gold_rate: '1',
              gold: 1000, offline_exp: 0,
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });
      // 60 秒挂机：exp = (120/3600)*60*1*1 = 2，未达 expForLevel(1)=100 不升级
      const result = await settle('u1', 60);

      expect(result.leveledUp).toBe(false);
      expect(result.newLevel).toBe(1);
      expect(result.gainedExp).toBe(2);
      expect(result.gainedCoins).toBe(1);

      // 验证事务以 COMMIT 收尾
      const sqls = mocks.clientQueryMock.mock.calls.map(([sql]) => sql as string);
      expect(sqls[sqls.length - 1]).toBe('COMMIT');
      // 不应出现 level 更新语句（无升级）
      const levelUpdate = mocks.clientQueryMock.mock.calls.find(
        ([sql]) => typeof sql === 'string' && sql.includes('SET level ='),
      );
      expect(levelUpdate).toBeUndefined();
    });

    it('经验超过升级阈值时触发升级：更新等级并清零经验', async () => {
      // level=1, exp=90, 效率 1，挂机 60 秒得 2 经验 → 总 92 仍未达 100
      // 改为挂机 600 秒得 20 经验 → 总 110 达 100，升级到 2，剩 10
      mocks.clientQueryMock.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM characters')) {
          return Promise.resolve({
            rows: [{
              level: 1, exp: 90, efficiency: '1', exp_rate: '1', gold_rate: '1',
              gold: 1000, offline_exp: 0,
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await settle('u1', 600);

      expect(result.leveledUp).toBe(true);
      expect(result.newLevel).toBe(2);

      // 验证等级更新语句被执行
      const levelUpdate = mocks.clientQueryMock.mock.calls.find(
        ([sql]) => typeof sql === 'string' && sql.includes('SET level ='),
      );
      expect(levelUpdate).toBeDefined();
      // 参数顺序：[newLevel, currentExp(剩余), userId]
      const params = levelUpdate![1] as unknown[];
      expect(params[0]).toBe(2);
      expect(params[2]).toBe('u1');
    });

    it('碎片掉落：Math.random 命中 5% 概率时返回 1 个碎片', async () => {
      mocks.clientQueryMock.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM characters')) {
          return Promise.resolve({
            rows: [{
              level: 1, exp: 0, efficiency: '1', exp_rate: '1', gold_rate: '1',
              gold: 1000, offline_exp: 0,
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });
      // Math.random 返回 0.01 命中 < 0.05 的掉落分支
      vi.spyOn(Math, 'random').mockReturnValue(0.01);

      const result = await settle('u1', 60);

      expect(result.gainedFragments).toBe(1);
    });
  });

  describe('switchArea 切换挂机区域', () => {
    it('区域不存在时抛 "区域不存在" 并 ROLLBACK', async () => {
      mocks.clientQueryMock.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('idle_areas')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      await expect(switchArea('u1', 99)).rejects.toThrow('区域不存在');

      const sqls = mocks.clientQueryMock.mock.calls.map(([sql]) => sql as string);
      expect(sqls[sqls.length - 1]).toBe('ROLLBACK');
    });

    it('角色等级不足时抛含所需等级的提示', async () => {
      mocks.clientQueryMock.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('idle_areas')) {
          return Promise.resolve({ rows: [{ id: 2, required_level: 10 }] });
        }
        if (typeof sql === 'string' && sql.includes('FROM characters')) {
          return Promise.resolve({ rows: [{ level: 3 }] });
        }
        return Promise.resolve({ rows: [] });
      });

      await expect(switchArea('u1', 2)).rejects.toThrow('需要等级 10 才能进入此区域');
    });

    it('校验通过时更新 area_id 并 COMMIT', async () => {
      mocks.clientQueryMock.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('idle_areas')) {
          return Promise.resolve({ rows: [{ id: 2, required_level: 5 }] });
        }
        if (typeof sql === 'string' && sql.includes('FROM characters')) {
          return Promise.resolve({ rows: [{ level: 10 }] });
        }
        return Promise.resolve({ rows: [] });
      });

      await switchArea('u1', 2);

      const sqls = mocks.clientQueryMock.mock.calls.map(([sql]) => sql as string);
      expect(sqls[sqls.length - 1]).toBe('COMMIT');
      // 验证区域更新语句被执行
      const areaUpdate = mocks.clientQueryMock.mock.calls.find(
        ([sql]) => typeof sql === 'string' && sql.includes('SET area_id ='),
      );
      expect(areaUpdate).toBeDefined();
      const params = areaUpdate![1] as unknown[];
      expect(params[0]).toBe(2);
      expect(params[1]).toBe('u1');
    });

    it('角色不存在时抛 "角色不存在" 并 ROLLBACK', async () => {
      // 区域存在但角色查询无行，覆盖 switchArea 内角色缺失分支
      mocks.clientQueryMock.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('idle_areas')) {
          return Promise.resolve({ rows: [{ id: 2, required_level: 5 }] });
        }
        return Promise.resolve({ rows: [] });
      });

      await expect(switchArea('u1', 2)).rejects.toThrow('角色不存在');

      const sqls = mocks.clientQueryMock.mock.calls.map(([sql]) => sql as string);
      expect(sqls[sqls.length - 1]).toBe('ROLLBACK');
    });
  });

  describe('upgradeCharacter 升级属性', () => {
    it('金币不足时抛含所需金币的提示并 ROLLBACK', async () => {
      // level=5 → goldCost = 50*5*5 = 1250，gold=100 不足
      mocks.clientQueryMock.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM characters')) {
          return Promise.resolve({ rows: [{ level: 5, gold: 100 }] });
        }
        return Promise.resolve({ rows: [] });
      });

      await expect(upgradeCharacter('u1', 'attack')).rejects.toThrow('金币不足，需要 1250 金币');

      const sqls = mocks.clientQueryMock.mock.calls.map(([sql]) => sql as string);
      expect(sqls[sqls.length - 1]).toBe('ROLLBACK');
    });

    it('角色不存在时抛 "角色不存在" 并 ROLLBACK', async () => {
      mocks.clientQueryMock.mockResolvedValue({ rows: [] });

      await expect(upgradeCharacter('u1', 'attack')).rejects.toThrow('角色不存在');

      const sqls = mocks.clientQueryMock.mock.calls.map(([sql]) => sql as string);
      expect(sqls[sqls.length - 1]).toBe('ROLLBACK');
    });

    it('attack 升级成功：扣除金币、属性 +2、返回 newValue', async () => {
      // level=2 → goldCost = 50*2*2 = 200，gold=1000 充足
      mocks.clientQueryMock.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM characters')) {
          return Promise.resolve({ rows: [{ level: 2, gold: 1000, attack: 10 }] });
        }
        // 模拟 deductGold 的 UPDATE...RETURNING gold 返回扣减后余额（1000-200=800），
        // 符合真实 SQL RETURNING 语义；空 rows 会被 deductGold 误判为余额不足抛 FORBIDDEN
        if (typeof sql === 'string' && sql.includes('RETURNING gold')) {
          return Promise.resolve({ rows: [{ gold: 800 }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await upgradeCharacter('u1', 'attack');

      expect(result.success).toBe(true);
      expect(result.newValue).toBe(12);
      // 验证扣除金币与更新属性两条 SQL 均执行
      const goldDeduct = mocks.clientQueryMock.mock.calls.find(
        ([sql]) => typeof sql === 'string' && sql.includes('gold = gold -'),
      );
      expect(goldDeduct).toBeDefined();
      const attackUpdate = mocks.clientQueryMock.mock.calls.find(
        ([sql]) => typeof sql === 'string' && sql.includes('attack = attack + 2'),
      );
      expect(attackUpdate).toBeDefined();
      const sqls = mocks.clientQueryMock.mock.calls.map(([sql]) => sql as string);
      expect(sqls[sqls.length - 1]).toBe('COMMIT');
    });

    // 聚合覆盖剩余 5 个属性字段的增量与 SQL 片段，避免重复样板代码
    // [字段, 角色属性初始值, 期望新值, 对应 SQL setClause 片段]
    it.each<{
      field: 'hp' | 'defense' | 'crit_rate' | 'crit_damage' | 'efficiency';
      charFields: Record<string, unknown>;
      expected: number;
      sqlFragment: string;
    }>([
      { field: 'hp', charFields: { hp: 100 }, expected: 110, sqlFragment: 'hp = hp + 10' },
      { field: 'defense', charFields: { defense: 20 }, expected: 21, sqlFragment: 'defense = defense + 1' },
      { field: 'crit_rate', charFields: { crit_rate: '0.15' }, expected: 0.16, sqlFragment: 'crit_rate = crit_rate + 0.01' },
      { field: 'crit_damage', charFields: { crit_damage: '1.50' }, expected: 1.55, sqlFragment: 'crit_damage = crit_damage + 0.05' },
      { field: 'efficiency', charFields: { efficiency: '1.00' }, expected: 1.05, sqlFragment: 'efficiency = efficiency + 0.05' },
    ])('升级 $field 成功：属性按设定增量更新并 COMMIT', async ({ field, charFields, expected, sqlFragment }) => {
      mocks.clientQueryMock.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM characters')) {
          return Promise.resolve({ rows: [{ level: 2, gold: 1000, ...charFields }] });
        }
        // 同 attack 升级测试：deductGold 的 UPDATE...RETURNING gold 需返回非空 rows
        if (typeof sql === 'string' && sql.includes('RETURNING gold')) {
          return Promise.resolve({ rows: [{ gold: 800 }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await upgradeCharacter('u1', field);

      expect(result.success).toBe(true);
      // 浮点增量用 toBeCloseTo 规避精度误差，整数字段同样适用
      expect(result.newValue).toBeCloseTo(expected, 10);
      const updateSql = mocks.clientQueryMock.mock.calls.find(
        ([sql]) => typeof sql === 'string' && sql.includes(sqlFragment),
      );
      expect(updateSql).toBeDefined();
      const allSqls = mocks.clientQueryMock.mock.calls.map(([sql]) => sql as string);
      expect(allSqls[allSqls.length - 1]).toBe('COMMIT');
    });

    it('未知字段触发 default 分支抛 "无效的属性字段" 并 ROLLBACK', async () => {
      mocks.clientQueryMock.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM characters')) {
          return Promise.resolve({ rows: [{ level: 2, gold: 1000 }] });
        }
        return Promise.resolve({ rows: [] });
      });

      // 类型断言绕过 TS 字面量校验，覆盖 switch default 防御分支
      await expect(upgradeCharacter('u1', 'unknown' as 'hp')).rejects.toThrow('无效的属性字段');

      const sqls = mocks.clientQueryMock.mock.calls.map(([sql]) => sql as string);
      expect(sqls[sqls.length - 1]).toBe('ROLLBACK');
    });
  });
});
