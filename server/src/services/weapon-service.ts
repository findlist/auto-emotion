// server/src/services/weapon-service.ts
// 武器服务：列表/升级/装备

import pool from '../config/database.js';
import { weaponUpgradeCost } from '../idle/growth-curve.js';
import { AppError, ErrorCode } from '../utils/error.js';
import { withTransaction } from '../utils/transaction.js';
import type { Tx } from '../utils/transaction.js';
import { deductGold, ensureGold } from '../utils/gold.js';

/**
 * 用户武器记录：user_weapons 表的查询结果类型
 * 设计原因：getUserWeapon helper 返回值类型，仅暴露调用方实际读取的字段（upgradeWeapon
 * 读取 level），其他 SELECT * 字段（user_id/weapon_id/exp/is_equipped/created_at/updated_at）
 * 由 pg 返回但未在接口暴露，避免过度设计；调用方仅做存在性判断时使用 null 守卫。
 */
interface UserWeaponRow {
  level: number;
}

/**
 * 查询用户武器记录
 *
 * 设计原因：upgradeWeapon + equipWeapon + buyWeapon 三处重复
 * `SELECT * FROM user_weapons WHERE user_id = $1 AND weapon_id = $2` SQL 模板，
 * 抽取后调用方按业务语义守卫（未拥有抛 NOT_FOUND / 已拥有抛 CONFLICT），
 * 消除 SQL 文本漂移风险。返回 null 而非抛错，让调用方灵活守卫。
 *
 * 与 utils/gold.ts 的 getUserGold 区别：getUserGold 用户不存在时统一抛 NOT_FOUND
 * （业务上 JWT 鉴权保证用户存在），本 helper 调用方守卫各异（upgrade/equip 反向抛
 * NOT_FOUND '未拥有该武器'，buy 正向抛 CONFLICT '已拥有该武器'），统一在 helper
 * 内抛错会破坏 buy 的 CONFLICT 语义，故仅返回 null 由调用方守卫。
 */
async function getUserWeapon(
  tx: Tx,
  userId: string,
  weaponId: number
): Promise<UserWeaponRow | null> {
  const result = await tx.query(
    `SELECT * FROM user_weapons WHERE user_id = $1 AND weapon_id = $2`,
    [userId, weaponId]
  );
  return result.rows[0] ?? null;
}

/**
 * 武器列表行：对应 listWeapons 的 SQL JOIN 结果
 * 设计原因：weapons.* + user_weapons 的 level/is_equipped/current_exp，
 * 未拥有武器时 LEFT JOIN 三个字段为 null，前端据此区分已解锁与未解锁状态
 */
export interface WeaponRow {
  id: number;
  name: string;
  description: string | null;
  base_attack: number;
  base_crit_rate: string;
  base_crit_damage: string;
  unlock_cost_gold: number;
  icon_key: string | null;
  created_at: Date;
  level: number | null;
  is_equipped: boolean | null;
  current_exp: number | null;
}

/**
 * 获取用户武器列表
 * @param userId 用户ID
 * @returns 武器列表（含用户装备状态，未拥有武器字段为 null）
 */
export async function listWeapons(userId: string): Promise<WeaponRow[]> {
  const result = await pool.query(
    `SELECT w.*, uw.level, uw.is_equipped, uw.exp as current_exp
     FROM weapons w
     LEFT JOIN user_weapons uw ON uw.weapon_id = w.id AND uw.user_id = $1
     ORDER BY w.id`,
    [userId]
  );
  return result.rows as WeaponRow[];
}

/**
 * 升级武器
 * @param userId 用户ID
 * @param weaponId 武器ID
 * @returns 升级结果（含新等级与消耗）
 */
export async function upgradeWeapon(
  userId: string,
  weaponId: number
): Promise<{ success: true; newLevel: number; cost: { gold: number; fragments: number } }> {
  // 事务统一由 withTransaction 管理 BEGIN/COMMIT/ROLLBACK/release，业务侧仅关心 tx.query
  return withTransaction(async (tx) => {
    // 检查是否拥有该武器
    const userWeapon = await getUserWeapon(tx, userId, weaponId);
    if (!userWeapon) {
      throw new AppError(ErrorCode.NOT_FOUND, '未拥有该武器');
    }

    const currentLevel = userWeapon.level;

    // 计算升级消耗
    const cost = weaponUpgradeCost(currentLevel);

    // 金币预检查 + 原子扣减：ensureGold 快速失败改善 UX，deductGold 原子守卫防并发为负
    await ensureGold(tx, userId, cost.gold);
    await deductGold(tx, userId, cost.gold);

    await tx.query(
      `UPDATE user_weapons SET level = level + 1, exp = exp + $1, updated_at = NOW()
       WHERE user_id = $2 AND weapon_id = $3`,
      [cost.fragments, userId, weaponId]
    );

    return {
      success: true,
      newLevel: currentLevel + 1,
      cost,
    };
  });
}

/**
 * 装备武器
 * @param userId 用户ID
 * @param weaponId 武器ID
 * @returns 装备结果
 */
export async function equipWeapon(
  userId: string,
  weaponId: number
): Promise<{ success: true; weaponId: number }> {
  return withTransaction(async (tx) => {
    // 检查是否拥有该武器
    const owned = await getUserWeapon(tx, userId, weaponId);
    if (!owned) {
      throw new AppError(ErrorCode.NOT_FOUND, '未拥有该武器');
    }

    // 取消当前装备的武器
    await tx.query(
      `UPDATE user_weapons SET is_equipped = FALSE WHERE user_id = $1`,
      [userId]
    );

    // 装备新武器
    await tx.query(
      `UPDATE user_weapons SET is_equipped = TRUE WHERE user_id = $1 AND weapon_id = $2`,
      [userId, weaponId]
    );

    // 更新 characters 表的 weapon_id
    await tx.query(
      `UPDATE characters SET weapon_id = $1, updated_at = NOW() WHERE user_id = $2`,
      [weaponId, userId]
    );

    return { success: true, weaponId };
  });
}

/**
 * 购买武器
 * @param userId 用户ID
 * @param weaponId 武器ID
 * @returns 购买结果
 */
export async function buyWeapon(
  userId: string,
  weaponId: number
): Promise<{ success: true; weaponId: number }> {
  return withTransaction(async (tx) => {
    // 获取武器信息
    const weaponResult = await tx.query(
      `SELECT * FROM weapons WHERE id = $1`,
      [weaponId]
    );

    if (weaponResult.rows.length === 0) {
      throw new AppError(ErrorCode.NOT_FOUND, '武器不存在');
    }

    const weapon = weaponResult.rows[0];

    // 检查是否已拥有
    const owned = await getUserWeapon(tx, userId, weaponId);
    if (owned) {
      throw new AppError(ErrorCode.CONFLICT, '已拥有该武器');
    }

    // 金币预检查 + 原子扣减：ensureGold 快速失败改善 UX，deductGold 原子守卫防并发为负
    await ensureGold(tx, userId, weapon.unlock_cost_gold);
    await deductGold(tx, userId, weapon.unlock_cost_gold);

    // 创建用户武器记录
    await tx.query(
      `INSERT INTO user_weapons (user_id, weapon_id, level, is_equipped) VALUES ($1, $2, 1, FALSE)`,
      [userId, weaponId]
    );

    return { success: true, weaponId };
  });
}
