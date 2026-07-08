// server/src/routes/ai.ts
// AI 路由：怪兽生成接口
// POST /api/ai/monster：根据压力关键词与难度生成怪兽配置

import { Router } from 'express';
import { generate } from '../ai/monster-generator.js';
import {
  monsterSchema,
  monsterGenerateBodySchema,
} from '../ai/schemas/monster.js';
import { success, fail } from '../utils/response.js';

const router = Router();

// POST /api/ai/monster
// 请求体：{ stressKeywords: string[], difficulty: number }
router.post('/monster', (req, res) => {
  // 1. 校验请求体
  const parsed = monsterGenerateBodySchema.safeParse(req.body);
  if (!parsed.success) {
    fail(res, 422, '参数校验失败', parsed.error.issues);
    return;
  }

  // 2. 生成怪兽配置
  const monsterConfig = generate(parsed.data);

  // 3. 校验生成结果是否符合 schema
  const validated = monsterSchema.safeParse(monsterConfig);
  if (!validated.success) {
    fail(res, 500, '怪兽配置生成异常', validated.error.issues);
    return;
  }

  // 4. 返回成功响应
  success(res, validated.data);
});

export default router;
