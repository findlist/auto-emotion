// server/src/services/friend-service.ts
// 好友服务

import pool from '../config/database.js';
import { AppError, ErrorCode, ensureFound } from '../utils/error.js';
import { withTransaction } from '../utils/transaction.js';

// 好友列表行：对应 getFriends 的 SQL JOIN 结果，online 由 LATERAL 子查询计算
interface FriendRow {
  id: string;
  nickname: string;
  avatar_url: string | null;
  status: string;
  online: boolean;
}

// 待处理请求行：对应 getPendingRequests 的 SQL 查询结果
interface PendingRequestRow {
  // friendships.id 为 UUID，pg 返回 string，类型对齐避免 number 截断
  id: string;
  from_user_id: string;
  nickname: string;
  avatar_url: string | null;
  created_at: Date;
}

/**
 * 获取好友列表
 */
export async function getFriends(userId: string): Promise<FriendRow[]> {
  const result = await pool.query(
    `SELECT u.id, u.nickname, u.avatar_url, u.status,
            CASE WHEN f2.user_id IS NOT NULL THEN true ELSE false END as online
     FROM friendships f
     JOIN users u ON u.id = f.friend_id
     LEFT JOIN LATERAL (
       SELECT 1 FROM friendships f2
       WHERE f2.user_id = u.id AND f2.friend_id = f.user_id AND f2.status = 'accepted'
     ) f2 ON true
     WHERE f.user_id = $1 AND f.status = 'accepted'
     ORDER BY u.nickname`,
    [userId]
  );
  // SQL 返回 any[]，断言对接 FriendRow 接口契约，便于调用方与前端类型可追溯
  return result.rows as FriendRow[];
}

/**
 * 获取收到的好友请求
 */
export async function getPendingRequests(userId: string): Promise<PendingRequestRow[]> {
  const result = await pool.query(
    `SELECT f.id, f.user_id as from_user_id, u.nickname, u.avatar_url, f.created_at
     FROM friendships f
     JOIN users u ON u.id = f.user_id
     WHERE f.friend_id = $1 AND f.status = 'pending'
     ORDER BY f.created_at DESC`,
    [userId]
  );
  return result.rows as PendingRequestRow[];
}

/**
 * 发送好友请求
 */
// 联合类型：双向已存在请求时走自动接受分支返回 autoAccepted，否则走新建请求分支返回 requestId
export async function sendFriendRequest(
  userId: string,
  // users.id 为 UUID，targetUserId 改为 string 与 schema 对齐；
  // 原声明 number 会导致 UUID 字符串经 parseInt 截断后传给 SQL 报 invalid input syntax for type uuid
  targetUserId: string
): Promise<{ success: true; autoAccepted: true } | { success: true; requestId: string }> {
  if (userId === targetUserId) {
    throw new AppError(ErrorCode.BAD_REQUEST, '不能添加自己为好友');
  }

  // 检查目标用户是否存在
  const userResult = await pool.query('SELECT id FROM users WHERE id = $1', [targetUserId]);
  ensureFound(userResult.rows, '用户不存在');

  // 检查是否已经是好友
  const friendCheck = await pool.query(
    `SELECT id FROM friendships
     WHERE user_id = $1 AND friend_id = $2 AND status = 'accepted'`,
    [userId, targetUserId]
  );
  if (friendCheck.rows.length > 0) {
    throw new AppError(ErrorCode.CONFLICT, '已是好友');
  }

  // 检查是否已有待处理的请求
  const pendingCheck = await pool.query(
    `SELECT id FROM friendships
     WHERE user_id = $1 AND friend_id = $2 AND status = 'pending'`,
    [userId, targetUserId]
  );
  if (pendingCheck.rows.length > 0) {
    throw new AppError(ErrorCode.CONFLICT, '已发送过好友请求');
  }

  // 检查是否收到过对方的请求（双向处理）
  const reverseCheck = await pool.query(
    `SELECT id FROM friendships
     WHERE user_id = $1 AND friend_id = $2 AND status = 'pending'`,
    [targetUserId, userId]
  );
  if (reverseCheck.rows.length > 0) {
    // 双向建立好友关系需事务保护：UPDATE 对方请求为已接受 + INSERT 自己侧好友记录
    // 设计原因：两步分开执行若中间失败会导致单向好友关系（对方是好友、自己不是），
    // 数据不一致且难以排查；事务保证原子性，失败整体回滚
    // withTransaction 自动管理 BEGIN/COMMIT/ROLLBACK/release，ROLLBACK 失败兜底文案统一为「未知错误」
    await withTransaction(async (tx) => {
      await tx.query(
        `UPDATE friendships SET status = 'accepted' WHERE user_id = $1 AND friend_id = $2`,
        [targetUserId, userId]
      );
      await tx.query(
        `INSERT INTO friendships (user_id, friend_id, status) VALUES ($1, $2, 'accepted')`,
        [userId, targetUserId]
      );
    });
    return { success: true, autoAccepted: true };
  }

  // 发送好友请求
  const result = await pool.query(
    `INSERT INTO friendships (user_id, friend_id, status) VALUES ($1, $2, 'pending') RETURNING id`,
    [userId, targetUserId]
  );
  return { success: true, requestId: result.rows[0].id };
}

