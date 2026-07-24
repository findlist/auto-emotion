import { Router, Request, Response } from 'express';
import { getDailyTasks, claimTaskReward } from '../services/task-service.js';
import { success } from '../utils/response.js';
import { withIdempotency } from '../utils/idempotency.js';
import { routeError, routeBusinessError } from '../utils/route-error.js';
import { parseIdOrFail } from '../utils/param.js';
import { requireUser } from '../utils/auth-guard.js';

const router = Router();

// GET /api/tasks/daily - 获取每日任务
router.get('/daily', async (req: Request, res: Response) => {
  const user = req.user;
  if (!requireUser(res, user)) return;

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
  if (!requireUser(res, user)) return;

  // 解析 :id 并 fail-fast：无效时 helper 内部已 fail(400)，这里直接 return
  const taskId = parseIdOrFail(req.params.id, res, '无效的任务ID');
  if (taskId === null) return;

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
    // POST 路由业务异常统一降级 400（不透传 AppError.code，保持 POST 异常契约稳定）
    routeBusinessError(res, err, '领取奖励失败');
  }
});

export default router;