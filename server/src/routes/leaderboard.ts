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

const router = Router();

// GET /api/leaderboard/power - 战力榜
router.get('/power', async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string, 10) || 1;
  const pageSize = parseInt(req.query.pageSize as string, 10) || 20;

  try {
    const result = await getPowerLeaderboard(page, pageSize);
    success(res, result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '获取战力榜失败';
    fail(res, 500, msg);
  }
});

// GET /api/leaderboard/battle - 对战榜
router.get('/battle', async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string, 10) || 1;
  const pageSize = parseInt(req.query.pageSize as string, 10) || 20;

  try {
    const result = await getBattleLeaderboard(page, pageSize);
    success(res, result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '获取对战榜失败';
    fail(res, 500, msg);
  }
});

// GET /api/leaderboard/speed - 速度榜
router.get('/speed', async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string, 10) || 1;
  const pageSize = parseInt(req.query.pageSize as string, 10) || 20;

  try {
    const result = await getSpeedLeaderboard(page, pageSize);
    success(res, result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '获取速度榜失败';
    fail(res, 500, msg);
  }
});

// GET /api/leaderboard/friends - 好友榜（需登录鉴权）
router.get('/friends', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    fail(res, 401, '未授权');
    return;
  }

  const page = parseInt(req.query.page as string, 10) || 1;
  const pageSize = parseInt(req.query.pageSize as string, 10) || 20;

  try {
    const result = await getFriendsLeaderboard(user.userId, page, pageSize);
    success(res, result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '获取好友榜失败';
    fail(res, 500, msg);
  }
});

// GET /api/leaderboard/:type/me - 获取个人排名（需登录鉴权）
router.get('/:type/me', authMiddleware, async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    fail(res, 401, '未授权');
    return;
  }

  const typeStr = req.params.type;
  const validTypes = ['power', 'battle', 'speed', 'friends'];
  const type = Array.isArray(typeStr) ? typeStr[0] : typeStr;
  
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
    const msg = err instanceof Error ? err.message : '获取排名失败';
    fail(res, 500, msg);
  }
});

export default router;