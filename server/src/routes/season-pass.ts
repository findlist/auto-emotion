import { Router, Request, Response } from 'express';
import { getCurrentSeason, buySeasonPass, claimSeasonReward } from '../services/season-pass-service.js';
import { success, fail } from '../utils/response.js';
import { withIdempotency } from '../utils/idempotency.js';
import { routeError, routeBusinessError } from '../utils/route-error.js';
import { requireUser } from '../utils/auth-guard.js';

const router = Router();

// GET /api/season-pass - 获取赛季通行证信息
router.get('/', async (req: Request, res: Response) => {
  const user = req.user;
  if (!requireUser(res, user)) return;

  try {
    const seasonPass = await getCurrentSeason(user.userId);
    success(res, seasonPass);
  } catch (err) {
    // GET 路由异常透传 AppError 错误码，普通 Error 兜底 500，与 leaderboard 路由同模式
    routeError(res, err, '获取赛季通行证失败');
  }
});

// POST /api/season-pass/buy - 购买通行证
router.post('/buy', async (req: Request, res: Response) => {
  const user = req.user;
  if (!requireUser(res, user)) return;

  // 幂等控制：5秒窗口防重复提交，避免高频调用重复扣款
  // 命中拦截（CONFLICT）返回 409；Redis 异常按降级规则放行不阻塞核心业务
  if (!(await withIdempotency(res, `season-pass:buy:${user.userId}`))) {
    return;
  }

  try {
    const result = await buySeasonPass(user.userId);
    success(res, result);
  } catch (err) {
    // POST 路由业务异常统一降级 400（不透传 AppError.code，保持 POST 异常契约稳定）
    routeBusinessError(res, err, '购买失败');
  }
});

// POST /api/season-pass/claim - 领取奖励
router.post('/claim', async (req: Request, res: Response) => {
  const user = req.user;
  if (!requireUser(res, user)) return;

  const { level, isPremium } = req.body as { level?: number; isPremium?: boolean };
  if (!level) {
    fail(res, 400, '缺少等级');
    return;
  }

  // 幂等控制：5秒窗口防重复提交，避免高频调用重复发放赛季奖励
  // key 含 level 避免不同等级互相拦截
  // 命中拦截（CONFLICT）返回 409；Redis 异常按降级规则放行不阻塞核心业务
  if (!(await withIdempotency(res, `season-pass:claim:${user.userId}:${level}`))) {
    return;
  }

  try {
    const result = await claimSeasonReward(user.userId, level, isPremium ?? false);
    success(res, result);
  } catch (err) {
    // POST 路由业务异常统一降级 400（不透传 AppError.code，保持 POST 异常契约稳定）
    routeBusinessError(res, err, '领取奖励失败');
  }
});

export default router;