import { Router, Request, Response } from 'express';
import { getDailyTasks, claimTaskReward } from '../services/task-service.js';
import { success, fail } from '../utils/response.js';
import { withIdempotency } from '../utils/idempotency.js';
import { getErrorMessage } from '../utils/error.js';
import { routeError } from '../utils/route-error.js';
import { parseIdParam } from '../utils/param.js';

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
    // GET 路由异常透传 AppError 错误码，普通 Error 兜底 500，与 leaderboard 路由同模式
    routeError(res, err, '获取任务失败');
  }
});

// POST /api/tasks/:id/claim - 领取任务奖励
router.post('/:id/claim', async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    fail(res, 401, '未授权');
    return;
  }

  const taskId = parseIdParam(req.params.id);
  if (isNaN(taskId)) {
    fail(res, 400, '无效的任务ID');
    return;
  }

  // 幂等控制：5秒窗口防重复提交，避免高频调用重复发放任务奖励
  // key 含 taskId 避免不同任务互相拦截
  // 命中拦截（CONFLICT）返回 409；Redis 异常按降级规则放行不阻塞核心业务
  if (!(await withIdempotency(res, `tasks:claim:${user.userId}:${taskId}`))) {
    return;
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