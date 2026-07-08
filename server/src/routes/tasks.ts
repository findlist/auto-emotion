import { Router, Request, Response } from 'express';
import { getDailyTasks, claimTaskReward } from '../services/task-service.js';
import { success, fail } from '../utils/response.js';

const router = Router();

// GET /api/tasks/daily - 获取每日任务
router.get('/daily', async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    fail(res, 401, '未授权');
    return;
  }

  try {
    const tasks = await getDailyTasks(user.userId);
    success(res, { tasks });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '获取任务失败';
    fail(res, 500, msg);
  }
});

// POST /api/tasks/:id/claim - 领取任务奖励
router.post('/:id/claim', async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    fail(res, 401, '未授权');
    return;
  }

  const taskIdParam = req.params.id;
  const taskIdStr = Array.isArray(taskIdParam) ? taskIdParam[0] : taskIdParam;
  const taskId = parseInt(taskIdStr, 10);
  if (isNaN(taskId)) {
    fail(res, 400, '无效的任务ID');
    return;
  }

  try {
    const result = await claimTaskReward(user.userId, taskId);
    success(res, result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '领取奖励失败';
    fail(res, 400, msg);
  }
});

export default router;