// server/src/services/skill-service.ts
// 技能服务：列表/解锁/升级/激活

import pool from '../config/database.js';
import { skillUnlockLevel } from '../idle/growth-curve.js';
import { AppError, ErrorCode } from '../utils/error.js';

/**
 * 获取用户技能列表
 * @param userId 用户ID
 * @returns 技能列表
 */
export async function listSkills(userId: string) {
  const result = await pool.query(
    `SELECT s.*, us.level, us.is_active
     FROM skills s
     LEFT JOIN user_skills us ON us.skill_id = s.id AND us.user_id = $1
     ORDER BY s.id`,
    [userId]
  );
  return result.rows;
}

/**
 * 解锁技能
 * @param userId 用户ID
 * @param skillId 技能ID
 * @returns 解锁结果
 */
export async function unlockSkill(userId: string, skillId: number) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 获取技能信息（用 client.query 在事务连接上执行，保证事务隔离性）
    // 设计原因：原用 pool.query 获取独立连接执行，查询不在事务内，虽不影响功能但破坏事务隔离语义
    const skillResult = await client.query(
      `SELECT * FROM skills WHERE id = $1`,
      [skillId]
    );

    if (skillResult.rows.length === 0) {
      throw new AppError(ErrorCode.NOT_FOUND, '技能不存在');
    }

    // skillResult.rows[0] 已通过长度检查

    // 检查是否已解锁
    const ownedResult = await client.query(
      `SELECT * FROM user_skills WHERE user_id = $1 AND skill_id = $2`,
      [userId, skillId]
    );

    if (ownedResult.rows.length > 0) {
      throw new AppError(ErrorCode.CONFLICT, '已解锁该技能');
    }

    // 检查角色等级是否满足解锁要求
    const charResult = await client.query(
      `SELECT level FROM characters WHERE user_id = $1`,
      [userId]
    );

    if (charResult.rows.length === 0) {
      throw new AppError(ErrorCode.NOT_FOUND, '角色不存在');
    }

    const requiredLevel = skillUnlockLevel(skillId);
    if (charResult.rows[0].level < requiredLevel) {
      throw new AppError(ErrorCode.FORBIDDEN, `需要等级 ${requiredLevel} 才能解锁该技能`);
    }

    // 创建用户技能记录
    await client.query(
      `INSERT INTO user_skills (user_id, skill_id, level, is_active) VALUES ($1, $2, 1, FALSE)`,
      [userId, skillId]
    );

    await client.query('COMMIT');

    return { success: true, skillId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 升级技能
 * @param userId 用户ID
 * @param skillId 技能ID
 * @returns 升级结果
 */
export async function upgradeSkill(userId: string, skillId: number) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 检查是否拥有该技能
    const ownedResult = await client.query(
      `SELECT * FROM user_skills WHERE user_id = $1 AND skill_id = $2`,
      [userId, skillId]
    );

    if (ownedResult.rows.length === 0) {
      throw new AppError(ErrorCode.NOT_FOUND, '未解锁该技能');
    }

    const userSkill = ownedResult.rows[0];
    const currentLevel = userSkill.level;

    // 计算升级消耗（金币 = 100 * level）
    const goldCost = 100 * currentLevel;

    // 事务内预检查改善 UX：金币不足快速失败，给出明确所需金币数
    // 注意：此处非权威检查，并发请求可能都通过预检查，真正拦截在下方 AND gold >= $1 原子守卫
    const userResult = await client.query(
      `SELECT gold FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows[0].gold < goldCost) {
      throw new AppError(ErrorCode.FORBIDDEN, `金币不足，需要 ${goldCost} 金币`);
    }

    // 扣除金币：原子守卫 AND gold >= $1 RETURNING gold 防止并发扣减使金币变负
    // 设计原因：事务内 SELECT 与 UPDATE 之间并发请求都读到充足余额，串行 UPDATE 会使金币变负
    // RETURNING 返回 0 行表示并发场景下余额已被其他事务扣减，抛错 ROLLBACK
    const deductResult = await client.query(
      `UPDATE users SET gold = gold - $1 WHERE id = $2 AND gold >= $1 RETURNING gold`,
      [goldCost, userId]
    );

    if (deductResult.rows.length === 0) {
      throw new AppError(ErrorCode.FORBIDDEN, `金币不足，需要 ${goldCost} 金币`);
    }

    await client.query(
      `UPDATE user_skills SET level = level + 1, updated_at = NOW()
       WHERE user_id = $1 AND skill_id = $2`,
      [userId, skillId]
    );

    await client.query('COMMIT');

    return {
      success: true,
      newLevel: currentLevel + 1,
      cost: goldCost,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 激活/停用技能
 * @param userId 用户ID
 * @param skillId 技能ID
 * @param active 是否激活
 * @returns 操作结果
 */
export async function activateSkill(userId: string, skillId: number, active: boolean) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 检查是否拥有该技能
    const ownedResult = await client.query(
      `SELECT * FROM user_skills WHERE user_id = $1 AND skill_id = $2`,
      [userId, skillId]
    );

    if (ownedResult.rows.length === 0) {
      throw new AppError(ErrorCode.NOT_FOUND, '未解锁该技能');
    }

    // 更新激活状态
    await client.query(
      `UPDATE user_skills SET is_active = $1, updated_at = NOW()
       WHERE user_id = $2 AND skill_id = $3`,
      [active, userId, skillId]
    );

    await client.query('COMMIT');

    return { success: true, skillId, isActive: active };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
