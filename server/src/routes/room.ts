// server/src/routes/room.ts
// 房间 HTTP 路由：创建房间

import { Router, Request, Response } from 'express';
import { roomManager } from '../websocket/room-manager.js';
import { success, fail } from '../utils/response.js';
import { AppError } from '../utils/error.js';

const router = Router();

/**
 * POST /api/room/create
 * 创建房间
 * 需要 Bearer Token 认证
 */
router.post('/create', async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    fail(res, 401, '未授权');
    return;
  }

  try {
    const { nickname, socketId } = req.body as { nickname?: string; socketId?: string };
    if (!nickname) {
      fail(res, 400, '缺少 nickname');
      return;
    }

    // 创建房间（房主）
    const room = await roomManager.createRoom(user.userId, socketId ?? '', nickname);

    // 自动加入房间
    await roomManager.joinRoom(room.id, user.userId, socketId ?? '', nickname);

    success(res, { roomId: room.id, hostId: room.hostId, players: room.players });
  } catch (err) {
    // AppError 按其 ErrorCode 语义映射 HTTP 状态码，其余按 500 处理
    if (err instanceof AppError) {
      fail(res, err.code, err.message);
    } else {
      const msg = err instanceof Error ? err.message : '创建房间失败';
      fail(res, 500, msg);
    }
  }
});

/**
 * GET /api/room/:roomId
 * 获取房间信息
 */
router.get('/:roomId', async (req: Request, res: Response) => {
  const roomId = req.params.roomId as string;
  const room = await roomManager.getRoom(roomId);

  if (!room) {
    fail(res, 404, '房间不存在');
    return;
  }

  success(res, { room });
});

export default router;
