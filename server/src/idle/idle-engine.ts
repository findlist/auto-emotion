// server/src/idle/idle-engine.ts
// 挂机引擎：PostgreSQL 持久化版本
// 使用数据库查询替代内存 Map

import pool from '../config/database.js';
import { expForLevel } from './growth-curve.js';
import { AppError, ErrorCode } from '../utils/error.js';

// 角色状态接口（与数据库结构对齐）
export interface CharacterStatus {
  character_id: string;
  user_id: string;
  nickname: string;
  level: number;
  exp: number;
  gold: number;
  pvp_points: number;
  area_id: number;
  area_name: string;
  exp_rate: number;
  gold_rate: number;
  weapon_id: number;
  hp: number;
  attack: number;
  defense: number;
  crit_rate: number;
  crit_damage: number;
  efficiency: number;
  idle_since: Date;
  offline_exp: number;
}

// 结算结果接口
export interface SettleResult {
  gainedExp: number;
  gainedCoins: number;
  gainedFragments: number;
  leveledUp: boolean;
  newLevel: number;
}

// 基础产出常量（每小时）
const EXP_PER_HOUR = 120;
const COINS_PER_HOUR = 60;
const SECONDS_PER_HOUR = 3600;
// 碎片掉落：5% 概率掉落 1 个
const FRAGMENT_DROP_RATE = 0.05;
const FRAGMENT_DROP_AMOUNT = 1;

/**
 * 获取角色状态
 * @param userId 用户ID
 * @returns 角色状态（包含用户信息和区域信息）
 */