/**
 * 接受好友请求
 */
export async function acceptFriendRequest(
  userId: string,
  // friendships.id 为 UUID，requestId 改为 string 与 schema 对齐
  requestId: string
): Promise<{ success: true }> {
  // withTransaction 自动管理 BEGIN/COMMIT/ROLLBACK/release，AppError 抛出会触发 ROLLBACK 并透传
  return withTransaction(async (tx) => {
    // 检查请求是否存在且属于当前用户
    const requestResult = await tx.query(
      `SELECT user_id, friend_id FROM friendships
       WHERE id = $1 AND friend_id = $2 AND status = 'pending'`,
      [requestId, userId]
    );

    ensureFound(requestResult.rows, '请求不存在或已处理');

    const { user_id: fromUserId, friend_id: toUserId } = requestResult.rows[0];

    // 更新原请求为已接受
    await tx.query(
      `UPDATE friendships SET status = 'accepted' WHERE id = $1`,
      [requestId]
    );

    // 创建反向好友关系：原 pending 记录方向为 (fromUserId → toUserId)，
    // UPDATE 已将其设为 accepted；此处 INSERT 需建立反向记录 (toUserId → fromUserId)
    // 才能让接收者在 getFriends 中查到（f.user_id = 接收者）。
    // 原参数 [fromUserId, toUserId] 会触发 UNIQUE(user_id, friend_id) ON CONFLICT DO NOTHING 被忽略，
    // 导致接收者接受请求后看不到对方为好友（单向好友关系）
    await tx.query(
      `INSERT INTO friendships (user_id, friend_id, status) VALUES ($1, $2, 'accepted')
       ON CONFLICT DO NOTHING`,
      [toUserId, fromUserId]
    );

    return { success: true };
  });
}

/**
 * 拒绝好友请求
 */
export async function rejectFriendRequest(
  userId: string,
  // friendships.id 为 UUID，requestId 改为 string 与 schema 对齐
  requestId: string
): Promise<{ success: true }> {
  const result = await pool.query(
    `DELETE FROM friendships WHERE id = $1 AND friend_id = $2 AND status = 'pending' RETURNING id`,
    [requestId, userId]
  );

  ensureFound(result.rows, '请求不存在或已处理');

  return { success: true };
}

/**
 * 删除好友
 */
// friendId 改为 string 与 users.id UUID 类型对齐；
// 原声明 number 会导致路由层 parseIdParam 截断 UUID 后传入 SQL 报 invalid input syntax for type uuid
export async function removeFriend(userId: string, friendId: string): Promise<{ success: true }> {
  // withTransaction 自动管理 BEGIN/COMMIT/ROLLBACK/release
  return withTransaction(async (tx) => {
    // 删除双向好友关系
    await tx.query(
      `DELETE FROM friendships WHERE user_id = $1 AND friend_id = $2`,
      [userId, friendId]
    );
    await tx.query(
      `DELETE FROM friendships WHERE user_id = $1 AND friend_id = $2`,
      [friendId, userId]
    );

    return { success: true };
  });
}