// server/src/middleware/error-handler.ts
// Express 全局错误处理

import { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCode, errorCodeToHttpStatus } from '../utils/error.js';
import { logger } from '../utils/logger.js';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    // 按 ErrorCode 语义映射 HTTP 状态码（401/403/404/409/429 等），替代原统一降级 400
    res.status(errorCodeToHttpStatus(err.code)).json({
      code: err.code,
      message: err.message,
      errors: err.errors,
    });
    return;
  }

  logger.error('Unhandled error', { message: err.message, stack: err.stack });
  res.status(500).json({
    code: ErrorCode.INTERNAL_ERROR,
    message: '服务器内部错误',
  });
}