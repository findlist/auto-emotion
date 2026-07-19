// server/src/services/season-pass-service.ts
// 赛季通行证服务

import pool from '../config/database.js';
import { AppError, ErrorCode } from '../utils/error.js';
import { withTransaction, advisoryXactLock } from '../utils/transaction.js';

const SEASON_DURATION_DAYS = 28; // 4周
const SEASON_MAX_LEVEL = 50;

interface SeasonReward {
  level: number;
  exp_required: number;
  free_reward_type: string;
  free_reward_id: number;
  free_reward_type_amount?: number;
  premium_reward_type: string;
  premium_reward_id: number;
}

// 已领取状态扩展的奖励项：前端据此区分免费/高级两档领取进度
interface SeasonRewardWithClaim extends SeasonReward {
  freeClaimed: boolean;
  premiumClaimed: boolean;
}

// 当前赛季完整信息：包含赛季元数据、用户进度、奖励列表三部分
interface SeasonInfo {
  seasonId: number;
  seasonName: string;
  seasonStartedAt: string;
  seasonEndsAt: string;
  level: number;
  exp: number;
  isPremium: boolean;
  rewards: SeasonRewardWithClaim[];
}

// 生成赛季奖励表
function generateSeasonRewards(): SeasonReward[] {
  const rewards: SeasonReward[] = [];
  for (let level = 1; level <= SEASON_MAX_LEVEL; level++) {
    const expRequired = level * 100;
    rewards.push({
      level,
      exp_required: expRequired,
      free_reward_type: 'gold',
      free_reward_id: 0,
      free_reward_type_amount: level * 10,
      premium_reward_type: 'skin',
      premium_reward_id: level % 5 + 1,
    });
  }
  return rewards;
}

const SEASON_REWARDS = generateSeasonRewards();

