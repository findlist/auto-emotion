// server/src/services/record-service.ts
// 战绩查询服务

import pool from '../config/database.js';
import { AppError, ErrorCode } from '../utils/error.js';
import { parseCount } from '../utils/param.js';
import type { GameMode } from '../types/game.js';

/**
 * 战绩列表项:game_records JOIN game_record_players 后的扁平结构
 * 设计原因:原 records: any[] 是技术债,SQL 双表 JOIN 返回的字段结构散落在查询语句中,
 * 缺乏统一类型契约导致消费方无法获得类型保护。此处显式声明 JOIN 后字段,
 * 与 settle-service.ts 的 INSERT 字段对齐,保证写入与查询字段一致。
 */
export interface GameRecord {
  // game_records 表字段
  id: number | string;
  room_id: string;
  mode: GameMode;
  duration_seconds: number;
  started_at: Date | string;
  ended_at: Date | string;
  total_score: number;
  created_at: Date | string;
  // game_record_players 表字段(JOIN 带出)
  nickname: string;
  score: number;
  rank: number;
  is_mvp: boolean;
  exp_reward: number;
  gold_reward: number;
}

export interface RecordListResult {
  records: GameRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listRecords(userId: string, page = 1, pageSize = 10): Promise<RecordListResult> {
  const offset = (page - 1) * pageSize;

  const countResult = await pool.query(
    'SELECT COUNT(*) FROM game_record_players WHERE user_id = $1',
    [userId]
  );
  const total = parseCount(countResult.rows[0]);

  const records = await pool.query(
    `SELECT gr.*, grp.nickname, grp.score, grp.rank, grp.is_mvp, grp.exp_reward, grp.gold_reward
     FROM game_records gr
     JOIN game_record_players grp ON grp.record_id = gr.id
     WHERE grp.user_id = $1
     ORDER BY gr.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, pageSize, offset]
  );

  // 显式断言为 GameRecord[]：SQL 双表 JOIN 返回的 any[] 需通过类型断言对接接口契约，
  // 保证消费方获得字段类型保护（接口字段与 SELECT 列严格对齐）
  return { records: records.rows as GameRecord[], total, page, pageSize };
}

// 显式声明返回类型：原缺失返回类型注解导致调用方拿到 any，丢失接口契约保护
export async function getRecord(recordId: string, userId: string): Promise<GameRecord> {
  const result = await pool.query(
    `SELECT gr.*, grp.*
     FROM game_records gr
     JOIN game_record_players grp ON grp.record_id = gr.id
     WHERE gr.id = $1 AND grp.user_id = $2`,
    [recordId, userId]
  );

  if (result.rows.length === 0) {
    throw new AppError(ErrorCode.NOT_FOUND, '战绩不存在');
  }

  return result.rows[0] as GameRecord;
}
