import { Router } from 'express';
import { z } from 'zod';
import * as userService from '../services/user-service.js';
import { validate } from '../middleware/validate.js';
import { success } from '../utils/response.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

const updateProfileSchema = z.object({
  body: z.object({
    nickname: z.string().min(2).max(50).optional(),
    avatar_url: z.string().url().optional(),
  }),
});

/**
 * @swagger
 * /users/profile:
 *   get:
 *     summary: 获取用户资料
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功返回用户资料
 *       401:
 *         description: 未授权
 */

// GET /api/users/profile
router.get('/profile', authMiddleware, async (req, res) => {
  const userId = req.user!.userId;
  const profile = await userService.getProfile(userId);
  success(res, profile);
});

/**
 * @swagger
 * /users/profile:
 *   put:
 *     summary: 更新用户资料
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nickname:
 *                 type: string
 *                 description: 昵称
 *               avatar_url:
 *                 type: string
 *                 description: 头像URL
 *     responses:
 *       200:
 *         description: 更新成功
 *       401:
 *         description: 未授权
 */

// PUT /api/users/profile
router.put('/profile', authMiddleware, validate(updateProfileSchema), async (req, res) => {
  const userId = req.user!.userId;
  const profile = await userService.updateProfile(userId, req.body);
  success(res, profile);
});

/**
 * @swagger
 * /users/pressure-stats:
 *   get:
 *     summary: 获取用户压力统计
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功返回压力统计数据
 *       401:
 *         description: 未授权
 */

// GET /api/users/pressure-stats
router.get('/pressure-stats', authMiddleware, async (req, res) => {
  const userId = req.user!.userId;
  const stats = await userService.getPressureStats(userId);
  success(res, stats);
});

export default router;
