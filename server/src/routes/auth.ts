import { Router } from 'express';
import { z } from 'zod';
import * as userService from '../services/user-service.js';
import { validate } from '../middleware/validate.js';
import { success, fail } from '../utils/response.js';
import { authMiddleware } from '../middleware/auth.js';
import { getErrorMessage } from '../utils/error.js';

const router = Router();

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

const registerSchema = z.object({
  body: z.object({
    phone: z.string().min(11).max(20),
    password: z.string().min(6).max(50),
    nickname: z.string().min(2).max(50),
  }),
});

const loginSchema = z.object({
  body: z.object({
    phone: z.string().min(11).max(20),
    password: z.string().min(1).max(50),
  }),
});

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: 用户注册
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone, password, nickname]
 *             properties:
 *               phone:
 *                 type: string
 *                 description: 手机号
 *               password:
 *                 type: string
 *                 description: 密码
 *               nickname:
 *                 type: string
 *                 description: 昵称
 *     responses:
 *       200:
 *         description: 注册成功
 *       409:
 *         description: 手机号已注册
 */

// POST /api/auth/register
router.post('/register', validate(registerSchema), async (req, res) => {
  try {
    const result = await userService.register(req.body);
    success(res, result);
  } catch (err) {
    // 复用 getErrorMessage 统一 unknown→string 兜底，消除 `as Error` 类型断言
    // 设计原因：service 抛 Error 时取 err.message 子串匹配，非 Error 时 fallback 进入 else throw err，与原 `?.includes` 行为等价
    const msg = getErrorMessage(err, '操作失败');
    if (msg.includes('手机号已注册')) {
      fail(res, 1005, msg);
    } else {
      throw err;
    }
  }
});

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: 用户登录
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone, password]
 *             properties:
 *               phone:
 *                 type: string
 *                 description: 手机号
 *               password:
 *                 type: string
 *                 description: 密码
 *     responses:
 *       200:
 *         description: 登录成功，返回 token
 *       401:
 *         description: 手机号或密码错误
 */

// POST /api/auth/login
router.post('/login', validate(loginSchema), async (req, res) => {
  try {
    const result = await userService.login(req.body);
    success(res, result);
  } catch (err) {
    // 同 register：复用 getErrorMessage 统一 unknown→string 兜底，消除 `as Error` 类型断言
    const msg = getErrorMessage(err, '操作失败');
    if (msg.includes('手机号或密码错误')) {
      fail(res, 1002, msg);
    } else {
      throw err;
    }
  }
});

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: 刷新访问令牌
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: 刷新令牌
 *     responses:
 *       200:
 *         description: 刷新成功
 *       401:
 *         description: 无效的刷新令牌
 */

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    fail(res, 1001, 'refreshToken 必填');
    return;
  }
  const result = await userService.refreshToken(refreshToken);
  success(res, result);
});

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: 用户登出
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 登出成功
 *       401:
 *         description: 未授权
 */

// POST /api/auth/logout
router.post('/logout', authMiddleware, async (req, res) => {
  const token = (req.headers.authorization ?? '').slice(7);
  // 从 body 读取 refreshToken 可选参数，加入黑名单防止登出后仍可换新 token
  // 设计原因：refreshToken 有效期 30 天，若不黑名单则泄露后仍可换新 access token
  // 兼容旧前端不传 refreshToken 的调用（undefined 时 service 仅黑名单 access token）
  const { refreshToken } = req.body ?? {};
  await userService.logout(token, refreshToken);
  success(res, null, '登出成功');
});

export default router;
