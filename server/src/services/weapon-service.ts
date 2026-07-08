// server/src/services/weapon-service.ts
// 武器服务：列表/升级/装备

import pool from '../config/database.js';
import { weaponUpgradeCost } from '../idle/growth-curve.js';
import { AppError, ErrorCode } from '../utils/error.js';

/**
 * 获取用户武器列表
 * @param userId 用户ID
 * @returns 武器列表
 */
export async function listWeapons(userId: string) {
  const result = await pool.query(
    `SELECT w.*, uw.level, uw.is_equipped, uw.exp as current_exp
     FROM weapons w
     LEFT JOIN user_weapons uw ON uw.weapon_id = w.id AND uw.user_id = $1
     ORDER BY w.id`,
    [userId]
  );
  return result.rows;
}

/**
 * 升级武器
 * @param userId 用户ID
 * @param weaponId 武器ID
 * @returns 升级结果
 */
export async function upgradeWeapon(userId: string, weaponId: number) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 检查是否拥有该武器
    const ownedResult = await client.query(
      `SELECT * FROM user_weapons WHERE user_id = $1 AND weapon_id = $2`,
      [userId, weaponId]
    );

    if (ownedResult.rows.length === 0) {
      throw new AppError(ErrorCode.NOT_FOUND, '未拥有该武器');
    }

    const userWeapon = ownedResult.rows[0];
    const currentLevel = userWeapon.level;

    // 计算升级消耗
    const cost = weaponUpgradeCost(currentLevel);

    // 事务内预检查改善 UX：金币不足快速失败，给出明确所需金币数
    // 注意：此处非权威检查，并发请求可能都通过预检查，真正拦截在下方 AND gold >= $1 原子守卫
    const userResult = await client.query(
      `SELECT gold FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new AppError(ErrorCode.NOT_FOUND, '用户不存在');
    }

    if (userResult.rows[0].gold < cost.gold) {
      throw new AppError(ErrorCode.FORBIDDEN, `金币不足，需要 ${cost.gold} 金币`);
    }

    // 扣除金币：原子守卫 AND gold >= $1 RETURNING gold 防止并发扣减使金币变负
    // 设计原因：事务内 SELECT 与 UPDATE 之间并发请求都读到充足余额，串行 UPDATE 会使金币变负
    // RETURNING 返回 0 行表示并发场景下余额已被其他事务扣减，抛错 ROLLBACK
    const deductResult = await client.query(
      `UPDATE users SET gold = gold - $1 WHERE id = $2 AND gold >= $1 RETURNING gold`,
      [cost.gold, userId]
    );

    if (deductResult.rows.length === 0) {
      throw new AppError(ErrorCode.FORBIDDEN, `金币不足，需要 ${cost.gold} 金币`);
    }

    await client.query(
      `UPDATE user_weapons SET level = level + 1, exp = exp + $1, updated_at = NOW()
       WHERE user_id = $2 AND weapon_id = $3`,
      [cost.fragments, userId, weaponId]
    );

    await client.query('COMMIT');

    return {
      success: true,
      newLevel: currentLevel + 1,
      cost,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 装备武器
 * @param userId 用户ID
 * @param weaponId 武器ID
 * @returns 装备结果
 */
export async function equipWeapon(userId: string, weaponId: number) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 检查是否拥有该武器
    const ownedResult = await client.query(
      `SELECT * FROM user_weapons WHERE user_id = $1 AND weapon_id = $2`,
      [userId, weaponId]
    );

    if (ownedResult.rows.length === 0) {
      throw new AppError(ErrorCode.NOT_FOUND, '未拥有该武器');
    }

    // 取消当前装备的武器
    await client.query(
      `UPDATE user_weapons SET is_equipped = FALSE WHERE user_id = $1`,
      [userId]
    );

    // 装备新武器
    await client.query(
      `UPDATE user_weapons SET is_equipped = TRUE WHERE user_id = $1 AND weapon_id = $2`,
      [userId, weaponId]
    );

    // 更新 characters 表的 weapon_id
    await client.query(
      `UPDATE characters SET weapon_id = $1, updated_at = NOW() WHERE user_id = $2`,
      [weaponId, userId]
    );

    await client.query('COMMIT');

    return { success: true, weaponId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 购买武器
 * @param userId 用户ID
 * @param weaponId 武器ID
 * @returns 购买结果
 */
export async function buyWeapon(userId: string, weaponId: number) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 获取武器信息
    const weaponResult = await client.query(
      `SELECT * FROM weapons WHERE id = $1`,
      [weaponId]
    );

    if (weaponResult.rows.length === 0) {
      throw new AppError(ErrorCode.NOT_FOUND, '武器不存在');
    }

    const weapon = weaponResult.rows[0];

    // 检查是否已拥有
    const ownedResult = await client.query(
      `SELECT * FROM user_weapons WHERE user_id = $1 AND weapon_id = $2`,
      [userId, weaponId]
    );

    if (ownedResult.rows.length > 0) {
      throw new AppError(ErrorCode.CONFLICT, '已拥有该武器');
    }

    // 事务内预检查改善 UX：金币不足快速失败，给出明确所需金币数
    // 注意：此处非权威检查，并发请求可能都通过预检查，真正拦截在下方 AND gold >= $1 原子守卫
    const userResult = await client.query(
      `SELECT gold FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows[0].gold < weapon.unlock_cost_gold) {
      throw new AppError(ErrorCode.FORBIDDEN, `金币不足，需要 ${weapon.unlock_cost_gold} 金币`);
    }

    // 扣除金币：原子守卫 AND gold >= $1 RETURNING gold 防止并发扣减使金币变负
    // 设计原因：事务内 SELECT 与 UPDATE 之间并发请求都读到充足余额，串行 UPDATE 会使金币变负
    // RETURNING 返回 0 行表示并发场景下余额已被其他事务扣减，抛错 ROLLBACK
    const deductResult = await client.query(
      `UPDATE users SET gold = gold - $1 WHERE id = $2 AND gold >= $1 RETURNING gold`,
      [weapon.unlock_cost_gold, userId]
    );

    if (deductResult.rows.length === 0) {
      throw new AppError(ErrorCode.FORBIDDEN, `金币不足，需要 ${weapon.unlock_cost_gold} 金币`);
    }

    // 创建用户武器记录
    await client.query(
      `INSERT INTO user_weapons (user_id, weapon_id, level, is_equipped) VALUES ($1, $2, 1, FALSE)`,
      [userId, weaponId]
    );

    await client.query('COMMIT');

    return { success: true, weaponId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
