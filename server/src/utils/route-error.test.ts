// server/src/utils/route-error.test.ts
// routeError 工具函数单元测试

import { describe, it, expect } from 'vitest';
import type { Response } from 'express';
import { AppError, ErrorCode } from './error.js';
import { routeError, routeBusinessError } from './route-error.js';

// 复用 response.test.ts 的最小 mock 模式：链式 status().json()，记录每次调用
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

describe('routeError 路由错误处理工具', () => {
  it('AppError 透传错误码并按语义映射 HTTP 状态码（NOT_FOUND → 404）', () => {
    const res = createMockResponse();
    routeError(res, new AppError(ErrorCode.NOT_FOUND, '角色不存在'), '查询失败');
    expect(res.calls).toHaveLength(1);
    expect(res.calls[0].status).toBe(404);
    expect(res.calls[0].body).toEqual({ code: 1004, message: '角色不存在', errors: undefined });
  });

  it('AppError UNAUTHORIZED 映射 HTTP 401（验证 401 跳登录链路不被破坏）', () => {
    const res = createMockResponse();
    routeError(res, new AppError(ErrorCode.UNAUTHORIZED, 'token 失效'), '鉴权失败');
    expect(res.calls[0].status).toBe(401);
    expect(res.calls[0].body).toEqual({ code: 1002, message: 'token 失效', errors: undefined });
  });

  it('普通 Error 实例兜底 500，message 取自 err.message', () => {
    const res = createMockResponse();
    routeError(res, new Error('数据库连接失败'), '查询失败');
    expect(res.calls[0].status).toBe(500);
    expect(res.calls[0].body).toEqual({
      code: 500,
      message: '数据库连接失败',
      errors: undefined,
    });
  });

  it('非 Error 类型（如字符串、对象）兜底 500，message 取兜底文案', () => {
    const res = createMockResponse();
    routeError(res, 'something went wrong', '操作失败');
    expect(res.calls[0].status).toBe(500);
    expect(res.calls[0].body).toEqual({ code: 500, message: '操作失败', errors: undefined });
  });

  it('null 错误兜底 500，message 取兜底文案', () => {
    const res = createMockResponse();
    routeError(res, null, '未知错误');
    expect(res.calls[0].status).toBe(500);
    expect(res.calls[0].body).toEqual({ code: 500, message: '未知错误', errors: undefined });
  });

  it('AppError 不透传 errors 校验明细（与原 4 个 routes 模板 fail(res, err.code, err.message) 行为一致）', () => {
    const res = createMockResponse();
    const details = [{ field: 'durationSeconds', reason: 'must be positive' }];
    routeError(res, new AppError(ErrorCode.VALIDATION_ERROR, '校验失败', details), '校验失败');
    expect(res.calls[0].body).toEqual({
      code: 1007,
      message: '校验失败',
      errors: undefined,
    });
  });
});

describe('routeBusinessError POST/DELETE 路由错误处理工具', () => {
  it('普通 Error 实例强制 400，message 取自 err.message（与原 POST catch 模板完全等价）', () => {
    const res = createMockResponse();
    routeBusinessError(res, new Error('金币不足'), '购买失败');
    expect(res.calls).toHaveLength(1);
    expect(res.calls[0].status).toBe(400);
    expect(res.calls[0].body).toEqual({ code: 400, message: '金币不足', errors: undefined });
  });

  it('非 Error 类型（如字符串、对象）强制 400，message 取兜底文案', () => {
    const res = createMockResponse();
    routeBusinessError(res, '事务回滚', '购买宠物失败');
    expect(res.calls[0].status).toBe(400);
    expect(res.calls[0].body).toEqual({
      code: 400,
      message: '购买宠物失败',
      errors: undefined,
    });
  });

  it('null 错误强制 400，message 取兜底文案', () => {
    const res = createMockResponse();
    routeBusinessError(res, null, '未知错误');
    expect(res.calls[0].status).toBe(400);
    expect(res.calls[0].body).toEqual({ code: 400, message: '未知错误', errors: undefined });
  });

  it('AppError 仍强制 400 不透传 code（POST 路由业务异常统一降级，保持契约稳定）', () => {
    // 设计原因：POST 路由测试断言固定期望 HTTP 400（如 pets/skills 测试中 service reject
    // Error 实例时断言 status === 400），透传 AppError.code 会破坏现有契约。
    const res = createMockResponse();
    routeBusinessError(res, new AppError(ErrorCode.NOT_FOUND, '宠物不存在'), '装备宠物失败');
    expect(res.calls[0].status).toBe(400);
    expect(res.calls[0].body).toEqual({
      code: 400,
      message: '宠物不存在',
      errors: undefined,
    });
  });
});
