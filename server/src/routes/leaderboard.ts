import { Router, Request, Response } from 'express';
import {
  getPowerLeaderboard,
  getBattleLeaderboard,
  getSpeedLeaderboard,
  getUserRank,
  getFriendsLeaderboard,
  getFriendsUserRank,
} from '../services/leaderboard-service.js';
import { success, fail } from '../utils/response.js';
import { authMiddleware } from '../middleware/auth.js';
import { routeError } from '../utils/route-error.js';
import { parsePagination, firstParam } from '../utils/param.js';
import { requireUser } from '../utils/auth-guard.js';

const router = Router();

// 文件内私有 helper：注册 power/battle/speed 三类公开榜单路由
// 设计原因：三个路由结构完全一致，仅 service 函数引用与错误文案不同；
// 抽取后消除"解析分页 → 调 service → success/routeError"的重复样板
// 不导出：仅本文件内使用，好友榜与个人排名路由因鉴权/参数差异不在抽取范围
function registerPublicLeaderboardRoute(
  path: string,
  serviceFn: (page: number, pageSize: number) => Promise<unknown>,
  errorMsg: string
): void {
  router.get(path, async (req: Request, res: Response) => {
    const { page, pageSize } = parsePagination(req.query);

    try {
      const result = await serviceFn(page, pageSize);
      success(res, result);
    } catch (err) {
      routeError(res, err, errorMsg);
    }
  });
}

// GET /api/leaderboard/power - 战力榜
// GET /api/leaderboard/battle - 对战榜
// GET /api/leaderboard/speed - 速度榜
registerPublicLeaderboardRoute('/power', getPowerLeaderboard, '获取战力榜失败');
registerPublicLeaderboardRoute('/battle', getBattleLeaderboard, '获取对战榜失败');
registerPublicLeaderboardRoute('/speed', getSpeedLeaderboard, '获取速度榜失败');

// GET /api/leaderboard/friends - 好友榜（需登录鉴权）
router.get('/friends', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user;
  if (!requireUser(res, user)) return;

  const { page, pageSize } = parsePagination(req.query);

  try {
    const result = await getFriendsLeaderboard(user.userId, page, pageSize);
    success(res, result);
  } catch (err) {
    routeError(res, err, '获取好友榜失败');
  }
});

// GET /api/leaderboard/:type/me - 获取个人排名（需登录鉴权）
router.get('/:type/me', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user;
  if (!requireUser(res, user)) return;

  // type 为字符串枚举（power/battle/speed/friends），用 firstParam 收窄路由参数类型
  const type = firstParam(req.params.type);
  const validTypes = ['power', 'battle', 'speed', 'friends'];

  if (!validTypes.includes(type)) {
    fail(res, 400, '无效的榜单类型');
    return;
  }

  try {
    let result;
    if (type === 'friends') {
      // 好友榜个人排名需限定在好友圈内计算，不能复用全服 getUserRank
      result = await getFriendsUserRank(user.userId);
    } else if (type === 'power' || type === 'battle' || type === 'speed') {
      result = await getUserRank(user.userId, type);
    } else {
      fail(res, 400, '无效的榜单类型');
      return;
    }

    if (result) {
      success(res, result);
    } else {
      fail(res, 404, '未找到排名');
    }
  } catch (err) {
    routeError(res, err, '获取排名失败');
  }
});

export default router;