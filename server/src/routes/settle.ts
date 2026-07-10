import { Router, Request, Response } from 'express';
import { settleGame } from '../services/settle-service.js';
import { success, fail } from '../utils/response.js';
import { AppError } from '../utils/error.js';
import type { GameMode } from '../types/game.js';

const router = Router();

interface PlayerScore {
  userId: string;
  nickname: string;
  score: number;
  damage?: number;
  stressKeywords?: string[];
}

// POST /api/settle - 结算对局
router.post('/', async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    fail(res, 401, '未授权');
    return;
  }

  const { roomId, mode, durationSeconds, players } = req.body as {
    roomId?: string;
    mode?: GameMode;
    durationSeconds?: number;
    players?: PlayerScore[];
  };

  if (!roomId || !mode || !players) {
    fail(res, 400, '缺少参数');
    return;
  }

  try {
    const formattedPlayers = players.map(p => ({
      userId: p.userId,
      nickname: p.nickname,
      score: p.score,
      damage: p.damage ?? 0,
      isMvp: false,
      stressKeywords: p.stressKeywords ?? [],
    }));

    // 直接透传 service 返回的权威奖励数据，路由不再自行计算
    // 设计原因：原实现路由按数组索引名次阶梯计算奖励（150/100/80/50），与 service 实际入库公式
    // （模式倍率 2x/1.5x/1x + MVP 1.5x + score/100 points）完全不一致，用户看到的奖励与实际到账不符
    const result = await settleGame({
      roomId,
      mode,
      durationSeconds: durationSeconds ?? 180,
      players: formattedPlayers,
    });

    success(res, result);
  } catch (err) {
    // AppError 按其 ErrorCode 语义映射 HTTP 状态码（如 CONFLICT→409），其余按 500 处理
    if (err instanceof AppError) {
      fail(res, err.code, err.message);
    } else {
      const msg = err instanceof Error ? err.message : '结算失败';
      fail(res, 500, msg);
    }
  }
});

export default router;