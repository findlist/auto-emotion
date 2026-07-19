// server/src/services/pet-service.ts
// 宠物服务：列表/装备

import pool from '../config/database.js';
import { AppError, ErrorCode } from '../utils/error.js';
import { withTransaction } from '../utils/transaction.js';
import type { Tx } from '../utils/transaction.js';
import { deductGold, getUserGold } from '../utils/gold.js';

/**
 * 用户宠物记录：user_pets 表的查询结果类型
 * 设计原因：与 weapon-service 的 UserWeaponRow 对称，getUserPet helper 的返回值类型。
 * 当前调用方（equipPet/buyPet）仅做存在性判断，未读取字段；接口预留 is_equipped 字段
 * 为未来装备状态查询场景扩展，避免后续调用方读取时再修改接口。
 */
interface UserPetRow {
  is_equipped: boolean;
}

/**
 * 查询用户宠物记录
 *
 * 设计原因：equipPet + buyPet 两处重复
 * `SELECT * FROM user_pets WHERE user_id = $1 AND pet_id = $2` SQL 模板，
 * 抽取后调用方按业务语义守卫（未拥有抛 NOT_FOUND / 已拥有抛 CONFLICT），
 * 与 weapon-service 的 getUserWeapon 形成对称模式，service 层"用户拥有 X 记录查询"
 * 统一封装为 getUserXxx 模式，消除 SQL 文本漂移风险。
 *
 * 返回 null 而非抛错：调用方守卫各异（equip 反向抛 NOT_FOUND '未拥有该宠物'，
 * buy 正向抛 CONFLICT '已拥有该宠物'），统一在 helper 内抛错会破坏 buy 的 CONFLICT 语义。
 */
async function getUserPet(
  tx: Tx,
  userId: string,
  petId: number
): Promise<UserPetRow | null> {
  const result = await tx.query(
    `SELECT * FROM user_pets WHERE user_id = $1 AND pet_id = $2`,
    [userId, petId]
  );
  return result.rows[0] ?? null;
}

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
  return withTransaction(async (tx) => {
    // 检查是否拥有该宠物
    const owned = await getUserPet(tx, userId, petId);
    if (!owned) {
      throw new AppError(ErrorCode.NOT_FOUND, '未拥有该宠物');
    }

    // 取消当前装备的宠物
    await tx.query(
      `UPDATE user_pets SET is_equipped = FALSE WHERE user_id = $1`,
      [userId]
    );

    // 装备新宠物
    await tx.query(
      `UPDATE user_pets SET is_equipped = TRUE WHERE user_id = $1 AND pet_id = $2`,
      [userId, petId]
    );

    return { success: true, petId };
  });
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
  return withTransaction(async (tx) => {
    // 获取宠物信息：必须走 tx.query 而非 pool.query
    // 设计原因：此处已在 BEGIN 事务内，pool.query 会从连接池另取独立连接，
    // 破坏事务隔离性，并发修改宠物数据时可能读到脏数据
    const petResult = await tx.query(
      `SELECT * FROM pets WHERE id = $1`,
      [petId]
    );

    if (petResult.rows.length === 0) {
      throw new AppError(ErrorCode.NOT_FOUND, '宠物不存在');
    }

    const pet = petResult.rows[0];

    // 检查是否已拥有
    const owned = await getUserPet(tx, userId, petId);
    if (owned) {
      throw new AppError(ErrorCode.CONFLICT, '已拥有该宠物');
    }

    // 检查金币是否足够：getUserGold 在用户不存在时统一抛 NOT_FOUND（与 deductGold 同源 helper）
    const gold = await getUserGold(tx, userId);

    if (gold < pet.unlock_cost_gold) {
      throw new AppError(ErrorCode.FORBIDDEN, `金币不足，需要 ${pet.unlock_cost_gold} 金币`);
    }

    // 扣除金币：原子守卫 AND gold >= $1 RETURNING gold 防止并发扣减使金币变负
    // 设计原因：事务内 SELECT 与 UPDATE 之间并发请求都读到充足余额，串行 UPDATE 会使金币变负
    await deductGold(tx, userId, pet.unlock_cost_gold);

    // 创建用户宠物记录
    await tx.query(
      `INSERT INTO user_pets (user_id, pet_id) VALUES ($1, $2)`,
      [userId, petId]
    );

    return { success: true, petId };
  });
}