// 文件内 private helper：统一当前赛季查询，消除 getCurrentSeason 与 claimSeasonReward 重复
// 设计原因：两处 WHERE 子句完全一致，仅 SELECT 字段不同（getCurrentSeason 查 4 字段，
// claimSeasonReward 仅查 id）；统一查询完整字段，调用方按需取用，多返回字段被忽略。
// 行为等价：PostgreSQL 单行查询多返回字段不影响性能，与原两处查询语义一致。
async function getCurrentSeasonInfo(): Promise<{
  id: number;
  name: string;
  started_at: string;
  ends_at: string;
} | null> {
  const result = await pool.query(
    `SELECT id, name, started_at, ends_at FROM seasons
     WHERE started_at <= NOW() AND ends_at > NOW()
     ORDER BY started_at DESC LIMIT 1`
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * 获取当前赛季信息
 */
export async function getCurrentSeason(userId: string): Promise<SeasonInfo> {
  // 仅查询 users 表实际存在的赛季字段：season_id/season_started_at 不在 schema 中，
  // 原查询会因字段不存在报错。赛季信息改从 seasons 表获取（下方 seasonResult）
  const result = await pool.query(
    `SELECT season_level, season_exp, is_premium
     FROM users WHERE id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    throw new AppError(ErrorCode.NOT_FOUND, '用户不存在');
  }

  const user = result.rows[0];

  // 获取赛季配置（统一走 getCurrentSeasonInfo helper，与 claimSeasonReward 同源）
  const season = await getCurrentSeasonInfo();

  // 获取已领取的奖励：分别查询免费与高级领取记录，避免共用 Set 导致显示相同
  // 设计原因：原实现用同一个 Set 判断 freeClaimed 和 premiumClaimed，领免费后高级也显示已领取，是真实 bug
  const claimedResult = await pool.query(
    `SELECT level, is_premium FROM user_season_rewards WHERE user_id = $1 AND season_id = $2`,
    [userId, season?.id]
  );
  const freeClaimedLevels = new Set(
    claimedResult.rows.filter(r => !r.is_premium).map(r => r.level)
  );
  const premiumClaimedLevels = new Set(
    claimedResult.rows.filter(r => r.is_premium).map(r => r.level)
  );

  return {
    seasonId: season?.id || 0,
    seasonName: season?.name || '赛季1',
    seasonStartedAt: season?.started_at || new Date().toISOString(),
    seasonEndsAt: season?.ends_at || new Date(Date.now() + SEASON_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    level: user.season_level || 1,
    exp: user.season_exp || 0,
    isPremium: user.is_premium || false,
    rewards: SEASON_REWARDS.map(r => ({
      ...r,
      freeClaimed: freeClaimedLevels.has(r.level),
      premiumClaimed: premiumClaimedLevels.has(r.level),
    })),
  };
}

/**
 * 购买通行证
 */
export async function buySeasonPass(userId: string): Promise<{ success: true }> {
  return withTransaction(async (tx) => {
    // 检查是否已购买
    const userResult = await tx.query(
      `SELECT is_premium FROM users WHERE id = $1 FOR UPDATE`,
      [userId]
    );

    if (userResult.rows[0]?.is_premium) {
      throw new AppError(ErrorCode.CONFLICT, '已购买高级通行证');
    }

    // 更新为高级通行证
    await tx.query(
      `UPDATE users SET is_premium = true WHERE id = $1`,
      [userId]
    );

    return { success: true };
  });
}

/**
 * 添加赛季经验
 */
// 仅更新用户赛季经验并处理等级提升，无返回值；调用方按 fire-and-forget 处理
export async function addSeasonExp(userId: string, exp: number): Promise<void> {
  // 设计原因：原实现仅累加 season_exp 不更新 season_level，导致用户经验持续增长但等级始终为 1，
  // 后续 claimSeasonReward 校验 user.season_level < level 永远抛"等级不足"，奖励无法领取
  // 此处在 UPDATE 时根据累加后的 season_exp 重算 season_level（每级 100 exp），
  // 用 GREATEST 防止降级；season_level/season_exp 均为 INT，PostgreSQL 整数除法直接得整级数
  await pool.query(
    `UPDATE users SET season_exp = season_exp + $1, season_level = GREATEST(season_level, (season_exp + $1) / 100 + 1) WHERE id = $2`,
    [exp, userId]
  );
}

/**
 * 领取赛季奖励
 */
export async function claimSeasonReward(userId: string, level: number, isPremium: boolean): Promise<{ success: true }> {
  // 查询当前赛季 ID：与 getCurrentSeason 一致，避免硬编码 season_id=0 导致跨赛季奖励领取阻塞
  // 设计原因：原实现三处硬编码 0，但 getCurrentSeason 已用真实 season.id 查询，
  // 导致领取记录与显示查询错位，新赛季开始后老赛季奖励被记到 season_id=0 形成跨赛季污染
  // 统一走 getCurrentSeasonInfo helper，仅取 id 字段（多返回字段被忽略，行为等价）
  const seasonId = (await getCurrentSeasonInfo())?.id ?? 0;

  // 事务外 fast-fail 预检查：避免无谓获取事务客户端，改善 UX
  // 注意：此处非权威检查，并发请求可能都通过预检查，真正拦截在事务内 advisory lock 后的权威检查
  const userResult = await pool.query(
    `SELECT season_level, is_premium FROM users WHERE id = $1`,
    [userId]
  );

  if (userResult.rows.length === 0) {
    throw new AppError(ErrorCode.NOT_FOUND, '用户不存在');
  }

  const user = userResult.rows[0];

  if (user.season_level < level) {
    throw new AppError(ErrorCode.BAD_REQUEST, '等级不足');
  }

  if (isPremium && !user.is_premium) {
    throw new AppError(ErrorCode.BAD_REQUEST, '需要高级通行证');
  }

  // 检查是否已领取（预检查）
  const claimedResult = await pool.query(
    `SELECT id FROM user_season_rewards WHERE user_id = $1 AND season_id = $2 AND level = $3 AND is_premium = $4`,
    [userId, seasonId, level, isPremium]
  );

  if (claimedResult.rows.length > 0) {
    throw new AppError(ErrorCode.CONFLICT, '奖励已领取');
  }

  return withTransaction(async (tx) => {
    // 事务内 advisory lock：基于 userId+level+isPremium 哈希获取事务级锁，串行化同用户同等级同类型并发领取
    // 设计原因：原实现检查在事务外，并发请求都查到未领取后进入事务，串行 INSERT 都成功都发奖
    // pg_advisory_xact_lock 在事务结束自动释放，无需 DDL 变更，是 PostgreSQL 标准并发控制方案
    await advisoryXactLock(tx, `${userId}:${level}:${isPremium}`);

    // 事务内权威检查：重新查询领取状态，advisory lock 串行化后前一个请求已 COMMIT
    const recheck = await tx.query(
      `SELECT id FROM user_season_rewards WHERE user_id = $1 AND season_id = $2 AND level = $3 AND is_premium = $4`,
      [userId, seasonId, level, isPremium]
    );

    if (recheck.rows.length > 0) {
      throw new AppError(ErrorCode.CONFLICT, '奖励已领取');
    }

    // 记录领取
    await tx.query(
      `INSERT INTO user_season_rewards (user_id, season_id, level, is_premium)
       VALUES ($1, $2, $3, $4)`,
      [userId, seasonId, level, isPremium]
    );

    // 发放奖励
    const reward = SEASON_REWARDS.find(r => r.level === level);
    if (reward) {
      const rewardType = isPremium ? 'premium_reward_type' : 'free_reward_type';
      const rewardId = isPremium ? reward.premium_reward_id : 0;
      // 设计原因：reward 已是 SeasonReward 类型，接口已定义 free_reward_type_amount?: number，
      // 无需 as unknown as 强转；用 ?? 替代 || 仅在 undefined/null 时取默认值，语义更精确
      const rewardAmount = reward.free_reward_type_amount ?? 0;

      if (rewardType === 'free_reward_type') {
        await tx.query(
          `UPDATE users SET gold = gold + $1 WHERE id = $2`,
          [rewardAmount, userId]
        );
      } else {
        await tx.query(
          `INSERT INTO user_inventory (user_id, item_type, item_id) VALUES ($1, $2, $3)`,
          [userId, reward.premium_reward_type, rewardId]
        );
      }
    }

    return { success: true };
  });
}