import { Router, Request, Response } from 'express';
import { getDailyTasks, claimTaskReward } from '../services/task-service.js';
import { success, fail } from '../utils/response.js';
import { checkIdempotency } from '../utils/idempotency.js';
import { AppError, getErrorMessage } from '../utils/error.js';

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
    const msg = getErrorMessage(err, '获取任务失败');
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

  // 幂等控制：5秒窗口防重复提交，避免高频调用重复发放任务奖励
  // key 含 taskId 避免不同任务互相拦截
  try {
    await checkIdempotency(`tasks:claim:${user.userId}:${taskId}`);
  } catch (err) {
    // AppError(CONFLICT) 表示命中幂等拦截（重复请求），返回 409 拒绝
    if (err instanceof AppError) {
      fail(res, err.code, err.message);
      return;
    }
    // 非 AppError 表示 Redis 连接异常，按降级规则放行不阻塞核心业务
  }

  try {
    const result = await claimTaskReward(user.userId, taskId);
    success(res, result);
  } catch (err) {
    const msg = getErrorMessage(err, '领取奖励失败');
    fail(res, 400, msg);
  }
});

export default router;