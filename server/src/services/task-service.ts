// server/src/services/task-service.ts
// 每日任务服务

import pool from '../config/database.js';
import { AppError, ErrorCode } from '../utils/error.js';
import { withTransaction, advisoryXactLock } from '../utils/transaction.js';
import { parseCount } from '../utils/param.js';
import { shuffle } from '../utils/shuffle.js';
// 奖励发放统一封装：claimTaskReward 任务领奖累加经验金币，与 idle-engine/idle-service 同源对称
import { addExperienceAndGold } from '../utils/gold.js';

interface DailyTask {
  id: number;
  code: string;
  name: string;
  type: number;
  target: number;
  reward_exp: number;
  reward_gold: number;
}

// 任务合并视图：在 DailyTask 基础上叠加用户进度与领取状态
// 设计原因：getDailyTasks 需将 daily_tasks 模板与 user_daily_tasks 进度合并返回前端，
// 显式类型契约便于调用方与前端追溯完整字段结构
interface TaskWithProgress extends DailyTask {
  progress: number;
  claimed: boolean;
}

// 预设的每日任务模板
const DAILY_TASK_TEMPLATES: Omit<DailyTask, 'id'>[] = [
  { code: 'daily_battle_2', name: '完成2局对战', type: 0, target: 2, reward_exp: 50, reward_gold: 100 },
  { code: 'daily_battle_5', name: '完成5局对战', type: 0, target: 5, reward_exp: 100, reward_gold: 200 },
  { code: 'daily_idle_30', name: '挂机30分钟', type: 1, target: 30, reward_exp: 50, reward_gold: 100 },
  { code: 'daily_idle_60', name: '挂机60分钟', type: 1, target: 60, reward_exp: 100, reward_gold: 200 },
  { code: 'daily_friend_1', name: '与好友组队1局', type: 2, target: 1, reward_exp: 50, reward_gold: 100 },
];

/**
 * 获取今日日期字符串
 */
function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * 确保今日任务存在（每日0点生成）
 */
