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

// 文件内私有 helper：注册 friends 单参数 POST 路由（request/accept/reject）
// 设计原因：三个路由结构完全同构，仅 body 字段名、缺失提示文案、service 函数、错误文案不同；
// 抽取后消除"鉴权 → ID 校验 → 调 service → success/routeBusinessError"的重复样板
// 不导出：仅本文件内使用，GET / 与 GET /requests 因无 body 校验不在抽取范围，
//   DELETE /:friendId 因参数来自 path 不在抽取范围
// ID 类型说明：targetUserId / requestId 均为 UUID 字符串（与 users.id / friendships.id 对齐），
//   历史上 number 类型会导致 service 层接收截断数字，故 helper 强制 string 类型
function registerFriendPostRoute(
  path: string,
  bodyField: 'targetUserId' | 'requestId',
  missingMsg: string,
  serviceFn: (userId: string, id: string) => Promise<unknown>,
  errorMsg: string
): void {
  router.post(path, async (req: Request, res: Response) => {
    const user = req.user;
    if (!requireUser(res, user)) return;

    const body = req.body as { targetUserId?: string; requestId?: string };
    const id = body[bodyField];
    if (!id) {
      fail(res, 400, missingMsg);
      return;
    }

    try {
      const result = await serviceFn(user.userId, id);
      success(res, result);
    } catch (err) {
      // POST 路由业务异常统一降级 400（不透传 AppError.code，保持 POST 异常契约稳定）
      routeBusinessError(res, err, errorMsg);
    }
  });
}

// POST /api/friends/request - 发送好友请求
// POST /api/friends/accept - 接受好友请求
// POST /api/friends/reject - 拒绝好友请求
registerFriendPostRoute('/request', 'targetUserId', '缺少目标用户ID', sendFriendRequest, '发送好友请求失败');
registerFriendPostRoute('/accept', 'requestId', '缺少请求ID', acceptFriendRequest, '接受好友请求失败');
registerFriendPostRoute('/reject', 'requestId', '缺少请求ID', rejectFriendRequest, '拒绝好友请求失败');

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