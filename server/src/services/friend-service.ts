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
       WHERE f2.user_id = u.id AND f2.friend_id = f.user_id AND f2.status = 'accepted'
     ) f2 ON true
     WHERE f.user_id = $1 AND f.status = 'accepted'
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
     WHERE f.friend_id = $1 AND f.status = 'pending'
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
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE friendships SET status = 'accepted' WHERE user_id = $1 AND friend_id = $2`,
        [targetUserId, userId]
      );
      await client.query(
        `INSERT INTO friendships (user_id, friend_id, status) VALUES ($1, $2, 'accepted')`,
        [userId, targetUserId]
      );
      await client.query('COMMIT');
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (rbErr) {
        console.error('ROLLBACK 失败:', (rbErr as Error).message);
      }
      throw err;
    } finally {
      client.release();
    }
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
export async function acceptFriendRequest(userId: string, requestId: number) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 检查请求是否存在且属于当前用户
    const requestResult = await client.query(
      `SELECT user_id, friend_id FROM friendships
       WHERE id = $1 AND friend_id = $2 AND status = 'pending'`,
      [requestId, userId]
    );

    if (requestResult.rows.length === 0) {
      throw new AppError(ErrorCode.NOT_FOUND, '请求不存在或已处理');
    }

    const { user_id: fromUserId, friend_id: toUserId } = requestResult.rows[0];

    // 更新原请求为已接受
    await client.query(
      `UPDATE friendships SET status = 'accepted' WHERE id = $1`,
      [requestId]
    );

    // 创建双向好友关系
    await client.query(
      `INSERT INTO friendships (user_id, friend_id, status) VALUES ($1, $2, 'accepted')
       ON CONFLICT DO NOTHING`,
      [fromUserId, toUserId]
    );

    await client.query('COMMIT');
    return { success: true };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (rbErr) {
      console.error('ROLLBACK 失败:', (rbErr as Error).message);
    }
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
    `DELETE FROM friendships WHERE id = $1 AND friend_id = $2 AND status = 'pending' RETURNING id`,
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
    try { await client.query('ROLLBACK'); } catch (rbErr) {
      console.error('ROLLBACK 失败:', (rbErr as Error).message);
    }
    throw err;
  } finally {
    client.release();
  }
}