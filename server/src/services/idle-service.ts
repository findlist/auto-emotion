// server/src/services/idle-service.ts
// 挂机服务层：业务逻辑封装

import * as idleEngine from '../idle/idle-engine.js';
import * as offlineCalculator from '../idle/offline-calculator.js';
// 导入类型用于函数返回类型注解，保证 service 层与底层 idleEngine 类型契约显式可追溯
import type { CharacterStatus, SettleResult } from '../idle/idle-engine.js';
import type { OfflineResult } from '../idle/offline-calculator.js';
import pool from '../config/database.js';
import { AppError, ErrorCode, ensureFound } from '../utils/error.js';
import { withTransaction, advisoryXactLock } from '../utils/transaction.js';
// 奖励发放统一封装：claimOffline 离线收益累加经验金币，与 idle-engine/task-service 同源对称
import { addExperienceAndGold } from '../utils/gold.js';

/**
 * 获取角色状态
 * @param userId 用户ID
 * @returns 角色状态
 */
export async function getStatus(userId: string): Promise<CharacterStatus | null> {
  return idleEngine.getStatus(userId);
}

/**
 * 领取离线收益
 * @param userId 用户ID
 * @returns 离线收益结果
 */
export async function claimOffline(userId: string): Promise<OfflineResult> {
  // withTransaction 自动管理 BEGIN/COMMIT/ROLLBACK/release，业务只需关注事务内逻辑
  // 设计原因：原手动事务样板含双 COMMIT 反模式（零收益早返回路径 + 正常路径都显式 COMMIT），
  // 迁移后零收益路径直接 return 即可，工具会在回调正常返回后统一 COMMIT，消除反模式
  return withTransaction(async (tx) => {
    // 事务内 advisory lock：基于 userId 哈希获取事务级锁，串行化同用户并发领取
    // 设计原因：原实现事务外调用 calculateOffline 读取 idle_since 计算收益，并发请求都读到相同 idle_since
    // 计算相同收益，第一个请求 COMMIT 重置 idle_since=NOW() 后，第二个请求仍用旧收益发放导致双倍
    // pg_advisory_xact_lock 在事务结束自动释放，无需 DDL 变更，是 PostgreSQL 标准并发控制方案
    await advisoryXactLock(tx, userId);

    // 事务内重新计算离线收益：用 tx.query 在事务连接上读取最新 idle_since
    // advisory lock 串行化后，前一个并发请求已 COMMIT 重置 idle_since=NOW()，重算时间差接近 0 返回 0 收益
    const result = await offlineCalculator.calculateOffline(userId, tx.query.bind(tx));

    // 无收益（已被并发领取或刚领取过）直接返回，不发放金币经验
    // withTransaction 在回调正常返回后自动 COMMIT，无需显式 COMMIT
    if (result.exp === 0 && result.gold === 0) {
      return result;
    }

    // 更新用户金币经验
    await addExperienceAndGold(tx, userId, result.exp, result.gold);

    // 重置离线时间
    await tx.query(
      `UPDATE characters SET idle_since = NOW(), offline_exp = 0, updated_at = NOW() WHERE user_id = $1`,
      [userId]
    );

    return result;
  });
}

/**
 * 切换挂机区域
 * @param userId 用户ID
 * @param areaId 区域ID
 * @returns 切换结果
 */
export async function switchArea(userId: string, areaId: number): Promise<{ success: boolean }> {
  // 检查区域是否存在
  const area = await pool.query('SELECT * FROM idle_areas WHERE id = $1', [areaId]);
  ensureFound(area.rows, '区域不存在');

  // 检查角色等级
  const char = await pool.query('SELECT level FROM characters WHERE user_id = $1', [userId]);
  ensureFound(char.rows, '角色不存在');
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
): Promise<{ success: boolean; newValue: number }> {
  return idleEngine.upgradeCharacter(userId, field, itemType);
}

/**
 * 在线结算（定期调用）
 * @param userId 用户ID
 * @param durationSeconds 时长（秒）
 * @returns 结算结果
 */
export async function settle(userId: string, durationSeconds: number): Promise<SettleResult> {
  return idleEngine.settle(userId, durationSeconds);
}
