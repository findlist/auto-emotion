import { Router, Request, Response } from 'express';
import { getFriends, getPendingRequests, sendFriendRequest, acceptFriendRequest, rejectFriendRequest, removeFriend } from '../services/friend-service.js';
import { success, fail } from '../utils/response.js';
import { getErrorMessage } from '../utils/error.js';

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
    const msg = getErrorMessage(err, '获取好友列表失败');
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
    const msg = getErrorMessage(err, '获取好友请求失败');
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

  // targetUserId 为 UUID 字符串（与 users.id 对齐），原 number 类型会导致 service 层接收截断数字
  const { targetUserId } = req.body as { targetUserId?: string };
  if (!targetUserId) {
    fail(res, 400, '缺少目标用户ID');
    return;
  }

  try {
    const result = await sendFriendRequest(user.userId, targetUserId);
    success(res, result);
  } catch (err) {
    const msg = getErrorMessage(err, '发送好友请求失败');
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

  // requestId 为 UUID 字符串（与 friendships.id 对齐）
  const { requestId } = req.body as { requestId?: string };
  if (!requestId) {
    fail(res, 400, '缺少请求ID');
    return;
  }

  try {
    const result = await acceptFriendRequest(user.userId, requestId);
    success(res, result);
  } catch (err) {
    const msg = getErrorMessage(err, '接受好友请求失败');
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

  // requestId 为 UUID 字符串（与 friendships.id 对齐）
  const { requestId } = req.body as { requestId?: string };
  if (!requestId) {
    fail(res, 400, '缺少请求ID');
    return;
  }

  try {
    const result = await rejectFriendRequest(user.userId, requestId);
    success(res, result);
  } catch (err) {
    const msg = getErrorMessage(err, '拒绝好友请求失败');
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

  // friendId 为 UUID 字符串，直接取路由参数（原 parseIdParam 会截断 UUID 导致 SQL 报错）
  const friendId = Array.isArray(req.params.friendId) ? req.params.friendId[0] : req.params.friendId;
  if (!friendId) {
    fail(res, 400, '无效的好友ID');
    return;
  }

  try {
    const result = await removeFriend(user.userId, friendId);
    success(res, result);
  } catch (err) {
    const msg = getErrorMessage(err, '删除好友失败');
    fail(res, 400, msg);
  }
});

export default router;