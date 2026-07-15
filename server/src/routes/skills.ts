import { Router, Request, Response } from 'express';
import { listSkills, unlockSkill, upgradeSkill, activateSkill } from '../services/skill-service.js';
import { success, fail } from '../utils/response.js';
import { getErrorMessage } from '../utils/error.js';

const router = Router();

router.get('/list', async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    fail(res, 401, '未授权');
    return;
  }

  try {
    const skills = await listSkills(user.userId);
    success(res, { skills });
  } catch (err) {
    const msg = getErrorMessage(err, '获取技能列表失败');
    fail(res, 500, msg);
  }
});

router.post('/unlock', async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    fail(res, 401, '未授权');
    return;
  }

  const { skillId } = req.body as { skillId?: number };
  if (!skillId) {
    fail(res, 400, '缺少 skillId');
    return;
  }

  try {
    const result = await unlockSkill(user.userId, skillId);
    success(res, result);
  } catch (err) {
    const msg = getErrorMessage(err, '解锁技能失败');
    fail(res, 400, msg);
  }
});

router.post('/upgrade', async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    fail(res, 401, '未授权');
    return;
  }

  const { skillId } = req.body as { skillId?: number };
  if (!skillId) {
    fail(res, 400, '缺少 skillId');
    return;
  }

  try {
    const result = await upgradeSkill(user.userId, skillId);
    success(res, result);
  } catch (err) {
    const msg = getErrorMessage(err, '升级技能失败');
    fail(res, 400, msg);
  }
});

router.post('/activate', async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    fail(res, 401, '未授权');
    return;
  }

  const { skillId, active } = req.body as { skillId?: number; active?: boolean };
  if (!skillId) {
    fail(res, 400, '缺少 skillId');
    return;
  }

  try {
    const result = await activateSkill(user.userId, skillId, active ?? true);
    success(res, result);
  } catch (err) {
    const msg = getErrorMessage(err, '操作技能失败');
    fail(res, 400, msg);
  }
});

export default router;