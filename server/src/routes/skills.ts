import { Router, Request, Response } from 'express';
import { listSkills, unlockSkill, upgradeSkill, activateSkill } from '../services/skill-service.js';
import { success, fail } from '../utils/response.js';
import { routeError, routeBusinessError } from '../utils/route-error.js';
import { requireUser } from '../utils/auth-guard.js';

const router = Router();

router.get('/list', async (req: Request, res: Response) => {
  const user = req.user;
  if (!requireUser(res, user)) return;

  try {
    const skills = await listSkills(user.userId);
    success(res, { skills });
  } catch (err) {
    // GET 路由异常透传 AppError 错误码，普通 Error 兜底 500，与 leaderboard 路由同模式
    routeError(res, err, '获取技能列表失败');
  }
});

router.post('/unlock', async (req: Request, res: Response) => {
  const user = req.user;
  if (!requireUser(res, user)) return;

  const { skillId } = req.body as { skillId?: number };
  if (!skillId) {
    fail(res, 400, '缺少 skillId');
    return;
  }

  try {
    const result = await unlockSkill(user.userId, skillId);
    success(res, result);
  } catch (err) {
    // POST 路由业务异常统一降级 400（不透传 AppError.code，保持 POST 异常契约稳定）
    routeBusinessError(res, err, '解锁技能失败');
  }
});

router.post('/upgrade', async (req: Request, res: Response) => {
  const user = req.user;
  if (!requireUser(res, user)) return;

  const { skillId } = req.body as { skillId?: number };
  if (!skillId) {
    fail(res, 400, '缺少 skillId');
    return;
  }

  try {
    const result = await upgradeSkill(user.userId, skillId);
    success(res, result);
  } catch (err) {
    // POST 路由业务异常统一降级 400（不透传 AppError.code，保持 POST 异常契约稳定）
    routeBusinessError(res, err, '升级技能失败');
  }
});

router.post('/activate', async (req: Request, res: Response) => {
  const user = req.user;
  if (!requireUser(res, user)) return;

  const { skillId, active } = req.body as { skillId?: number; active?: boolean };
  if (!skillId) {
    fail(res, 400, '缺少 skillId');
    return;
  }

  try {
    const result = await activateSkill(user.userId, skillId, active ?? true);
    success(res, result);
  } catch (err) {
    // POST 路由业务异常统一降级 400（不透传 AppError.code，保持 POST 异常契约稳定）
    routeBusinessError(res, err, '操作技能失败');
  }
});

export default router;