// server/src/services/settle-service.ts
// 游戏结算服务

import pool from '../config/database.js';
import { AppError, ErrorCode } from '../utils/error.js';
import type { GameMode } from '../types/game.js';

interface SettleInput {
  roomId: string;
  mode: GameMode;
  durationSeconds: number;
  players: {
    userId: string;
    nickname: string;
    score: number;
    damage: number;
    isMvp: boolean;
    stressKeywords?: string[];
  }[];
}

// 单玩家奖励信息：路由透传给前端展示，必须与实际入库值一致
export interface SettleReward {
  userId: string;
  rank: number;
  isMvp: boolean;
  exp: number;
  gold: number;
  points: number;
}

// 结算结果：包含记录 ID 与各玩家奖励，供路由直接透传
export interface SettleResult {
  success: true;
  recordId: string;
  rewards: SettleReward[];
}

export async function settleGame(input: SettleInput): Promise<SettleResult> {
  const { roomId, mode, durationSeconds, players } = input;

  // 事务外 fast-fail 预检查：避免无谓获取事务客户端，改善 UX
  // 注意：此处非权威检查，并发请求可能都通过预检查，真正拦截在事务内 advisory lock 后的权威检查
  const existing = await pool.query(
    'SELECT id FROM game_records WHERE room_id = $1',
    [roomId]
  );
  if (existing.rows.length > 0) {
    throw new AppError(ErrorCode.CONFLICT, '该房间已结算');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 事务内 advisory lock：基于 roomId 哈希获取事务级锁，串行化同房间并发结算请求
    // 设计原因：原实现幂等检查在事务外，并发请求都查到不存在后各自进入事务，串行 INSERT 会重复发奖
    // pg_advisory_xact_lock 在事务结束自动释放，无需 DDL 变更，是 PostgreSQL 标准并发控制方案
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [roomId]);

    // 事务内权威检查：advisory lock 串行化后，前一个请求已 COMMIT，此处能查到记录
    const recheck = await client.query(
      'SELECT id FROM game_records WHERE room_id = $1',
      [roomId]
    );
    if (recheck.rows.length > 0) {
      throw new AppError(ErrorCode.CONFLICT, '该房间已结算');
    }

    // 找出 MVP（分数最高，Boss 模式还要考虑伤害）
    const sortedPlayers = [...players].sort((a, b) => {
      if (mode === 'boss') {
        return b.damage - a.damage || b.score - a.score;
      }
      return b.score - a.score;
    });
    sortedPlayers.forEach((p, i) => {
      p.isMvp = i === 0;
    });

    // 计算奖励
    const rewardRate = mode === 'boss' ? 2 : mode === 'brawl' ? 1.5 : 1;
    const baseExp = Math.floor(50 * rewardRate);
    const baseGold = Math.floor(30 * rewardRate);

    // 写入 game_records
    const recordResult = await client.query(
      `INSERT INTO game_records (room_id, mode, duration_seconds, started_at, ended_at, total_score)
       VALUES ($1, $2, $3, NOW() - INTERVAL '${durationSeconds} seconds', NOW(), $4)
       RETURNING id`,
      [roomId, mode, durationSeconds, players.reduce((sum, p) => sum + p.score, 0)]
    );
    const recordId = recordResult.rows[0].id;

    // 收集实际入库的奖励数据，COMMIT 后返回供路由透传
    // 设计原因：原实现路由自行计算奖励返回前端，与 service 实际入库公式不一致（名次阶梯 vs 模式倍率），
    // 用户看到的奖励与实际到账不符。改为 service 返回权威值，路由透传，消除双份计算逻辑
    const rewards: SettleReward[] = [];

    // 写入 game_record_players + 更新用户经验金币
    // 用 entries 索引计算 rank，避免 indexOf 在循环内 O(n) 查找导致总体 O(n²)
    for (const [index, player] of sortedPlayers.entries()) {
      const expReward = Math.floor(baseExp * (player.isMvp ? 1.5 : 1));
      const goldReward = Math.floor(baseGold * (player.isMvp ? 1.5 : 1));
      const pointsReward = Math.floor(player.score / 100);
      const rank = index + 1;

      await client.query(
        `INSERT INTO game_record_players 
         (record_id, user_id, nickname, score, rank, damage, is_mvp, exp_reward, gold_reward, stress_keywords)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [recordId, player.userId, player.nickname, player.score,
         rank, player.damage, player.isMvp,
         expReward, goldReward, player.stressKeywords ?? []]
      );

      await client.query(
        `UPDATE users SET 
         experience = experience + $1,
         gold = gold + $2,
         pvp_points = pvp_points + $3
         WHERE id = $4`,
        [expReward, goldReward, pointsReward, player.userId]
      );

      rewards.push({
        userId: player.userId,
        rank,
        isMvp: player.isMvp,
        exp: expReward,
        gold: goldReward,
        points: pointsReward,
      });
    }

    await client.query('COMMIT');
    return { success: true, recordId, rewards };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
