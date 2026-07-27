// server/src/middleware/validate.ts
// zod 参数校验中间件工厂

import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { AppError, ErrorCode, VALIDATION_ERROR_MSG } from '../utils/error.js';

interface ParseResult {
  body: unknown;
  query: unknown;
  params: unknown;
}

// Express 5 下 req.query / req.params 为只读 getter，直接赋值会抛
// "Cannot set property query of #<IncomingMessage> which has only a getter"，
// 改用 defineProperty 覆盖，兼容 Express 4 普通属性与 Express 5 getter 两种场景
// 抽取为 helper 消除 3 处 body/query/params 重复样板，统一 Express 5 兼容写法
function defineReqProp(
  req: Request,
  key: 'body' | 'query' | 'params',
  value: unknown
): void {
  Object.defineProperty(req, key, {
    value,
    writable: true,
    configurable: true,
  });
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
      defineReqProp(req, 'body', result.body);
      defineReqProp(req, 'query', result.query);
      defineReqProp(req, 'params', result.params);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        throw new AppError(
          ErrorCode.VALIDATION_ERROR,
          VALIDATION_ERROR_MSG,
          err.issues
        );
      }
      throw err;
    }
  };
}