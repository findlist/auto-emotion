// server/src/routes/idle.ts
// 挂机路由：状态查询 + 收益结算 + 区域切换
// 使用 zod 校验请求参数

import { Router } from 'express';
import { z } from 'zod';
import * as idleService from '../services/idle-service.js';
import { success, fail } from '../utils/response.js';
import { AppError } from '../utils/error.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// ============ GET /api/idle/status ============
// 查询角色状态
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const data = await idleService.getStatus(userId);
    if (!data) {
      fail(res, 404, '角色不存在');
      return;
    }
    success(res, data);
  } catch (err) {
    const error = err as Error;
    fail(res, 500, error.message);
  }
});

// ============ POST /api/idle/settle ============
// 在线结算
const settleBodySchema = z.object({
  durationSeconds: z.coerce.number().int().positive().max(86400),
});

router.post('/settle', authMiddleware, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const parsed = settleBodySchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 422, '参数校验失败', parsed.error.issues);
      return;
    }

    const { durationSeconds } = parsed.data;
    const data = await idleService.settle(userId, durationSeconds);
    success(res, data);
  } catch (err) {
    const error = err as Error;
    fail(res, 500, error.message);
  }
});

// ============ POST /api/idle/claim ============
// 领取离线收益
router.post('/claim', authMiddleware, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const data = await idleService.claimOffline(userId);
    success(res, data);
  } catch (err) {
    const error = err as Error;
    fail(res, 500, error.message);
  }
});

// ============ POST /api/idle/switch-area ============
// 切换挂机区域
const switchAreaBodySchema = z.object({
  areaId: z.coerce.number().int().positive(),
});

router.post('/switch-area', authMiddleware, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const parsed = switchAreaBodySchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 422, '参数校验失败', parsed.error.issues);
      return;
    }

    const { areaId } = parsed.data;
    const data = await idleService.switchArea(userId, areaId);
    success(res, data);
  } catch (err) {
    if (err instanceof AppError) {
      fail(res, err.code, err.message);
      return;
    }
    const error = err as Error;
    fail(res, 500, error.message);
  }
});

// ============ POST /api/idle/upgrade ============
// 升级角色属性
const upgradeBodySchema = z.object({
  field: z.enum(['hp', 'attack', 'defense', 'crit_rate', 'crit_damage', 'efficiency']),
  itemType: z.string().optional(),
});

router.post('/upgrade', authMiddleware, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const parsed = upgradeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 422, '参数校验失败', parsed.error.issues);
      return;
    }

    const { field, itemType } = parsed.data;
    const data = await idleService.upgradeCharacter(userId, field, itemType);
    success(res, data);
  } catch (err) {
    if (err instanceof AppError) {
      fail(res, err.code, err.message);
      return;
    }
    const error = err as Error;
    fail(res, 500, error.message);
  }
});

export default router;
