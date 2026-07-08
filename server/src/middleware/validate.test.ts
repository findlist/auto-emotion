// server/src/middleware/validate.test.ts
// zod 参数校验中间件单元测试

import { describe, it, expect } from 'vitest';
import type { Request } from 'express';
import { z } from 'zod';
import { validate } from './validate.js';
import { AppError, ErrorCode } from '../utils/error.js';

// 构造 express Request 的最小 mock：仅含 body/query/params
function createMockRequest(input: {
  body?: unknown;
  query?: Record<string, string>;
  params?: Record<string, string>;
}): Request {
  return {
    body: input.body ?? {},
    query: input.query ?? {},
    params: input.params ?? {},
  } as unknown as Request;
}

describe('validate zod 参数校验中间件', () => {
  describe('校验通过路径', () => {
    it('schema 校验成功时将解析结果回写 req 并调用 next', () => {
      // schema 对 body 字段做转换（字符串 → 数字），验证回写的是解析后的值
      const schema = z.object({
        body: z.object({ age: z.coerce.number() }),
        query: z.object({ name: z.string() }),
        params: z.object({ id: z.string() }),
      });
      const middleware = validate(schema);
      const req = createMockRequest({
        body: { age: '18' },
        query: { name: 'tom' },
        params: { id: 'u1' },
      });
      let nextCalled = 0;
      middleware(req, {} as never, () => { nextCalled++; });

      expect(nextCalled).toBe(1);
      // coerce 已将字符串 18 转为数字
      expect(req.body).toEqual({ age: 18 });
      expect(req.query).toEqual({ name: 'tom' });
      expect(req.params).toEqual({ id: 'u1' });
    });
  });

  describe('校验失败路径', () => {
    it('ZodError 被包装为 AppError(VALIDATION_ERROR)，errors 透传 issues', () => {
      const schema = z.object({
        body: z.object({ age: z.number().min(0) }),
      });
      const middleware = validate(schema);
      const req = createMockRequest({ body: { age: -1 } });

      expect(() => middleware(req, {} as never, () => {})).toThrow(AppError);
      try {
        middleware(req, {} as never, () => {});
      } catch (err) {
        const appErr = err as AppError;
        expect(appErr.code).toBe(ErrorCode.VALIDATION_ERROR);
        expect(appErr.message).toBe('参数校验失败');
        // errors 字段为 zod issues 数组
        expect(Array.isArray(appErr.errors)).toBe(true);
      }
    });

    it('校验失败时不调用 next', () => {
      const schema = z.object({ body: z.object({ required: z.string() }) });
      const middleware = validate(schema);
      const req = createMockRequest({ body: {} });
      let nextCalled = 0;

      try {
        middleware(req, {} as never, () => { nextCalled++; });
      } catch {
        // 预期抛错
      }
      expect(nextCalled).toBe(0);
    });
  });

  describe('非 ZodError 异常透传', () => {
    it('schema.parse 抛出非 ZodError 异常时原样抛出，不包装为 AppError', () => {
      // 构造一个 parse 时抛出普通 Error 的伪 schema
      const fakeSchema = {
        parse: () => {
          throw new Error('schema 内部异常');
        },
      } as unknown as z.ZodSchema;
      const middleware = validate(fakeSchema);
      const req = createMockRequest({});

      expect(() => middleware(req, {} as never, () => {})).toThrow('schema 内部异常');
      // 确认抛出的不是 AppError
      try {
        middleware(req, {} as never, () => {});
      } catch (err) {
        expect(err).not.toBeInstanceOf(AppError);
      }
    });
  });
});
