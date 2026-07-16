// server/src/utils/transaction.ts
// 数据库事务高阶工具：统一封装 BEGIN/COMMIT/ROLLBACK 与客户端生命周期管理

import type { PoolClient } from 'pg';
import pool from '../config/database.js';
import { logger } from './logger.js';
import { getErrorMessage } from './error.js';

// 仅暴露 query 能力，避免业务侧误用 release/on 等 PoolClient 方法
// 设计原因：业务回调若能访问 release 会破坏事务生命周期（提前释放导致后续 COMMIT 失败）
export type Tx = Pick<PoolClient, 'query'>;

/**
 * 在数据库事务中执行业务逻辑，自动管理 BEGIN/COMMIT/ROLLBACK 与客户端释放。
 *
 * 使用约定：
 * - 业务逻辑全部通过 tx.query(...) 执行，禁止回调内直接调用 pool.query
 * - 业务异常（包括 AppError）直接 throw，工具会自动 ROLLBACK 并透传原错误
 * - 禁止嵌套调用 withTransaction；若需共享事务请显式传递 tx
 *
 * 设计原因：11 个 service 文件共 19 处事务样板完全一致（BEGIN/work/COMMIT + catch ROLLBACK + finally release），
 * 提取后每处可削减约 9 行重复代码，并保证 ROLLBACK 失败兜底文案、日志格式、释放策略全项目一致。
 *
 * @param work 业务回调，接收受限的 tx 接口
 * @returns 回调的返回值
 */
export async function withTransaction<T>(
  work: (tx: Tx) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // tx 类型收窄为只暴露 query，运行时仍为完整 client，避免函数包装层的 this 绑定问题
    const tx: Tx = client;
    const result = await work(tx);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    // ROLLBACK 本身可能因连接断开抛错，若不保护会掩盖原始业务错误
    try {
      await client.query('ROLLBACK');
    } catch (rbErr) {
      // 兜底文案 '未知错误'：与全项目现有 19 处 ROLLBACK 失败日志一致
      // rbErr 极少为非 Error，但兜底文案比 undefined 更有语义
      logger.error('ROLLBACK 失败', { error: getErrorMessage(rbErr, '未知错误') });
    }
    throw err;
  } finally {
    client.release();
  }
}
