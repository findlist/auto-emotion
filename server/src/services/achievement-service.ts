// server/src/services/achievement-service.ts
// 成就服务

import pool from '../config/database.js';
import { AppError, ErrorCode } from '../utils/error.js';

interface Achievement {
  id: number;
  code: string;
  name: string;
  description: string;
  type: number;
  target: number;
  reward_type: string;
  reward_id: number;
}

// 成就模板
const ACHIEVEMENT_TEMPLATES: Omit<Achievement, 'id'>[] = [
  { code: 'first_battle', name: '初次解压', description: '完成首局对战', type: 0, target: 1, reward_type: 'skin', reward_id: 1 },
  { code: 'battle_100', name: '百战不殆', description: '累计100局对战', type: 0, target: 100, reward_type: 'pet', reward_id: 3 },
  { code: 'battle_500', name: '千战千胜', description: '累计500局对战', type: 0, target: 500, reward_type: 'skin', reward_id: 5 },
  { code: 'destroy_1000', name: '破坏之王', description: '累计破坏1000物品', type: 1, target: 1000, reward_type: 'weapon_skin', reward_id: 1 },
  { code: 'destroy_10000', name: '毁灭者', description: '累计破坏10000物品', type: 1, target: 10000, reward_type: 'weapon_skin', reward_id: 3 },
  { code: 'idle_10h', name: '挂机新手', description: '累计挂机10小时', type: 2, target: 10, reward_type: 'item', reward_id: 1 },
  { code: 'idle_100h', name: '挂机大师', description: '累计挂机100小时', type: 2, target: 100, reward_type: 'item', reward_id: 2 },
  { code: 'friends_10', name: '社交达人', description: '拥有10个好友', type: 3, target: 10, reward_type: 'skin', reward_id: 2 },
  { code: 'level_50', name: '50级玩家', description: '角色等级达到50级', type: 4, target: 50, reward_type: 'pet', reward_id: 2 },
  { code: 'power_10000', name: '万战力', description: '战力达到10000', type: 5, target: 10000, reward_type: 'weapon_skin', reward_id: 2 },
];

/**
 * 初始化成就（如果不存在）
 */
async function ensureAchievementsExist(): Promise<void> {
  const existing = await pool.query('SELECT COUNT(*) as count FROM achievements');
  if (parseInt(existing.rows[0].count, 10) > 0) {
    return;
  }

  for (const achievement of ACHIEVEMENT_TEMPLATES) {
    await pool.query(
      `INSERT INTO achievements (code, name, description, type, target, reward_type, reward_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [achievement.code, achievement.name, achievement.description, achievement.type, achievement.target, achievement.reward_type, achievement.reward_id]
    );
  }
}

/**
 * 获取成就列表
 */
export async function getAchievements(userId: string) {
  // 确保成就已初始化
  await ensureAchievementsExist();

  // 获取所有成就
  const achievementsResult = await pool.query(
    `SELECT id, code, name, description, type, target, reward_type, reward_id
     FROM achievements ORDER BY type, target`
  );

  // 获取用户成就进度
  // schema 字段为 is_completed / claimed_at，用别名映射为 completed / claimed 保持 JS 层兼容
  const userAchievementsResult = await pool.query(
    `SELECT achievement_id, progress, is_completed as completed, (claimed_at IS NOT NULL) as claimed
     FROM user_achievements WHERE user_id = $1`,
    [userId]
  );

  const userAchievementMap = new Map(
    userAchievementsResult.rows.map((ua) => [ua.achievement_id, ua])
  );

  // 合并数据
  return achievementsResult.rows.map((achievement) => {
    const userAchievement = userAchievementMap.get(achievement.id);
    return {
      id: achievement.id,
      code: achievement.code,
      name: achievement.name,
      description: achievement.description,
      type: achievement.type,
      target: achievement.target,
      progress: userAchievement?.progress ?? 0,
      completed: userAchievement?.completed ?? false,
      claimed: userAchievement?.claimed ?? false,
      reward_type: achievement.reward_type,
      reward_id: achievement.reward_id,
    };
  });
}

/**
 * 更新成就进度
 */
export async function updateAchievementProgress(userId: string, type: number, delta: number): Promise<void> {
  // 获取该类型的成就
  const result = await pool.query(
    `SELECT a.id, a.target, COALESCE(ua.progress, 0) as progress, ua.is_completed as completed, ua.id as user_achievement_id
     FROM achievements a
     LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = $1
     WHERE a.type = $2`,
    [userId, type]
  );

  for (const row of result.rows) {
    if (row.completed) continue;

    const newProgress = row.progress + delta;
    const completed = newProgress >= row.target;

    if (row.user_achievement_id) {
      await pool.query(
        `UPDATE user_achievements SET progress = $1, is_completed = $2 WHERE id = $3`,
        [newProgress, completed, row.user_achievement_id]
      );
    } else {
      await pool.query(
        `INSERT INTO user_achievements (user_id, achievement_id, progress, is_completed)
         VALUES ($1, $2, $3, $4)`,
        [userId, row.id, newProgress, completed]
      );
    }
  }
}

/**
 * 领取成就奖励
 */
export async function claimAchievementReward(userId: string, achievementId: number) {
  const result = await pool.query(
    `SELECT a.*, ua.progress, ua.is_completed as completed, (ua.claimed_at IS NOT NULL) as claimed, ua.id as user_achievement_id
     FROM achievements a
     LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = $1
     WHERE a.id = $2`,
    [userId, achievementId]
  );

  if (result.rows.length === 0) {
    throw new AppError(ErrorCode.NOT_FOUND, '成就不存在');
  }

  const achievement = result.rows[0];

  if (!achievement.completed) {
    throw new AppError(ErrorCode.BAD_REQUEST, '成就未完成');
  }

  if (achievement.claimed) {
    throw new AppError(ErrorCode.CONFLICT, '奖励已领取');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 事务内 advisory lock：串行化同用户同成就并发领取，防止重复发奖
    // 设计原因：原实现检查在事务外，并发请求都查到 claimed=false 后进入事务，串行 UPDATE 都设 claimed_at 但都发奖
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${userId}:${achievementId}`]);

    // 事务内权威复查：advisory lock 串行化后前一个请求已 COMMIT，重新确认未领取
    const recheck = await client.query(
      `SELECT id, (claimed_at IS NOT NULL) as claimed FROM user_achievements WHERE user_id = $1 AND achievement_id = $2`,
      [userId, achievementId]
    );

    if (recheck.rows.length > 0 && recheck.rows[0].claimed) {
      throw new AppError(ErrorCode.CONFLICT, '奖励已领取');
    }

    // 更新领取状态：schema 字段为 claimed_at (TIMESTAMP)，非 claimed (BOOLEAN)
    if (achievement.user_achievement_id) {
      await client.query(
        `UPDATE user_achievements SET claimed_at = NOW() WHERE id = $1`,
        [achievement.user_achievement_id]
      );
    } else {
      await client.query(
        `INSERT INTO user_achievements (user_id, achievement_id, progress, is_completed, claimed_at)
         VALUES ($1, $2, $3, true, NOW())`,
        [userId, achievementId, achievement.target]
      );
    }

    // 发放奖励（这里简化处理，实际应该根据 reward_type 发放不同类型奖励）
    await client.query(
      `INSERT INTO user_inventory (user_id, item_type, item_id) VALUES ($1, $2, $3)`,
      [userId, achievement.reward_type, achievement.reward_id]
    );

    await client.query('COMMIT');

    return {
      success: true,
      reward_type: achievement.reward_type,
      reward_id: achievement.reward_id,
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