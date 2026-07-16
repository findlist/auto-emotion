import { Router, Request, Response } from 'express';
import { getAchievements, claimAchievementReward } from '../services/achievement-service.js';
import { success, fail } from '../utils/response.js';
import { withIdempotency } from '../utils/idempotency.js';
import { getErrorMessage } from '../utils/error.js';

const router = Router();

// GET /api/achievements - 获取成就列表
router.get('/', async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    fail(res, 401, '未授权');
    return;
  }

  try {
    const achievements = await getAchievements(user.userId);
    success(res, { achievements });
  } catch (err) {
    const msg = getErrorMessage(err, '获取成就失败');
    fail(res, 500, msg);
  }
});

// POST /api/achievements/:id/claim - 领取成就奖励
router.post('/:id/claim', async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    fail(res, 401, '未授权');
    return;
  }

  const achievementIdParam = req.params.id;
  const achievementIdStr = Array.isArray(achievementIdParam) ? achievementIdParam[0] : achievementIdParam;
  const achievementId = parseInt(achievementIdStr, 10);
  if (isNaN(achievementId)) {
    fail(res, 400, '无效的成就ID');
    return;
  }

  // 幂等控制：5秒窗口防重复提交，避免高频调用重复发放成就奖励
  // key 含 achievementId 避免不同成就互相拦截
  // 命中拦截（CONFLICT）返回 409；Redis 异常按降级规则放行不阻塞核心业务
  if (!(await withIdempotency(res, `achievements:claim:${user.userId}:${achievementId}`))) {
    return;
  }

  try {
    const result = await claimAchievementReward(user.userId, achievementId);
    success(res, result);
  } catch (err) {
    const msg = getErrorMessage(err, '领取奖励失败');
    fail(res, 400, msg);
  }
});

export default router;