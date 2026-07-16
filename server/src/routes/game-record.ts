// server/src/routes/game-record.ts
// 战绩路由

import { Router } from 'express';
import * as recordService from '../services/record-service.js';
import { success } from '../utils/response.js';
import { authMiddleware } from '../middleware/auth.js';
import { parsePagination } from '../utils/param.js';

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
  const recordId = req.params.id as string;
  const record = await recordService.getRecord(recordId, userId);
  success(res, record);
});

export default router;
