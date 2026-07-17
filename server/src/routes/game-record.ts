// server/src/routes/game-record.ts
// 战绩路由

import { Router } from 'express';
import * as recordService from '../services/record-service.js';
import { success } from '../utils/response.js';
import { authMiddleware } from '../middleware/auth.js';
import { parsePagination, firstParam } from '../utils/param.js';

const router = Router();

router.get('/', authMiddleware, async (req, res) => {
  const userId = req.user!.userId;
  // 战绩列表默认每页 10 条，与榜单默认 20 不同，通过 options 注入业务默认值
  const { page, pageSize } = parsePagination(req.query, { defaultPageSize: 10 });

  const result = await recordService.listRecords(userId, page, pageSize);
  success(res, result);
});

router.get('/:id', authMiddleware, async (req, res) => {
  const userId = req.user!.userId;
  // recordId 为 UUID 字符串，用 firstParam 收窄路由参数类型，消除 as string 类型断言
  const recordId = firstParam(req.params.id);
  const record = await recordService.getRecord(recordId, userId);
  success(res, record);
});

export default router;
