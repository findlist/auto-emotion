// server/src/idle/offline-calculator.ts
// 离线收益计算器（不写入数据库）

import pool from '../config/database.js';
import { AppError, ErrorCode } from '../utils/error.js';

// 离线结果接口
export interface OfflineResult {
  offlineSeconds: number; // 离线时长（秒）
  exp: number; // 离线经验
  gold: number; // 离线金币
  cappedHours: number; // 最多12小时
}

// 基础产出常量（每小时）
const SECONDS_PER_HOUR = 3600;
// 离线收益上限（小时）
const MAX_OFFLINE_HOURS = 12;

// 查询函数类型：兼容 pool.query 与 client.query，便于事务内重算
type QueryFn = (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;

/**
 * 计算离线收益（不写入数据库）
 * @param userId 用户ID
 * @param queryFn 可选查询函数：默认 pool.query，claimOffline 事务内传 client.query.bind(client) 在事务连接上重算
 * @returns 离线收益计算结果
 */
export async function calculateOffline(
  userId: string,
  queryFn: QueryFn = pool.query.bind(pool) as QueryFn,
): Promise<OfflineResult> {
  // 1. 从 characters 获取 idle_since 和 area_id
  const charResult = await queryFn(
    `SELECT c.idle_since, c.area_id, c.efficiency, c.level
     FROM characters c
     WHERE c.user_id = $1`,
    [userId]
  );

  if (charResult.rows.length === 0) {
    throw new AppError(ErrorCode.NOT_FOUND, '角色不存在');
  }

  const char = charResult.rows[0];
  const idleSince = new Date(char.idle_since);
  const now = new Date();

  // 2. 计算离线时长（秒）
  const offlineSeconds = Math.floor((now.getTime() - idleSince.getTime()) / 1000);

  if (offlineSeconds <= 0) {
    return {
      offlineSeconds: 0,
      exp: 0,
      gold: 0,
      cappedHours: 0,
    };
  }

  // 3. 从 idle_areas 获取 exp_rate, gold_rate
  const areaResult = await queryFn(
    `SELECT exp_rate, gold_rate FROM idle_areas WHERE id = $1`,
    [char.area_id]
  );

  const expRate = areaResult.rows.length > 0 ? parseFloat(areaResult.rows[0].exp_rate) : 1.0;
  const goldRate = areaResult.rows.length > 0 ? parseFloat(areaResult.rows[0].gold_rate) : 1.0;
  const efficiency = parseFloat(char.efficiency) || 1.0;

  // 4. 计算离线小时数，上限 12 小时
  const totalHours = offlineSeconds / SECONDS_PER_HOUR;
  const cappedHours = Math.min(totalHours, MAX_OFFLINE_HOURS);

  // 5. 计算产出
  // exp = 10 * level * exp_rate * hours（基础公式，level影响产出）
  const exp = Math.floor(10 * char.level * expRate * efficiency * cappedHours);
  // gold = 5 * gold_rate * hours
  const gold = Math.floor(5 * goldRate * efficiency * cappedHours);

  return {
    offlineSeconds,
    exp,
    gold,
    cappedHours: Math.floor(cappedHours),
  };
}
