// server/src/services/leaderboard-service.ts
// 排行榜服务

import pool from '../config/database.js';
import redis from '../config/redis.js';
import { parseCount } from '../utils/param.js';

const LEADERBOARD_KEY_PREFIX = 'leaderboard:';

export type LeaderboardType = 'power' | 'battle' | 'speed';

/**
 * 排行榜类型 → 数据库字段名映射
 * 设计原因：getLeaderboard/getUserRank/updateUserScore 三处按 type 选择 users 表字段，
 * 字段名为白名单常量（power/battle_score/speed_score）与 LeaderboardType 一一对应，
 * 抽取为 helper 集中映射，避免散落三元在新增 type 时漏改；返回字面量联合类型可让 SQL 模板字符串获得字面量提示。
 */
function getScoreField(type: LeaderboardType): 'power' | 'battle_score' | 'speed_score' {
  if (type === 'power') return 'power';
  if (type === 'battle') return 'battle_score';
  return 'speed_score';
}

/**
 * 获取好友 ID 列表（含自己）
 * 设计原因：getFriendsUserRank 与 getFriendsLeaderboard 两处重复查询 friendships 表
 * 并 push 自己的模板，抽取后消除重复；包含自己确保即使无好友也能返回第 1 名。
 * userId 为 UUID 字符串，直接 push 与 friend_id 类型对齐，禁止 parseInt 截断 UUID。
 * status 为 VARCHAR('pending'/'accepted')，使用字符串字面量与 schema 对齐（H-12 修复）。
 */
async function getFriendIdsIncludingSelf(userId: string): Promise<string[]> {
  const friendsResult = await pool.query(
    `SELECT friend_id FROM friendships WHERE user_id = $1 AND status = 'accepted'`,
    [userId]
  );
  const friendIds = friendsResult.rows.map(r => r.friend_id);
  friendIds.push(userId);
  return friendIds;
}

/**
 * 查询用户在指定榜单字段上的分数
 *
 * 设计原因：getUserRank 与 getFriendsUserRank 两处重复
 * `SELECT ${scoreField} as score FROM users WHERE id = $1` + 读取 `rows[0]?.score || 0`
 * 共 4 行样板。scoreField 为白名单字段（power/battle_score/speed_score），由 getScoreField
 * 类型收窄或好友榜硬编码 'power' 传入，参数化后消除 SQL 文本与读取逻辑的双重重复。
 *
 * 返回 0 兜底而非抛 NOT_FOUND：调用方已先经过 rank 子查询的存在性过滤（rows.length === 0
 * 时上层直接 return null），此 helper 仅在用户确实存在分支被调用，0 兜底保持原
 * `userResult.rows[0]?.score || 0` 语义，避免新增 NOT_FOUND 改变调用方行为契约。
 *
 * 与 utils/gold.ts 的 getUserGold 区别：getUserGold 用于事务内金币预检查（用户不存在抛
 * NOT_FOUND 是业务语义需要），本 helper 仅用于排行榜分数读取（0 兜底是显示语义需要）。
 */
async function getUserScoreForLeaderboard(userId: string, scoreField: string): Promise<number> {
  const userResult = await pool.query(
    `SELECT ${scoreField} as score FROM users WHERE id = $1`,
    [userId]
  );
  return userResult.rows[0]?.score || 0;
}

interface LeaderboardEntry {
  rank: number;
  // users.id 为 UUID，pg 返回 string，类型对齐避免 parseInt 截断 UUID 导致 SQL 报错
  userId: string;
  nickname: string;
  score: number;
}

/**
 * 获取排行榜
 */
