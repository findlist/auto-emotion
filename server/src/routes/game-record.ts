// server/src/routes/game-record.ts
// 战绩路由

import { Router } from 'express';
import * as recordService from '../services/record-service.js';
import { success } from '../utils/response.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/', authMiddleware, async (req, res) => {
  const userId = req.user!.userId;
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 10;

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
