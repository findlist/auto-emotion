// server/src/routes/idle.ts
// 挂机路由：状态查询 + 收益结算 + 区域切换
// 使用 zod 校验请求参数

import { Router } from 'express';
import { z } from 'zod';
import * as idleService from '../services/idle-service.js';
import { success, fail } from '../utils/response.js';
import { routeError } from '../utils/route-error.js';
import { authMiddleware } from '../middleware/auth.js';
import { withIdempotency } from '../utils/idempotency.js';
import { parseBody } from '../utils/param.js';
// requireUser 与其他 12 个 routes 文件保持同一鉴权兜底范式，消除 req.user! 非空断言
import { requireUser } from '../utils/auth-guard.js';

const router = Router();

// ============ GET /api/idle/status ============
// 查询角色状态
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    if (!requireUser(res, user)) return;
    const data = await idleService.getStatus(user.userId);
    if (!data) {
      fail(res, 404, '角色不存在');
      return;
    }
    success(res, data);
  } catch (err) {
    routeError(res, err, '查询角色状态失败');
  }
});

// ============ POST /api/idle/settle ============
// 在线结算
const settleBodySchema = z.object({
  durationSeconds: z.coerce.number().int().positive().max(86400),
});

router.post('/settle', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    if (!requireUser(res, user)) return;
    const parsed = parseBody(settleBodySchema, req.body, res);
    if (!parsed) return;

    // 幂等控制：5秒窗口防重复提交，避免高频调用重复发放挂机收益
    // 设计原因：settle 直接发放金币经验，无拦截时客户端可短时间内重复调用导致收益翻倍
    // 命中拦截（CONFLICT）返回 409；Redis 异常按降级规则放行不阻塞核心业务
    if (!(await withIdempotency(res, `idle:settle:${user.userId}`))) {
      return;
    }

    const { durationSeconds } = parsed;
    const data = await idleService.settle(user.userId, durationSeconds);
    success(res, data);
  } catch (err) {
    routeError(res, err, '在线结算失败');
  }
});

// ============ POST /api/idle/claim ============
// 领取离线收益
router.post('/claim', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    if (!requireUser(res, user)) return;
    const data = await idleService.claimOffline(user.userId);
    success(res, data);
  } catch (err) {
    routeError(res, err, '领取离线收益失败');
  }
});

// ============ POST /api/idle/switch-area ============
// 切换挂机区域
const switchAreaBodySchema = z.object({
  areaId: z.coerce.number().int().positive(),
});

router.post('/switch-area', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    if (!requireUser(res, user)) return;
    const parsed = parseBody(switchAreaBodySchema, req.body, res);
    if (!parsed) return;

    const { areaId } = parsed;
    const data = await idleService.switchArea(user.userId, areaId);
    success(res, data);
  } catch (err) {
    routeError(res, err, '切换挂机区域失败');
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
    const user = req.user;
    if (!requireUser(res, user)) return;
    const parsed = parseBody(upgradeBodySchema, req.body, res);
    if (!parsed) return;

    const { field, itemType } = parsed;
    const data = await idleService.upgradeCharacter(user.userId, field, itemType);
    success(res, data);
  } catch (err) {
    routeError(res, err, '升级角色属性失败');
  }
});

export default router;
