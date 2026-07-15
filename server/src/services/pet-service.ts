// server/src/services/pet-service.ts
// 宠物服务：列表/装备

import pool from '../config/database.js';
import { AppError, ErrorCode } from '../utils/error.js';
import { logger } from '../utils/logger.js';

/**
 * 宠物列表行：对应 listPets 的 SQL JOIN 结果
 * 设计原因：pets.* + user_pets.is_equipped，未拥有宠物时 is_equipped 为 null，
 * 前端据此区分已解锁与未解锁状态
 */
export interface PetRow {
  id: number;
  name: string;
  description: string | null;
  bonus_type: string | null;
  bonus_value: string;
  unlock_cost_gold: number;
  created_at: Date;
  is_equipped: boolean | null;
}

/**
 * 获取用户宠物列表
 * @param userId 用户ID
 * @returns 宠物列表（含装备状态，未拥有宠物 is_equipped 为 null）
 */
export async function listPets(userId: string): Promise<PetRow[]> {
  const result = await pool.query(
    `SELECT p.*, up.is_equipped
     FROM pets p
     LEFT JOIN user_pets up ON up.pet_id = p.id AND up.user_id = $1
     ORDER BY p.id`,
    [userId]
  );
  return result.rows as PetRow[];
}

/**
 * 装备宠物
 * @param userId 用户ID
 * @param petId 宠物ID
 * @returns 装备结果
 */
export async function equipPet(
  userId: string,
  petId: number
): Promise<{ success: true; petId: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 检查是否拥有该宠物
    const ownedResult = await client.query(
      `SELECT * FROM user_pets WHERE user_id = $1 AND pet_id = $2`,
      [userId, petId]
    );

    if (ownedResult.rows.length === 0) {
      throw new AppError(ErrorCode.NOT_FOUND, '未拥有该宠物');
    }

    // 取消当前装备的宠物
    await client.query(
      `UPDATE user_pets SET is_equipped = FALSE WHERE user_id = $1`,
      [userId]
    );

    // 装备新宠物
    await client.query(
      `UPDATE user_pets SET is_equipped = TRUE WHERE user_id = $1 AND pet_id = $2`,
      [userId, petId]
    );

    await client.query('COMMIT');

    return { success: true, petId };
  } catch (err) {
    // 设计原因：使用结构化 logger 替代 raw console.error，保证事务回滚失败日志与全项目 JSON 格式统一
    try { await client.query('ROLLBACK'); } catch (rbErr) {
      logger.error('ROLLBACK 失败', { error: (rbErr as Error).message });
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 购买宠物
 * @param userId 用户ID
 * @param petId 宠物ID
 * @returns 购买结果
 */
export async function buyPet(
  userId: string,
  petId: number
): Promise<{ success: true; petId: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 获取宠物信息：必须走 client.query 而非 pool.query
    // 设计原因：此处已在 BEGIN 事务内，pool.query 会从连接池另取独立连接，
    // 破坏事务隔离性，并发修改宠物数据时可能读到脏数据
    const petResult = await client.query(
      `SELECT * FROM pets WHERE id = $1`,
      [petId]
    );

    if (petResult.rows.length === 0) {
      throw new AppError(ErrorCode.NOT_FOUND, '宠物不存在');
    }

    const pet = petResult.rows[0];

    // 检查是否已拥有
    const ownedResult = await client.query(
      `SELECT * FROM user_pets WHERE user_id = $1 AND pet_id = $2`,
      [userId, petId]
    );

    if (ownedResult.rows.length > 0) {
      throw new AppError(ErrorCode.CONFLICT, '已拥有该宠物');
    }

    // 检查金币是否足够
    const userResult = await client.query(
      `SELECT gold FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows[0].gold < pet.unlock_cost_gold) {
      throw new AppError(ErrorCode.FORBIDDEN, `金币不足，需要 ${pet.unlock_cost_gold} 金币`);
    }

    // 扣除金币：原子守卫 AND gold >= $1 RETURNING gold 防止并发扣减使金币变负
    // 设计原因：事务内 SELECT 与 UPDATE 之间并发请求都读到充足余额，串行 UPDATE 会使金币变负
    const deductResult = await client.query(
      `UPDATE users SET gold = gold - $1 WHERE id = $2 AND gold >= $1 RETURNING gold`,
      [pet.unlock_cost_gold, userId]
    );

    if (deductResult.rows.length === 0) {
      throw new AppError(ErrorCode.FORBIDDEN, `金币不足，需要 ${pet.unlock_cost_gold} 金币`);
    }

    // 创建用户宠物记录
    await client.query(
      `INSERT INTO user_pets (user_id, pet_id) VALUES ($1, $2)`,
      [userId, petId]
    );

    await client.query('COMMIT');

    return { success: true, petId };
  } catch (err) {
    // 设计原因：使用结构化 logger 替代 raw console.error，保证事务回滚失败日志与全项目 JSON 格式统一
    try { await client.query('ROLLBACK'); } catch (rbErr) {
      logger.error('ROLLBACK 失败', { error: (rbErr as Error).message });
    }
    throw err;
  } finally {
    client.release();
  }
}
