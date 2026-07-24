// server/src/services/skill-service.ts
// 技能服务：列表/解锁/升级/激活

import pool from '../config/database.js';
import { skillUnlockLevel } from '../idle/growth-curve.js';
import { AppError, ErrorCode } from '../utils/error.js';
import { withTransaction } from '../utils/transaction.js';
import type { Tx } from '../utils/transaction.js';
import { deductGold, ensureGold } from '../utils/gold.js';

/**
 * 用户技能记录：user_skills 表的查询结果类型
 * 设计原因：getUserSkill helper 返回值类型，仅暴露调用方实际读取的字段（upgradeSkill
 * 读取 level），其他 SELECT * 字段（user_id/skill_id/is_active/created_at/updated_at）
 * 由 pg 返回但未在接口暴露，避免过度设计；调用方仅做存在性判断时使用 null 守卫。
 * 与 weapon-service 的 UserWeaponRow / pet-service 的 UserPetRow 保持对称模式。
 */
interface UserSkillRow {
  level: number;
}

/**
 * 查询用户技能记录
 *
 * 设计原因：unlockSkill + upgradeSkill + activateSkill 三处重复
 * `SELECT * FROM user_skills WHERE user_id = $1 AND skill_id = $2` SQL 模板，
 * 抽取后调用方按业务语义守卫（未解锁抛 NOT_FOUND / 已解锁抛 CONFLICT），
 * 消除 SQL 文本漂移风险。返回 null 而非抛错，让调用方灵活守卫。
 *
 * 与 utils/gold.ts 的 getUserGold 区别：getUserGold 用户不存在时统一抛 NOT_FOUND
 * （业务上 JWT 鉴权保证用户存在），本 helper 调用方守卫各异（unlock 正向抛
 * CONFLICT '已解锁该技能'，upgrade/activate 反向抛 NOT_FOUND '未解锁该技能'），
 * 统一在 helper 内抛错会破坏 unlock 的 CONFLICT 语义，故仅返回 null 由调用方守卫。
 */
async function getUserSkill(
  tx: Tx,
  userId: string,
  skillId: number
): Promise<UserSkillRow | null> {
  const result = await tx.query(
    `SELECT * FROM user_skills WHERE user_id = $1 AND skill_id = $2`,
    [userId, skillId]
  );
  return result.rows[0] ?? null;
}

// 技能列表行：对应 listSkills 的 SQL 查询结果
// level/is_active 来自 LEFT JOIN user_skills，未解锁时为 null
interface SkillRow {
  id: number;
  name: string;
  description?: string;
  level: number | null;
  is_active: boolean | null;
}

/**
 * 获取用户技能列表
 * @param userId 用户ID
 * @returns 技能列表
 */
export async function listSkills(userId: string): Promise<SkillRow[]> {
  const result = await pool.query(
    `SELECT s.*, us.level, us.is_active
     FROM skills s
     LEFT JOIN user_skills us ON us.skill_id = s.id AND us.user_id = $1
     ORDER BY s.id`,
    [userId]
  );
  // SQL 返回 any[]，断言对接 SkillRow 接口契约，便于调用方与前端类型可追溯
  return result.rows as SkillRow[];
}

/**
 * 解锁技能
 * @param userId 用户ID
 * @param skillId 技能ID
 * @returns 解锁结果
 */
export async function unlockSkill(
  userId: string,
  skillId: number
): Promise<{ success: true; skillId: number }> {
  // withTransaction 自动管理 BEGIN/COMMIT/ROLLBACK/release，AppError 抛出会触发 ROLLBACK 并透传
  return withTransaction(async (tx) => {
    // 获取技能信息（用 tx.query 在事务连接上执行，保证事务隔离性）
    // 设计原因：原用 pool.query 获取独立连接执行，查询不在事务内，虽不影响功能但破坏事务隔离语义
    const skillResult = await tx.query(
      `SELECT * FROM skills WHERE id = $1`,
      [skillId]
    );

    if (skillResult.rows.length === 0) {
      throw new AppError(ErrorCode.NOT_FOUND, '技能不存在');
    }

    // skillResult.rows[0] 已通过长度检查

    // 检查是否已解锁
    const owned = await getUserSkill(tx, userId, skillId);

    if (owned) {
      throw new AppError(ErrorCode.CONFLICT, '已解锁该技能');
    }

    // 检查角色等级是否满足解锁要求
    const charResult = await tx.query(
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
    await tx.query(
      `INSERT INTO user_skills (user_id, skill_id, level, is_active) VALUES ($1, $2, 1, FALSE)`,
      [userId, skillId]
    );

    return { success: true, skillId };
  });
}

/**
 * 升级技能
 * @param userId 用户ID
 * @param skillId 技能ID
 * @returns 升级结果
 */
export async function upgradeSkill(
  userId: string,
  skillId: number
): Promise<{ success: true; newLevel: number; cost: number }> {
  // withTransaction 自动管理 BEGIN/COMMIT/ROLLBACK/release
  return withTransaction(async (tx) => {
    // 检查是否拥有该技能
    const userSkill = await getUserSkill(tx, userId, skillId);

    if (!userSkill) {
      throw new AppError(ErrorCode.NOT_FOUND, '未解锁该技能');
    }

    const currentLevel = userSkill.level;

    // 计算升级消耗（金币 = 100 * level）
    const goldCost = 100 * currentLevel;

    // 金币预检查 + 原子扣减：ensureGold 快速失败改善 UX，deductGold 原子守卫防并发为负
    await ensureGold(tx, userId, goldCost);
    await deductGold(tx, userId, goldCost);

    await tx.query(
      `UPDATE user_skills SET level = level + 1, updated_at = NOW()
       WHERE user_id = $1 AND skill_id = $2`,
      [userId, skillId]
    );

    return {
      success: true,
      newLevel: currentLevel + 1,
      cost: goldCost,
    };
  });
}

/**
 * 激活/停用技能
 * @param userId 用户ID
 * @param skillId 技能ID
 * @param active 是否激活
 * @returns 操作结果
 */
export async function activateSkill(
  userId: string,
  skillId: number,
  active: boolean
): Promise<{ success: true; skillId: number; isActive: boolean }> {
  // withTransaction 自动管理 BEGIN/COMMIT/ROLLBACK/release
  return withTransaction(async (tx) => {
    // 检查是否拥有该技能
    const owned = await getUserSkill(tx, userId, skillId);

    if (!owned) {
      throw new AppError(ErrorCode.NOT_FOUND, '未解锁该技能');
    }

    // 更新激活状态
    await tx.query(
      `UPDATE user_skills SET is_active = $1, updated_at = NOW()
       WHERE user_id = $2 AND skill_id = $3`,
      [active, userId, skillId]
    );

    return { success: true, skillId, isActive: active };
  });
}
