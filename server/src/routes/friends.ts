import { Router, Request, Response } from 'express';
import { getFriends, getPendingRequests, sendFriendRequest, acceptFriendRequest, rejectFriendRequest, removeFriend } from '../services/friend-service.js';
import { success, fail } from '../utils/response.js';
import { routeError, routeBusinessError } from '../utils/route-error.js';
import { firstParam } from '../utils/param.js';
import { requireUser } from '../utils/auth-guard.js';

const router = Router();

// GET /api/friends - 获取好友列表
router.get('/', async (req: Request, res: Response) => {
  const user = req.user;
  if (!requireUser(res, user)) return;

  try {
    const friends = await getFriends(user.userId);
    success(res, { friends });
  } catch (err) {
    // GET 路由异常透传 AppError 错误码，普通 Error 兜底 500，与 leaderboard 路由同模式
    routeError(res, err, '获取好友列表失败');
  }
});

// GET /api/friends/requests - 获取待处理的好友请求
router.get('/requests', async (req: Request, res: Response) => {
  const user = req.user;
  if (!requireUser(res, user)) return;

  try {
    const requests = await getPendingRequests(user.userId);
    success(res, { requests });
  } catch (err) {
    // GET 路由异常透传 AppError 错误码，普通 Error 兜底 500，与 leaderboard 路由同模式
    routeError(res, err, '获取好友请求失败');
  }
});

// POST /api/friends/request - 发送好友请求
router.post('/request', async (req: Request, res: Response) => {
  const user = req.user;
  if (!requireUser(res, user)) return;

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
    // POST 路由业务异常统一降级 400（不透传 AppError.code，保持 POST 异常契约稳定）
    routeBusinessError(res, err, '发送好友请求失败');
  }
});

// POST /api/friends/accept - 接受好友请求
router.post('/accept', async (req: Request, res: Response) => {
  const user = req.user;
  if (!requireUser(res, user)) return;

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
    // POST 路由业务异常统一降级 400（不透传 AppError.code，保持 POST 异常契约稳定）
    routeBusinessError(res, err, '接受好友请求失败');
  }
});

// POST /api/friends/reject - 拒绝好友请求
router.post('/reject', async (req: Request, res: Response) => {
  const user = req.user;
  if (!requireUser(res, user)) return;

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
    // POST 路由业务异常统一降级 400（不透传 AppError.code，保持 POST 异常契约稳定）
    routeBusinessError(res, err, '拒绝好友请求失败');
  }
});

// DELETE /api/friends/:friendId - 删除好友
router.delete('/:friendId', async (req: Request, res: Response) => {
  const user = req.user;
  if (!requireUser(res, user)) return;

  // friendId 为 UUID 字符串，用 firstParam 收窄路由参数（原 parseIdParam 会截断 UUID 导致 SQL 报错）
  const friendId = firstParam(req.params.friendId);
  if (!friendId) {
    fail(res, 400, '无效的好友ID');
    return;
  }

  try {
    const result = await removeFriend(user.userId, friendId);
    success(res, result);
  } catch (err) {
    // DELETE 路由业务异常统一降级 400（不透传 AppError.code，保持 POST/DELETE 异常契约稳定）
    routeBusinessError(res, err, '删除好友失败');
  }
});

export default router;