export async function getLeaderboard(
  type: LeaderboardType,
  page: number = 1,
  pageSize: number = 20
): Promise<{ ranking: LeaderboardEntry[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const scoreField = getScoreField(type);

  // 从数据库获取排行数据
  const result = await pool.query(
    `SELECT id as user_id, nickname, ${scoreField} as score
     FROM users
     WHERE status = 0
     ORDER BY ${scoreField} DESC
     LIMIT $1 OFFSET $2`,
    [pageSize, offset]
  );

  // 获取总数
  const countResult = await pool.query(
    `SELECT COUNT(*) as total FROM users WHERE status = 0`
  );
  const total = parseCount(countResult.rows[0], 'total');

  const ranking = result.rows.map((row, index) => ({
    rank: offset + index + 1,
    userId: row.user_id,
    nickname: row.nickname,
    score: row.score || 0,
  }));

  return { ranking, total };
}

/**
 * 获取用户排名
 */
export async function getUserRank(userId: string, type: LeaderboardType): Promise<{ rank: number; score: number } | null> {
  const scoreField = getScoreField(type);

  const result = await pool.query(
    `SELECT rank FROM (
       SELECT id, ROW_NUMBER() OVER (ORDER BY ${scoreField} DESC) as rank
       FROM users WHERE status = 0
     ) ranked
     WHERE id = $1`,
    [userId]
  );

  if (result.rows.length === 0) return null;

  return {
    rank: result.rows[0].rank,
    score: await getUserScoreForLeaderboard(userId, scoreField),
  };
}

/**
 * 获取战力榜
 */
export async function getPowerLeaderboard(
  page: number = 1,
  pageSize: number = 20
): Promise<{ ranking: LeaderboardEntry[]; total: number }> {
  return getLeaderboard('power', page, pageSize);
}

/**
 * 获取对战榜
 */
export async function getBattleLeaderboard(
  page: number = 1,
  pageSize: number = 20
): Promise<{ ranking: LeaderboardEntry[]; total: number }> {
  return getLeaderboard('battle', page, pageSize);
}

/**
 * 获取速度榜
 */
export async function getSpeedLeaderboard(
  page: number = 1,
  pageSize: number = 20
): Promise<{ ranking: LeaderboardEntry[]; total: number }> {
  return getLeaderboard('speed', page, pageSize);
}

/**
 * 更新用户分数到排行榜（供结算时调用）
 */
export async function updateUserScore(
  userId: string,
  type: LeaderboardType,
  score: number
): Promise<void> {
  const key = `${LEADERBOARD_KEY_PREFIX}${type}`;
  
  // 同时更新 Redis ZSET 和数据库
  await redis.zadd(key, score, userId);
  
  // 更新数据库对应字段
  const scoreField = getScoreField(type);

  await pool.query(
    `UPDATE users SET ${scoreField} = $1 WHERE id = $2`,
    [score, userId]
  );
}

/**
 * 获取用户在好友圈中的排名
 * 设计原因：好友榜个人排名需限定在好友范围内计算，
 * 复用全服 getUserRank 会返回全服名次而非好友圈名次，导致 /friends/me 语义错误
 */
export async function getFriendsUserRank(userId: string): Promise<{ rank: number; score: number } | null> {
  // 获取好友列表（含自己，与 getFriendsLeaderboard 同源 helper）
  const friendIds = await getFriendIdsIncludingSelf(userId);

  // 在好友圈内按 power 计算当前用户名次
  const result = await pool.query(
    `SELECT rank FROM (
       SELECT id, ROW_NUMBER() OVER (ORDER BY power DESC) as rank
       FROM users WHERE id = ANY($1) AND status = 0
     ) ranked
     WHERE id = $2`,
    [friendIds, userId]
  );

  if (result.rows.length === 0) return null;

  return {
    rank: result.rows[0].rank,
    // 好友榜固定按 power 排序，scoreField 硬编码 'power' 与上方 rank 子查询 ORDER BY power 对齐
    score: await getUserScoreForLeaderboard(userId, 'power'),
  };
}

/**
 * 获取好友排行
 */
export async function getFriendsLeaderboard(
  userId: string,
  page: number = 1,
  pageSize: number = 20
): Promise<{ ranking: LeaderboardEntry[]; total: number }> {
  const offset = (page - 1) * pageSize;

  // 获取好友列表（含自己，与 getFriendsUserRank 同源 helper）
  const friendIds = await getFriendIdsIncludingSelf(userId);

  if (friendIds.length === 0) {
    return { ranking: [], total: 0 };
  }

  const result = await pool.query(
    `SELECT id as user_id, nickname, power as score
     FROM users
     WHERE id = ANY($1) AND status = 0
     ORDER BY power DESC
     LIMIT $2 OFFSET $3`,
    [friendIds, pageSize, offset]
  );

  const ranking = result.rows.map((row, index) => ({
    rank: offset + index + 1,
    userId: row.user_id,
    nickname: row.nickname,
    score: row.score || 0,
  }));

  return { ranking, total: friendIds.length };
}