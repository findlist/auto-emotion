// server/src/middleware/validate.ts
// zod 参数校验中间件工厂

import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { AppError, ErrorCode } from '../utils/error.js';

interface ParseResult {
  body: unknown;
  query: unknown;
  params: unknown;
}

export function validate(schema: ZodSchema) {
  return function validateMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction
  ): void {
    try {
      const result = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      }) as ParseResult;
      // Express 5 下 req.query / req.params 为只读 getter，直接赋值会抛
      // "Cannot set property query of #<IncomingMessage> which has only a getter"，
      // 改用 defineProperty 覆盖，兼容 Express 4 普通属性与 Express 5 getter 两种场景
      Object.defineProperty(req, 'body', {
        value: result.body,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(req, 'query', {
        value: result.query,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(req, 'params', {
        value: result.params,
        writable: true,
        configurable: true,
      });
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        throw new AppError(
          ErrorCode.VALIDATION_ERROR,
          '参数校验失败',
          err.issues
        );
      }
      throw err;
    }
  };
}