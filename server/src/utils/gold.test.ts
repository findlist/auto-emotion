// server/src/utils/gold.test.ts
// deductGold 单元测试：覆盖扣减成功与扣减失败（rows.length === 0）两个核心分支
// getUserGold 单元测试：覆盖用户存在返回金币与用户不存在抛 NOT_FOUND 两个核心分支
// addExperienceAndGold 单元测试：覆盖 SQL 文本与参数顺序、返回 void 两个核心分支

import { describe, it, expect, vi } from 'vitest';
import { deductGold, getUserGold, addExperienceAndGold } from './gold.js';
import { ErrorCode } from './error.js';
import type { Tx } from './transaction.js';

// 模拟 tx 对象：仅暴露 query 方法
// Tx 类型来自 Pick<PoolClient, 'query'>，含 pg 的复杂重载签名，
// 测试中用 as unknown as Tx 绕过重载匹配，聚焦验证 SQL 文本与参数顺序
function makeTx(queryImpl: ReturnType<typeof vi.fn>): Tx {
  return { query: queryImpl } as unknown as Tx;
}

describe('deductGold 金币原子扣减', () => {
  it('扣减成功返回新余额，SQL 包含原子守卫 AND gold >= $1', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ gold: 400 }] });
    const tx = makeTx(query);

    const result = await deductGold(tx, 'u1', 100);

    expect(query).toHaveBeenCalledWith(
      `UPDATE users SET gold = gold - $1 WHERE id = $2 AND gold >= $1 RETURNING gold`,
      [100, 'u1']
    );
    expect(result).toBe(400);
  });

  it('rows.length === 0 时抛 FORBIDDEN，错误信息含所需金额', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const tx = makeTx(query);

    await expect(deductGold(tx, 'u1', 500)).rejects.toMatchObject({
      code: ErrorCode.FORBIDDEN,
      message: '金币不足，需要 500 金币',
    });
  });

  it('参数顺序为 [amount, userId]，与原 service 模板一致', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ gold: 0 }] });
    const tx = makeTx(query);

    await deductGold(tx, 'user-xyz', 999);

    expect(query).toHaveBeenCalledWith(
      expect.any(String),
      [999, 'user-xyz']
    );
  });
});

describe('getUserGold 查询用户金币', () => {
  it('用户存在时返回金币余额，SQL 为 SELECT gold FROM users', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ gold: 800 }] });
    const tx = makeTx(query);

    const result = await getUserGold(tx, 'u1');

    expect(query).toHaveBeenCalledWith(
      `SELECT gold FROM users WHERE id = $1`,
      ['u1']
    );
    expect(result).toBe(800);
  });

  it('rows.length === 0 时抛 NOT_FOUND，统一 weapon-service 既有契约', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const tx = makeTx(query);

    await expect(getUserGold(tx, 'u1')).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
      message: '用户不存在',
    });
  });

  it('参数顺序为 [userId]，与原 4 处 service 模板一致', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ gold: 0 }] });
    const tx = makeTx(query);

    await getUserGold(tx, 'user-xyz');

    expect(query).toHaveBeenCalledWith(
      expect.any(String),
      ['user-xyz']
    );
  });
});

describe('addExperienceAndGold 累加经验与金币', () => {
  it('SQL 为 UPDATE users SET experience/gold 累加模板，参数顺序为 [exp, gold, userId]', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const tx = makeTx(query);

    await addExperienceAndGold(tx, 'user-xyz', 150, 80);

    expect(query).toHaveBeenCalledWith(
      `UPDATE users SET experience = experience + $1, gold = gold + $2 WHERE id = $3`,
      [150, 80, 'user-xyz']
    );
  });

  it('返回 void，与 3 处调用点未使用返回值的语义一致', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const tx = makeTx(query);

    const result = await addExperienceAndGold(tx, 'u1', 100, 50);

    expect(result).toBeUndefined();
  });
});