export async function getStatus(userId: string): Promise<CharacterStatus | null> {
  const result = await pool.query(
    `SELECT c.id as character_id, c.user_id, u.nickname, c.level, c.exp,
            u.experience, u.gold, u.pvp_points,
            c.area_id, a.name as area_name, a.exp_rate, a.gold_rate,
            c.weapon_id, c.hp, c.attack, c.defense,
            c.crit_rate, c.crit_damage, c.efficiency,
            c.idle_since, c.offline_exp
     FROM characters c
     JOIN users u ON u.id = c.user_id
     LEFT JOIN idle_areas a ON a.id = c.area_id
     WHERE c.user_id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

/**
 * 结算挂机收益（在线结算）
 * @param userId 用户ID
 * @param durationSeconds 挂机时长（秒）
 * @returns 结算结果
 */
export async function settle(userId: string, durationSeconds: number): Promise<SettleResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 获取角色状态和区域信息
    const charResult = await client.query(
      `SELECT c.*, a.exp_rate, a.gold_rate
       FROM characters c
       LEFT JOIN idle_areas a ON a.id = c.area_id
       WHERE c.user_id = $1`,
      [userId]
    );

    if (charResult.rows.length === 0) {
      throw new AppError(ErrorCode.NOT_FOUND, '角色不存在');
    }

    const char = charResult.rows[0];
    const expRate = parseFloat(char.exp_rate) || 1.0;
    const goldRate = parseFloat(char.gold_rate) || 1.0;

    // 计算经验产出
    const gainedExp = Math.floor(
      (EXP_PER_HOUR / SECONDS_PER_HOUR) * durationSeconds * parseFloat(char.efficiency) * expRate
    );
    // 计算金币产出
    const gainedCoins = Math.floor(
      (COINS_PER_HOUR / SECONDS_PER_HOUR) * durationSeconds * parseFloat(char.efficiency) * goldRate
    );
    // 5% 概率掉落碎片
    const gainedFragments =
      Math.random() < FRAGMENT_DROP_RATE ? FRAGMENT_DROP_AMOUNT : 0;

    // 累加经验和金币到用户
    await client.query(
      `UPDATE users SET experience = experience + $1, gold = gold + $2 WHERE id = $3`,
      [gainedExp, gainedCoins, userId]
    );

    // 更新 characters 表的 exp 和 offline_exp，同时重置 idle_since
    // 设计原因：settle 发放在线收益后必须重置 idle_since 时间基准，否则 claimOffline
    // 会从旧 idle_since 计算离线时长，导致在线期间已结算的收益被重复发放
    const newOfflineExp = char.offline_exp + gainedExp;
    await client.query(
      `UPDATE characters SET exp = exp + $1, offline_exp = $2, idle_since = NOW(), updated_at = NOW() WHERE user_id = $3`,
      [gainedExp, newOfflineExp, userId]
    );

    // 处理升级
    const oldLevel = char.level;
    let newLevel = oldLevel;
    let currentExp = char.exp + gainedExp;

    // 检查是否升级（支持连续升级）
    while (currentExp >= expForLevel(newLevel)) {
      currentExp -= expForLevel(newLevel);
      newLevel += 1;
    }

    let leveledUp = false;
    if (newLevel > oldLevel) {
      leveledUp = true;
      // 更新角色等级和清零经验
      await client.query(
        `UPDATE characters SET level = $1, exp = $2, updated_at = NOW() WHERE user_id = $3`,
        [newLevel, currentExp, userId]
      );
    }

    await client.query('COMMIT');

    return {
      gainedExp,
      gainedCoins,
      gainedFragments,
      leveledUp,
      newLevel,
    };
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
 */
export async function switchArea(userId: string, areaId: number): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 检查区域是否存在
    const areaResult = await client.query(
      'SELECT * FROM idle_areas WHERE id = $1',
      [areaId]
    );

    if (areaResult.rows.length === 0) {
      throw new AppError(ErrorCode.NOT_FOUND, '区域不存在');
    }

    // 检查角色等级是否满足要求
    const charResult = await client.query(
      'SELECT level FROM characters WHERE user_id = $1',
      [userId]
    );

    if (charResult.rows.length === 0) {
      throw new AppError(ErrorCode.NOT_FOUND, '角色不存在');
    }

    const requiredLevel = areaResult.rows[0].required_level;
    const currentLevel = charResult.rows[0].level;

    if (currentLevel < requiredLevel) {
      throw new AppError(ErrorCode.FORBIDDEN, `需要等级 ${requiredLevel} 才能进入此区域`);
    }

    // 更新区域
    await client.query(
      `UPDATE characters SET area_id = $1, updated_at = NOW() WHERE user_id = $2`,
      [areaId, userId]
    );

    await client.query('COMMIT');
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
 * 升级角色属性
 * @param userId 用户ID
 * @param field 要升级的属性
 * @param itemType 物品类型（可选，用于碎片升级）
 */
export async function upgradeCharacter(
  userId: string,
  field: 'hp' | 'attack' | 'defense' | 'crit_rate' | 'crit_damage' | 'efficiency',
  _itemType?: string
): Promise<{ success: boolean; newValue: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // advisory lock 串行化同用户升级请求，防止并发请求双扣金币
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [userId]);

    // 获取当前角色状态（JOIN users 表读取金币，characters 表无 gold 字段）
    const charResult = await client.query(
      'SELECT c.*, u.gold FROM characters c JOIN users u ON u.id = c.user_id WHERE c.user_id = $1',
      [userId]
    );

    if (charResult.rows.length === 0) {
      throw new AppError(ErrorCode.NOT_FOUND, '角色不存在');
    }

    const char = charResult.rows[0];
    const level = char.level;

    // 计算升级消耗（金币）
    const goldCost = 50 * level * level;

    // 检查金币是否足够
    if (char.gold < goldCost) {
      throw new AppError(ErrorCode.FORBIDDEN, `金币不足，需要 ${goldCost} 金币`);
    }

    // 根据字段类型计算属性增量
    let newValue: number;
    let setClause: string;

    switch (field) {
      case 'hp':
        newValue = char.hp + 10;
        setClause = 'hp = hp + 10';
        break;
      case 'attack':
        newValue = char.attack + 2;
        setClause = 'attack = attack + 2';
        break;
      case 'defense':
        newValue = char.defense + 1;
        setClause = 'defense = defense + 1';
        break;
      case 'crit_rate':
        newValue = parseFloat(char.crit_rate) + 0.01;
        setClause = 'crit_rate = crit_rate + 0.01';
        break;
      case 'crit_damage':
        newValue = parseFloat(char.crit_damage) + 0.05;
        setClause = 'crit_damage = crit_damage + 0.05';
        break;
      case 'efficiency':
        newValue = parseFloat(char.efficiency) + 0.05;
        setClause = 'efficiency = efficiency + 0.05';
        break;
      default:
        throw new AppError(ErrorCode.BAD_REQUEST, '无效的属性字段');
    }

    // 扣除金币并更新属性
    await client.query(
      `UPDATE users SET gold = gold - $1 WHERE id = $2`,
      [goldCost, userId]
    );

    await client.query(
      `UPDATE characters SET ${setClause}, updated_at = NOW() WHERE user_id = $1`,
      [userId]
    );

    await client.query('COMMIT');

    return { success: true, newValue };
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
