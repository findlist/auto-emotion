// server/src/middleware/error-handler.ts
// Express 全局错误处理

import { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCode } from '../utils/error.js';
import { logger } from '../utils/logger.js';
// 复用 fail 工具统一错误响应封装：与 routes 层 fail 调用保持同一出口，
// 避免 errorHandler 内联字面量与 response.ts 形成两套错误响应范式
import { fail } from '../utils/response.js';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    // fail 内部按 code >= 1000 走 errorCodeToHttpStatus 映射 HTTP 状态码，
    // 与原 res.status(errorCodeToHttpStatus(err.code)) 行为完全等价
    fail(res, err.code, err.message, err.errors);
    return;
  }

  logger.error('Unhandled error', { message: err.message, stack: err.stack });
  fail(res, ErrorCode.INTERNAL_ERROR, '服务器内部错误');
}