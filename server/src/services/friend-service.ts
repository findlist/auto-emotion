// server/src/services/friend-service.ts
// 好友服务

import pool from '../config/database.js';
import { AppError, ErrorCode } from '../utils/error.js';

/**
 * 获取好友列表
 */
export async function getFriends(userId: string) {
  const result = await pool.query(
    `SELECT u.id, u.nickname, u.avatar_url, u.status,
            CASE WHEN f2.user_id IS NOT NULL THEN true ELSE false END as online
     FROM friendships f
     JOIN users u ON u.id = f.friend_id
     LEFT JOIN LATERAL (
       SELECT 1 FROM friendships f2 
       WHERE f2.user_id = u.id AND f2.friend_id = f.user_id AND f2.status = 1
     ) f2 ON true
     WHERE f.user_id = $1 AND f.status = 1
     ORDER BY u.nickname`,
    [userId]
  );
  return result.rows;
}

/**
 * 获取收到的好友请求
 */
export async function getPendingRequests(userId: string) {
  const result = await pool.query(
    `SELECT f.id, f.user_id as from_user_id, u.nickname, u.avatar_url, f.created_at
     FROM friendships f
     JOIN users u ON u.id = f.user_id
     WHERE f.friend_id = $1 AND f.status = 0
     ORDER BY f.created_at DESC`,
    [userId]
  );
  return result.rows;
}

/**
 * 发送好友请求
 */
export async function sendFriendRequest(userId: string, targetUserId: number) {
  if (userId === targetUserId.toString()) {
    throw new AppError(ErrorCode.BAD_REQUEST, '不能添加自己为好友');
  }

  // 检查目标用户是否存在
  const userResult = await pool.query('SELECT id FROM users WHERE id = $1', [targetUserId]);
  if (userResult.rows.length === 0) {
    throw new AppError(ErrorCode.NOT_FOUND, '用户不存在');
  }

  // 检查是否已经是好友
  const friendCheck = await pool.query(
    `SELECT id FROM friendships 
     WHERE user_id = $1 AND friend_id = $2 AND status = 1`,
    [userId, targetUserId]
  );
  if (friendCheck.rows.length > 0) {
    throw new AppError(ErrorCode.CONFLICT, '已是好友');
  }

  // 检查是否已有待处理的请求
  const pendingCheck = await pool.query(
    `SELECT id FROM friendships 
     WHERE user_id = $1 AND friend_id = $2 AND status = 0`,
    [userId, targetUserId]
  );
  if (pendingCheck.rows.length > 0) {
    throw new AppError(ErrorCode.CONFLICT, '已发送过好友请求');
  }

  // 检查是否收到过对方的请求（双向处理）
  const reverseCheck = await pool.query(
    `SELECT id FROM friendships 
     WHERE user_id = $1 AND friend_id = $2 AND status = 0`,
    [targetUserId, userId]
  );
  if (reverseCheck.rows.length > 0) {
    // 直接成为好友
    await pool.query(
      `UPDATE friendships SET status = 1 WHERE user_id = $1 AND friend_id = $2`,
      [targetUserId, userId]
    );
    await pool.query(
      `INSERT INTO friendships (user_id, friend_id, status) VALUES ($1, $2, 1)`,
      [userId, targetUserId]
    );
    return { success: true, autoAccepted: true };
  }

  // 发送好友请求
  const result = await pool.query(
    `INSERT INTO friendships (user_id, friend_id, status) VALUES ($1, $2, 0) RETURNING id`,
    [userId, targetUserId]
  );
  return { success: true, requestId: result.rows[0].id };
}

/**
 * 接受好友请求
 */
export async function acceptFriendRequest(userId: string, requestId: number) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 检查请求是否存在且属于当前用户
    const requestResult = await client.query(
      `SELECT user_id, friend_id FROM friendships 
       WHERE id = $1 AND friend_id = $2 AND status = 0`,
      [requestId, userId]
    );

    if (requestResult.rows.length === 0) {
      throw new AppError(ErrorCode.NOT_FOUND, '请求不存在或已处理');
    }

    const { user_id: fromUserId, friend_id: toUserId } = requestResult.rows[0];

    // 更新原请求为已接受
    await client.query(
      `UPDATE friendships SET status = 1 WHERE id = $1`,
      [requestId]
    );

    // 创建双向好友关系
    await client.query(
      `INSERT INTO friendships (user_id, friend_id, status) VALUES ($1, $2, 1)
       ON CONFLICT DO NOTHING`,
      [fromUserId, toUserId]
    );

    await client.query('COMMIT');
    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 拒绝好友请求
 */
export async function rejectFriendRequest(userId: string, requestId: number) {
  const result = await pool.query(
    `DELETE FROM friendships WHERE id = $1 AND friend_id = $2 AND status = 0 RETURNING id`,
    [requestId, userId]
  );

  if (result.rows.length === 0) {
    throw new AppError(ErrorCode.NOT_FOUND, '请求不存在或已处理');
  }

  return { success: true };
}

/**
 * 删除好友
 */
export async function removeFriend(userId: string, friendId: number) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 删除双向好友关系
    await client.query(
      `DELETE FROM friendships WHERE user_id = $1 AND friend_id = $2`,
      [userId, friendId]
    );
    await client.query(
      `DELETE FROM friendships WHERE user_id = $1 AND friend_id = $2`,
      [friendId, userId]
    );

    await client.query('COMMIT');
    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}