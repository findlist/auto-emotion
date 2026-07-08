// server/src/utils/response.test.ts
// 统一响应封装单元测试（mock express Response）

import { describe, it, expect } from 'vitest';
import type { Response } from 'express';
import { success, fail } from './response.js';

// 构造 express Response 的最小 mock：链式 status().json()
function createMockResponse(): Response & {
  calls: { status: number | null; body: unknown }[];
} {
  const calls: { status: number | null; body: unknown }[] = [];
  const res = {
    status(code: number) {
      calls.push({ status: code, body: null });
      return res;
    },
    json(body: unknown) {
      // 关联到最近一次 status 调用；若无 status 调用则 status 为 null
      const last = calls[calls.length - 1];
      if (last && last.body === null) {
        last.body = body;
      } else {
        calls.push({ status: null, body });
      }
      return res;
    },
  } as unknown as Response & { calls: typeof calls };
  (res as { calls: typeof calls }).calls = calls;
  return res;
}

describe('response 统一响应封装', () => {
  describe('success 成功响应', () => {
    it('默认 message 为 "ok"，data 为 undefined', () => {
      const res = createMockResponse();
      success(res);
      expect(res.calls).toHaveLength(1);
      expect(res.calls[0].body).toEqual({ code: 200, message: 'ok', data: undefined });
    });

    it('携带 data 与自定义 message', () => {
      const res = createMockResponse();
      success(res, { id: 1, name: '测试' }, '查询成功');
      expect(res.calls[0].body).toEqual({
        code: 200,
        message: '查询成功',
        data: { id: 1, name: '测试' },
      });
    });

    it('不主动设置 HTTP status（默认 200）', () => {
      const res = createMockResponse();
      success(res, 'data');
      expect(res.calls[0].status).toBeNull();
    });
  });

  describe('fail 失败响应', () => {
    it('HTTP 业务码（< 1000）原样作为 HTTP 状态码', () => {
      const res = createMockResponse();
      fail(res, 404, '未找到');
      expect(res.calls[0].status).toBe(404);
      expect(res.calls[0].body).toEqual({ code: 404, message: '未找到', errors: undefined });
    });

    it('ErrorCode 业务码按语义映射 HTTP 状态码（BAD_REQUEST → 400）', () => {
      const res = createMockResponse();
      fail(res, 1001, '参数错误');
      expect(res.calls[0].status).toBe(400);
      expect(res.calls[0].body).toEqual({ code: 1001, message: '参数错误', errors: undefined });
    });

    it('默认 message 为 "error"', () => {
      const res = createMockResponse();
      fail(res, 500);
      expect(res.calls[0].body).toEqual({ code: 500, message: 'error', errors: undefined });
    });

    it('透传 errors 校验明细', () => {
      const res = createMockResponse();
      const details = [{ field: 'email', reason: 'invalid' }];
      fail(res, 1007, '校验失败', details);
      expect(res.calls[0].body).toEqual({
        code: 1007,
        message: '校验失败',
        errors: details,
      });
    });
  });
});
