import { Router, Request, Response } from 'express';
import { getCurrentSeason, buySeasonPass, claimSeasonReward } from '../services/season-pass-service.js';
import { success, fail } from '../utils/response.js';
import { checkIdempotency } from '../utils/idempotency.js';
import { AppError, getErrorMessage } from '../utils/error.js';

const router = Router();

// GET /api/season-pass - 获取赛季通行证信息
router.get('/', async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    fail(res, 401, '未授权');
    return;
  }

  try {
    const seasonPass = await getCurrentSeason(user.userId);
    success(res, seasonPass);
  } catch (err) {
    const msg = getErrorMessage(err, '获取赛季通行证失败');
    fail(res, 500, msg);
  }
});

// POST /api/season-pass/buy - 购买通行证
router.post('/buy', async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    fail(res, 401, '未授权');
    return;
  }

  // 幂等控制：5秒窗口防重复提交，避免高频调用重复扣款
  try {
    await checkIdempotency(`season-pass:buy:${user.userId}`);
  } catch (err) {
    // AppError(CONFLICT) 表示命中幂等拦截（重复请求），返回 409 拒绝
    if (err instanceof AppError) {
      fail(res, err.code, err.message);
      return;
    }
    // 非 AppError 表示 Redis 连接异常，按降级规则放行不阻塞核心业务
  }

  try {
    const result = await buySeasonPass(user.userId);
    success(res, result);
  } catch (err) {
    const msg = getErrorMessage(err, '购买失败');
    fail(res, 400, msg);
  }
});

// POST /api/season-pass/claim - 领取奖励
router.post('/claim', async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    fail(res, 401, '未授权');
    return;
  }

  const { level, isPremium } = req.body as { level?: number; isPremium?: boolean };
  if (!level) {
    fail(res, 400, '缺少等级');
    return;
  }

  // 幂等控制：5秒窗口防重复提交，避免高频调用重复发放赛季奖励
  // key 含 level 避免不同等级互相拦截
  try {
    await checkIdempotency(`season-pass:claim:${user.userId}:${level}`);
  } catch (err) {
    // AppError(CONFLICT) 表示命中幂等拦截（重复请求），返回 409 拒绝
    if (err instanceof AppError) {
      fail(res, err.code, err.message);
      return;
    }
    // 非 AppError 表示 Redis 连接异常，按降级规则放行不阻塞核心业务
  }

  try {
    const result = await claimSeasonReward(user.userId, level, isPremium ?? false);
    success(res, result);
  } catch (err) {
    const msg = getErrorMessage(err, '领取奖励失败');
    fail(res, 400, msg);
  }
});

export default router;