async function ensureDailyTasksExist(): Promise<void> {
  const today = getTodayStr();

  // 检查今日任务是否已生成
  const existingResult = await pool.query(
    `SELECT COUNT(*) as count FROM daily_tasks WHERE date = $1`,
    [today]
  );

  if (parseCount(existingResult.rows[0]) > 0) {
    return; // 今日任务已生成
  }

  // 随机选择3个任务模板：Fisher-Yates 洗牌保证均匀分布
  // 原 .sort(() => Math.random() - 0.5) 分布有偏，已迁移到 utils/shuffle.ts
  const shuffled = shuffle(DAILY_TASK_TEMPLATES);
  const selected = shuffled.slice(0, 3);

  // 插入今日任务
  for (const task of selected) {
    await pool.query(
      `INSERT INTO daily_tasks (code, name, type, target, reward_exp, reward_gold, date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [task.code, task.name, task.type, task.target, task.reward_exp, task.reward_gold, today]
    );
  }
}

/**
 * 获取用户的每日任务列表
 */
export async function getDailyTasks(userId: string): Promise<TaskWithProgress[]> {
  const today = getTodayStr();

  // 确保今日任务存在
  await ensureDailyTasksExist();

  // 获取今日任务模板
  const tasksResult = await pool.query(
    `SELECT id, code, name, type, target, reward_exp, reward_gold
     FROM daily_tasks WHERE date = $1 ORDER BY id`,
    [today]
  );

  // 获取用户任务进度
  const userTasksResult = await pool.query(
    `SELECT ut.id, ut.task_id, ut.progress, ut.claimed
     FROM user_daily_tasks ut
     JOIN daily_tasks dt ON dt.id = ut.task_id
     WHERE ut.user_id = $1 AND dt.date = $2`,
    [userId, today]
  );

  const userTaskMap = new Map(
    userTasksResult.rows.map((ut) => [ut.task_id, ut])
  );

  // 合并数据
  const tasks = tasksResult.rows.map((task) => {
    const userTask = userTaskMap.get(task.id);
    return {
      id: task.id,
      code: task.code,
      name: task.name,
      type: task.type,
      target: task.target,
      progress: userTask?.progress ?? 0,
      claimed: userTask?.claimed ?? false,
      reward_exp: task.reward_exp,
      reward_gold: task.reward_gold,
    };
  });

  return tasks as TaskWithProgress[];
}

/**
 * 更新任务进度
 */
export async function updateTaskProgress(userId: string, taskType: number, delta: number): Promise<void> {
  const today = getTodayStr();

  // 获取今日该类型任务
  const tasksResult = await pool.query(
    `SELECT dt.id, dt.target, udt.progress, udt.id as user_task_id
     FROM daily_tasks dt
     LEFT JOIN user_daily_tasks udt ON udt.task_id = dt.id AND udt.user_id = $1
     WHERE dt.date = $2 AND dt.type = $3`,
    [userId, today, taskType]
  );

  for (const row of tasksResult.rows) {
    if (row.user_task_id) {
      // 已有记录：用原子自增 progress = progress + $1 避免并发 read-then-write 丢失更新
      // 设计原因：原实现先 SELECT progress 再 UPDATE 计算值 newProgress，两个并发请求读到相同 progress 后
      // 各自 UPDATE 相同值，本应 +2*delta 实际只 +delta，丢失一次更新
      await pool.query(
        `UPDATE user_daily_tasks SET progress = progress + $1 WHERE id = $2`,
        [delta, row.user_task_id]
      );
    } else {
      // 首次创建记录：用 ON CONFLICT DO UPDATE 兜底并发竞态
      // 设计原因：schema 已有 UNIQUE(user_id, task_id, date) 约束，两个并发请求同时进入此分支时，
      // 第二个 INSERT 会触发 unique violation 报错而非静默重复。改用 ON CONFLICT 转为累加更新，
      // 保证并发请求都能成功并正确累加 progress，避免任务进度丢失或接口 500
      await pool.query(
        `INSERT INTO user_daily_tasks (user_id, task_id, progress, claimed, date)
         VALUES ($1, $2, $3, false, $4)
         ON CONFLICT (user_id, task_id, date) DO UPDATE SET progress = user_daily_tasks.progress + $3`,
        [userId, row.id, delta, today]
      );
    }
  }
}

/**
 * 领取任务奖励
 */
export async function claimTaskReward(userId: string, taskId: number): Promise<{ success: true; reward_exp: number; reward_gold: number }> {
  const today = getTodayStr();

  // 事务外 fast-fail 预检查：避免无谓获取事务客户端，改善 UX
  // 注意：此处非权威检查，并发请求可能都通过预检查，真正拦截在事务内 advisory lock 后的权威检查
  const taskResult = await pool.query(
    `SELECT dt.*, udt.progress, udt.claimed, udt.id as user_task_id
     FROM daily_tasks dt
     LEFT JOIN user_daily_tasks udt ON udt.task_id = dt.id AND udt.user_id = $1
     WHERE dt.id = $2 AND dt.date = $3`,
    [userId, taskId, today]
  );

  if (taskResult.rows.length === 0) {
    throw new AppError(ErrorCode.NOT_FOUND, '任务不存在');
  }

  const task = taskResult.rows[0];

  if (task.claimed) {
    throw new AppError(ErrorCode.CONFLICT, '已领取奖励');
  }

  if (task.progress < task.target) {
    throw new AppError(ErrorCode.BAD_REQUEST, '任务未完成');
  }

  return withTransaction(async (tx) => {
    // 事务内 advisory lock：基于 userId+taskId 哈希获取事务级锁，串行化同用户同任务并发领取
    // 设计原因：原实现检查在事务外，并发请求都查到 claimed=false 后进入事务，串行 UPDATE 都设 true 但都发奖
    // pg_advisory_xact_lock 在事务结束自动释放，无需 DDL 变更，是 PostgreSQL 标准并发控制方案
    await advisoryXactLock(tx, `${userId}:${taskId}`);

    // 事务内权威检查：重新查询任务领取状态，advisory lock 串行化后前一个请求已 COMMIT
    const recheck = await tx.query(
      `SELECT udt.claimed, udt.id as user_task_id, udt.progress
       FROM user_daily_tasks udt
       WHERE udt.user_id = $1 AND udt.task_id = $2 AND udt.date = $3`,
      [userId, taskId, today]
    );

    // 用户已有记录时检查 claimed，无记录时（首次领取）跳过此检查走 INSERT 分支
    if (recheck.rows.length > 0 && recheck.rows[0].claimed) {
      throw new AppError(ErrorCode.CONFLICT, '已领取奖励');
    }

    // 更新领取状态
    if (recheck.rows.length > 0) {
      await tx.query(
        `UPDATE user_daily_tasks SET claimed = true WHERE id = $1`,
        [recheck.rows[0].user_task_id]
      );
    } else {
      await tx.query(
        `INSERT INTO user_daily_tasks (user_id, task_id, progress, claimed, date)
         VALUES ($1, $2, $3, true, $4)`,
        [userId, taskId, task.target, today]
      );
    }

    // 发放奖励
    await addExperienceAndGold(tx, userId, task.reward_exp, task.reward_gold);

    return {
      success: true,
      reward_exp: task.reward_exp,
      reward_gold: task.reward_gold,
    };
  });
}