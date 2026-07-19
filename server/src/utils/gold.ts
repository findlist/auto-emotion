// server/src/utils/gold.ts
// 金币原子扣减工具：统一封装事务内并发安全的扣减守卫

import type { Tx } from './transaction.js';
import { AppError, ErrorCode } from './error.js';

/**
 * 事务内查询用户金币：SELECT gold FROM users WHERE id = $1 的统一封装。
 *
 * 设计原因：4 个 service（pet-service buyPet / skill-service upgradeSkill /
 * weapon-service upgradeWeapon+buyWeapon）共 4 处重复查询用户金币用于扣减前
 * 的预检查（UX 快速失败），原代码各自重复 `SELECT gold FROM users WHERE id = $1`
 * + 读 rows[0].gold 模板，且对用户不存在分支处理不一致（仅 weapon-service
 * upgradeWeapon 显式抛 NOT_FOUND，其余 3 处直接读 rows[0].gold 隐式抛 TypeError）。
 *
 * 行为统一：helper 在用户不存在时统一抛 NOT_FOUND（与 weapon-service 既有
 * 契约一致），消除原 3 处 TypeError 500 隐患；业务上 user 由 JWT 鉴权保证存在，
 * 此分支几乎不触发，但显式 NOT_FOUND 比 TypeError 500 更符合 RESTful 语义。
 *
 * 注意：本 helper 仅做"读"操作，不做并发守卫；权威扣减请使用 deductGold。
 *
 * @param tx 事务客户端（由 withTransaction 提供，仅暴露 query）
 * @param userId 用户 ID
 * @returns 用户当前金币余额
 * @throws AppError(NOT_FOUND) 用户不存在时抛出
 */
export async function getUserGold(
  tx: Tx,
  userId: string
): Promise<number> {
  const result = await tx.query(
    `SELECT gold FROM users WHERE id = $1`,
    [userId]
  );
  if (result.rows.length === 0) {
    throw new AppError(ErrorCode.NOT_FOUND, '用户不存在');
  }
  return result.rows[0].gold as number;
}

/**
 * 事务内原子扣减金币：通过 SQL 守卫 AND gold >= $1 防止并发扣减使金币变负。
 *
 * 设计原因：4 个 service（pet-service buyPet / skill-service upgradeSkill /
 * weapon-service upgradeWeapon+buyWeapon）共 4 处重复以下 8 行模板：
 *   const deductResult = await tx.query(
 *     `UPDATE users SET gold = gold - $1 WHERE id = $2 AND gold >= $1 RETURNING gold`,
 *     [amount, userId]
 *   );
 *   if (deductResult.rows.length === 0) {
 *     throw new AppError(ErrorCode.FORBIDDEN, `金币不足，需要 ${amount} 金币`);
 *   }
 * 抽取后消除重复，并统一错误码（FORBIDDEN）与文案模板（含所需金额）。
 *
 * 边界：shop-service 的金币扣减保留原样——其错误码为 BAD_REQUEST 且文案为
 * 短文案「金币不足」（不含金额），与本工具的 FORBIDDEN + 含金额文案不一致，
 * 强行统一会破坏 shop.test.ts 的断言契约。
 *
 * 行为等价：SQL 与原模板完全一致；RETURNING 返回 0 行表示并发场景下余额已被
 * 其他事务扣减，抛 AppError 触发 withTransaction 的 ROLLBACK。
 *
 * @param tx 事务客户端（由 withTransaction 提供，仅暴露 query）
 * @param userId 用户 ID
 * @param amount 扣减金额（必须为正数）
 * @returns 扣减后的金币余额
 * @throws AppError(FORBIDDEN) 余额不足或已被并发事务扣减时抛出
 */
export async function deductGold(
  tx: Tx,
  userId: string,
  amount: number
): Promise<number> {
  const result = await tx.query(
    `UPDATE users SET gold = gold - $1 WHERE id = $2 AND gold >= $1 RETURNING gold`,
    [amount, userId]
  );
  if (result.rows.length === 0) {
    throw new AppError(ErrorCode.FORBIDDEN, `金币不足，需要 ${amount} 金币`);
  }
  return result.rows[0].gold as number;
}
