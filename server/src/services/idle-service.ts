// server/src/services/idle-service.ts
// 挂机服务层：业务逻辑封装

import * as idleEngine from '../idle/idle-engine.js';
import * as offlineCalculator from '../idle/offline-calculator.js';
import pool from '../config/database.js';
import { AppError, ErrorCode } from '../utils/error.js';

/**
 * 获取角色状态
 * @param userId 用户ID
 * @returns 角色状态
 */
export async function getStatus(userId: string) {
  return idleEngine.getStatus(userId);
}

/**
 * 领取离线收益
 * @param userId 用户ID
 * @returns 离线收益结果
 */
export async function claimOffline(userId: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 事务内 advisory lock：基于 userId 哈希获取事务级锁，串行化同用户并发领取
    // 设计原因：原实现事务外调用 calculateOffline 读取 idle_since 计算收益，并发请求都读到相同 idle_since
    // 计算相同收益，第一个请求 COMMIT 重置 idle_since=NOW() 后，第二个请求仍用旧收益发放导致双倍
    // pg_advisory_xact_lock 在事务结束自动释放，无需 DDL 变更，是 PostgreSQL 标准并发控制方案
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [userId]);

    // 事务内重新计算离线收益：用 client.query 在事务连接上读取最新 idle_since
    // advisory lock 串行化后，前一个并发请求已 COMMIT 重置 idle_since=NOW()，重算时间差接近 0 返回 0 收益
    const result = await offlineCalculator.calculateOffline(userId, client.query.bind(client));

    // 无收益（已被并发领取或刚领取过）直接 COMMIT 返回 0 收益，不发放金币经验
    if (result.exp === 0 && result.gold === 0) {
      await client.query('COMMIT');
      return result;
    }

    // 更新用户金币经验
    await client.query(
      `UPDATE users SET experience = experience + $1, gold = gold + $2 WHERE id = $3`,
      [result.exp, result.gold, userId]
    );

    // 重置离线时间
    await client.query(
      `UPDATE characters SET idle_since = NOW(), offline_exp = 0, updated_at = NOW() WHERE user_id = $1`,
      [userId]
    );

    await client.query('COMMIT');
    return result;
  } catch (err) {
    // ROLLBACK 加 try/catch 保护，避免 ROLLBACK 抛错掩盖原始业务错误
    try { await client.query('ROLLBACK'); } catch (rbErr) {
      console.error('ROLLBACK 失败:', (rbErr as Error).message);
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 切换挂机区域
 * @param userId 用户ID
 * @param areaId 区域ID
 * @returns 切换结果
 */
export async function switchArea(userId: string, areaId: number) {
  // 检查区域是否存在
  const area = await pool.query('SELECT * FROM idle_areas WHERE id = $1', [areaId]);
  if (area.rows.length === 0) {
    throw new AppError(ErrorCode.NOT_FOUND, '区域不存在');
  }

  // 检查角色等级
  const char = await pool.query('SELECT level FROM characters WHERE user_id = $1', [userId]);
  if (char.rows.length === 0) {
    throw new AppError(ErrorCode.NOT_FOUND, '角色不存在');
  }
  if (char.rows[0].level < area.rows[0].required_level) {
    throw new AppError(ErrorCode.FORBIDDEN, `需要等级 ${area.rows[0].required_level} 才能进入此区域`);
  }

  await idleEngine.switchArea(userId, areaId);
  return { success: true };
}

/**
 * 升级角色属性
 * @param userId 用户ID
 * @param field 要升级的属性
 * @param itemType 物品类型（可选）
 * @returns 升级结果
 */
export async function upgradeCharacter(
  userId: string,
  field: 'hp' | 'attack' | 'defense' | 'crit_rate' | 'crit_damage' | 'efficiency',
  itemType?: string
) {
  return idleEngine.upgradeCharacter(userId, field, itemType);
}

/**
 * 在线结算（定期调用）
 * @param userId 用户ID
 * @param durationSeconds 时长（秒）
 * @returns 结算结果
 */
export async function settle(userId: string, durationSeconds: number) {
  return idleEngine.settle(userId, durationSeconds);
}
