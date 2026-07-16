import { Router, Request, Response } from 'express';
import { joinQuickMatch, leaveQuickMatch, getMatchStatus } from '../services/match-service.js';
import { success, fail } from '../utils/response.js';
import { AppError, getErrorMessage } from '../utils/error.js';

const router = Router();

// POST /api/match/quick - 发起快速匹配
router.post('/quick', async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    fail(res, 401, '未授权');
    return;
  }

  const { nickname, socketId } = req.body as { nickname?: string; socketId?: string };
  if (!nickname || !socketId) {
    fail(res, 400, '缺少参数');
    return;
  }

  try {
    const result = await joinQuickMatch(user.userId, nickname, socketId);
    success(res, result);
  } catch (err) {
    // AppError 透传错误码（match-service 抛 BAD_REQUEST 表示「已在队列/匹配中」等业务态），
    // 普通 Error 统一兜底 500，与 idle.ts 路由错误处理规范一致。
    if (err instanceof AppError) {
      fail(res, err.code, err.message);
      return;
    }
    fail(res, 500, getErrorMessage(err, '快速匹配失败'));
  }
});

// DELETE /api/match/cancel - 取消匹配
router.delete('/cancel', async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    fail(res, 401, '未授权');
    return;
  }

  try {
    await leaveQuickMatch(user.userId);
    success(res, { success: true });
  } catch (err) {
    // leaveQuickMatch 当前不抛 AppError，但保持规范模式以与 quick/status 一致，
    // 未来若 service 抛 AppError 可自动透传错误码。
    if (err instanceof AppError) {
      fail(res, err.code, err.message);
      return;
    }
    fail(res, 500, getErrorMessage(err, '取消匹配失败'));
  }
});

// GET /api/match/status - 获取匹配状态
router.get('/status', async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    fail(res, 401, '未授权');
    return;
  }

  try {
    const status = await getMatchStatus(user.userId);
    success(res, status);
  } catch (err) {
    // 与 quick/cancel 错误处理规范一致，AppError 透传 + 普通 Error 兜底 500。
    if (err instanceof AppError) {
      fail(res, err.code, err.message);
      return;
    }
    fail(res, 500, getErrorMessage(err, '获取匹配状态失败'));
  }
});

export default router;