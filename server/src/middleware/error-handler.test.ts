// server/src/middleware/error-handler.test.ts
// 全局错误处理中间件单元测试

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { AppError, ErrorCode } from '../utils/error.js';
import { errorHandler } from './error-handler.js';

// mock logger 避免控制台噪音，同时可断言调用
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { logger } from '../utils/logger.js';

// 构造 express Response 的最小 mock：链式 status().json()
function createMockResponse(): Response & {
  calls: { status: number; body: unknown }[];
} {
  const calls: { status: number; body: unknown }[] = [];
  const res = {
    status(code: number) {
      calls.push({ status: code, body: null });
      return res;
    },
    json(body: unknown) {
      const last = calls[calls.length - 1];
      if (last && last.body === null) {
        last.body = body;
      }
      return res;
    },
  } as unknown as Response & { calls: typeof calls };
  (res as { calls: typeof calls }).calls = calls;
  return res;
}

describe('error-handler 全局错误处理中间件', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('AppError 业务错误处理', () => {
    it('未知 code（非 ErrorCode 枚举）兜底映射为 HTTP 400', () => {
      const res = createMockResponse();
      // 实际代码均使用 ErrorCode 枚举值，此处用 9999 验证映射表未命中时的兜底行为
      const err = new AppError(9999 as unknown as ErrorCode, '未知错误');

      errorHandler(err, {} as Request, res, (() => {}) as never);

      expect(res.calls[0].status).toBe(400);
      expect(res.calls[0].body).toEqual({
        code: 9999,
        message: '未知错误',
        errors: undefined,
      });
      // AppError 不应触发 logger.error
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('VALIDATION_ERROR(1007) 映射为 HTTP 400（与 BAD_REQUEST 一致，前端无需区分 400/422）', () => {
      const res = createMockResponse();
      const err = new AppError(ErrorCode.VALIDATION_ERROR, '参数错误');

      errorHandler(err, {} as Request, res, (() => {}) as never);

      expect(res.calls[0].status).toBe(400);
      expect(res.calls[0].body).toEqual({
        code: ErrorCode.VALIDATION_ERROR,
        message: '参数错误',
        errors: undefined,
      });
    });

    it('透传 errors 校验明细字段', () => {
      const res = createMockResponse();
      const details = [{ field: 'email', reason: 'invalid' }];
      const err = new AppError(ErrorCode.VALIDATION_ERROR, '校验失败', details);

      errorHandler(err, {} as Request, res, (() => {}) as never);

      expect(res.calls[0].body).toEqual({
        code: ErrorCode.VALIDATION_ERROR,
        message: '校验失败',
        errors: details,
      });
    });

    it('UNAUTHORIZED(1002) 映射为 HTTP 401（前端 http.ts 依赖 401 触发清 token + 跳登录）', () => {
      const res = createMockResponse();
      const err = new AppError(ErrorCode.UNAUTHORIZED, 'token 已过期');

      errorHandler(err, {} as Request, res, (() => {}) as never);

      expect(res.calls[0].status).toBe(401);
      expect(res.calls[0].body).toEqual({
        code: ErrorCode.UNAUTHORIZED,
        message: 'token 已过期',
        errors: undefined,
      });
    });

    it('FORBIDDEN(1003) 映射为 HTTP 403', () => {
      const res = createMockResponse();
      const err = new AppError(ErrorCode.FORBIDDEN, '无权操作');

      errorHandler(err, {} as Request, res, (() => {}) as never);

      expect(res.calls[0].status).toBe(403);
    });

    it('NOT_FOUND(1004) 映射为 HTTP 404', () => {
      const res = createMockResponse();
      const err = new AppError(ErrorCode.NOT_FOUND, '资源不存在');

      errorHandler(err, {} as Request, res, (() => {}) as never);

      expect(res.calls[0].status).toBe(404);
    });

    it('CONFLICT(1005) 映射为 HTTP 409', () => {
      const res = createMockResponse();
      const err = new AppError(ErrorCode.CONFLICT, '资源已存在');

      errorHandler(err, {} as Request, res, (() => {}) as never);

      expect(res.calls[0].status).toBe(409);
    });

    it('RATE_LIMIT(1008) 映射为 HTTP 429（前端可据此做限流提示）', () => {
      const res = createMockResponse();
      const err = new AppError(ErrorCode.RATE_LIMIT, '请求过于频繁');

      errorHandler(err, {} as Request, res, (() => {}) as never);

      expect(res.calls[0].status).toBe(429);
      expect(res.calls[0].body).toEqual({
        code: ErrorCode.RATE_LIMIT,
        message: '请求过于频繁',
        errors: undefined,
      });
    });
  });

  describe('未知错误兜底处理', () => {
    it('普通 Error 返回 500 + INTERNAL_ERROR，并记录日志', () => {
      const res = createMockResponse();
      const err = new Error('数据库连接失败');

      errorHandler(err, {} as Request, res, (() => {}) as never);

      expect(res.calls[0].status).toBe(500);
      expect(res.calls[0].body).toEqual({
        code: ErrorCode.INTERNAL_ERROR,
        message: '服务器内部错误',
      });
      // 未知错误应触发 logger.error，且携带 message 与 stack
      expect(logger.error).toHaveBeenCalledOnce();
      const args = (logger.error as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(args[0]).toBe('Unhandled error');
      expect(args[1]).toMatchObject({ message: '数据库连接失败' });
      expect(args[1]).toHaveProperty('stack');
    });

    it('非 Error 对象（如字符串）也能被兜底处理为 500', () => {
      const res = createMockResponse();
      // 模拟抛出非 Error 对象的极端场景
      const weird = 'string error' as unknown as Error;

      errorHandler(weird, {} as Request, res, (() => {}) as never);

      expect(res.calls[0].status).toBe(500);
      // message 字段访问 undefined 不应崩溃
      expect(res.calls[0].body).toEqual({
        code: ErrorCode.INTERNAL_ERROR,
        message: '服务器内部错误',
      });
    });
  });
});
