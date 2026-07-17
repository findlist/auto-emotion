import { Router, Request, Response } from 'express';
import { getAchievements, claimAchievementReward } from '../services/achievement-service.js';
import { success, fail } from '../utils/response.js';
import { withIdempotency } from '../utils/idempotency.js';
import { routeError, routeBusinessError } from '../utils/route-error.js';
import { parseIdParam } from '../utils/param.js';
import { requireUser } from '../utils/auth-guard.js';

const router = Router();

// GET /api/achievements - 获取成就列表
router.get('/', async (req: Request, res: Response) => {
  const user = req.user;
  // 鉴权兜底抽取到 requireUser，type guard 收窄 user 类型为 AuthPayload
  if (!requireUser(res, user)) return;

  try {
    const achievements = await getAchievements(user.userId);
    success(res, { achievements });
  } catch (err) {
    // GET 路由异常透传 AppError 错误码，普通 Error 兜底 500，与 leaderboard 路由同模式
    routeError(res, err, '获取成就失败');
  }
});

// POST /api/achievements/:id/claim - 领取成就奖励
router.post('/:id/claim', async (req: Request, res: Response) => {
  const user = req.user;
  if (!requireUser(res, user)) return;

  const achievementId = parseIdParam(req.params.id);
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
    // POST 路由业务异常统一降级 400（不透传 AppError.code，保持 POST 异常契约稳定）
    routeBusinessError(res, err, '领取奖励失败');
  }
});

export default router;