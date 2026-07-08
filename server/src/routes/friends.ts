import { Router, Request, Response } from 'express';
import { getFriends, getPendingRequests, sendFriendRequest, acceptFriendRequest, rejectFriendRequest, removeFriend } from '../services/friend-service.js';
import { success, fail } from '../utils/response.js';

const router = Router();

// GET /api/friends - 获取好友列表
router.get('/', async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    fail(res, 401, '未授权');
    return;
  }

  try {
    const friends = await getFriends(user.userId);
    success(res, { friends });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '获取好友列表失败';
    fail(res, 500, msg);
  }
});

// GET /api/friends/requests - 获取待处理的好友请求
router.get('/requests', async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    fail(res, 401, '未授权');
    return;
  }

  try {
    const requests = await getPendingRequests(user.userId);
    success(res, { requests });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '获取好友请求失败';
    fail(res, 500, msg);
  }
});

// POST /api/friends/request - 发送好友请求
router.post('/request', async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    fail(res, 401, '未授权');
    return;
  }

  const { targetUserId } = req.body as { targetUserId?: number };
  if (!targetUserId) {
    fail(res, 400, '缺少目标用户ID');
    return;
  }

  try {
    const result = await sendFriendRequest(user.userId, targetUserId);
    success(res, result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '发送好友请求失败';
    fail(res, 400, msg);
  }
});

// POST /api/friends/accept - 接受好友请求
router.post('/accept', async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    fail(res, 401, '未授权');
    return;
  }

  const { requestId } = req.body as { requestId?: number };
  if (!requestId) {
    fail(res, 400, '缺少请求ID');
    return;
  }

  try {
    const result = await acceptFriendRequest(user.userId, requestId);
    success(res, result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '接受好友请求失败';
    fail(res, 400, msg);
  }
});

// POST /api/friends/reject - 拒绝好友请求
router.post('/reject', async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    fail(res, 401, '未授权');
    return;
  }

  const { requestId } = req.body as { requestId?: number };
  if (!requestId) {
    fail(res, 400, '缺少请求ID');
    return;
  }

  try {
    const result = await rejectFriendRequest(user.userId, requestId);
    success(res, result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '拒绝好友请求失败';
    fail(res, 400, msg);
  }
});

// DELETE /api/friends/:friendId - 删除好友
router.delete('/:friendId', async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    fail(res, 401, '未授权');
    return;
  }

  const friendIdStr = req.params.friendId;
  const friendId = parseInt(Array.isArray(friendIdStr) ? friendIdStr[0] : friendIdStr, 10);
  if (isNaN(friendId)) {
    fail(res, 400, '无效的好友ID');
    return;
  }

  try {
    const result = await removeFriend(user.userId, friendId);
    success(res, result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '删除好友失败';
    fail(res, 400, msg);
  }
});

export default router;