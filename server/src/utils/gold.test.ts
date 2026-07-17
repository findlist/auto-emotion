// server/src/utils/gold.test.ts
// deductGold 单元测试：覆盖扣减成功与扣减失败（rows.length === 0）两个核心分支

import { describe, it, expect, vi } from 'vitest';
import { deductGold } from './gold.js';
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

