import { Router, Request, Response } from 'express';
import { getCurrentSeason, buySeasonPass, claimSeasonReward } from '../services/season-pass-service.js';
import { success, fail } from '../utils/response.js';

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
    const msg = err instanceof Error ? err.message : '获取赛季通行证失败';
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

  try {
    const result = await buySeasonPass(user.userId);
    success(res, result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '购买失败';
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

  try {
    const result = await claimSeasonReward(user.userId, level, isPremium ?? false);
    success(res, result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '领取奖励失败';
    fail(res, 400, msg);
  }
});

export default router;