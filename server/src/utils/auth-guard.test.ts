// server/src/utils/auth-guard.test.ts
// requireUser 工具函数单元测试：覆盖鉴权兜底两个分支与 type guard 收窄语义

import { describe, it, expect } from 'vitest';
import type { Response } from 'express';
import { requireUser } from './auth-guard.js';

// 复用 route-error.test.ts 的最小 mock 模式：链式 status().json()，记录每次调用
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

describe('requireUser 鉴权兜底工具', () => {
  it('user 为 undefined 时响应 401 并返回 false', () => {
    const res = createMockResponse();
    const result = requireUser(res, undefined);
    expect(result).toBe(false);
    expect(res.calls).toHaveLength(1);
    expect(res.calls[0].status).toBe(401);
    expect(res.calls[0].body).toEqual({ code: 401, message: '未授权', errors: undefined });
  });

  it('user 为 null 时响应 401 并返回 false', () => {
    const res = createMockResponse();
    const result = requireUser(res, null);
    expect(result).toBe(false);
    expect(res.calls[0].status).toBe(401);
  });

  it('user 为有效 AuthPayload 时不响应，返回 true', () => {
    const res = createMockResponse();
    const payload = { userId: 'u1', phone: '13800000000' };
    const result = requireUser(res, payload);
    expect(result).toBe(true);
    expect(res.calls).toHaveLength(0);
  });

  it('type guard 收窄后 user 类型为 AuthPayload（编译期校验，运行期访问 userId 不报错）', () => {
    const res = createMockResponse();
    const user: unknown = { userId: 'u2', phone: '13900000000' };
    if (!requireUser(res, user)) return;
    // 此处 user 已被 type guard 收窄为 AuthPayload，可安全访问 userId
    expect(user.userId).toBe('u2');
    expect(user.phone).toBe('13900000000');
  });
});
