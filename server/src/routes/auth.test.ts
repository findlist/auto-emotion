// server/src/routes/auth.test.ts
// 认证路由单元测试：混合范式（validate + authMiddleware mock + errorHandler）
// 设计原因：auth.ts 是混合风格路由——
//   1. /register、/login 使用 validate 校验 body + try/catch 部分匹配错误码，不匹配的 throw
//   2. /refresh 无 validate 无 authMiddleware，手动校验 refreshToken，service 抛错直接 throw
//   3. /logout 使用 authMiddleware 鉴权
// throw 出来的错误需经 errorHandler 统一处理（AppError 降级 400，非 AppError 返回 500）。
// 因此测试 app 挂载真实 validate（验证校验逻辑）+ mock authMiddleware（/logout 需注入 req.user）
// + 挂 errorHandler（处理 register/login/refresh 的 throw 分支）。
// mock 边界：service 层全量 mock，route 测试聚焦校验透传、错误码映射、throw 冒泡。

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';

// mock 用户 service：route 测试不验证密码哈希/JWT，只验证调用与透传
vi.mock('../services/user-service.js', () => ({
  register: vi.fn(),
  login: vi.fn(),
  refreshToken: vi.fn(),
  logout: vi.fn(),
}));

// mock authMiddleware：跳过真实 JWT/Redis 校验，直接注入 req.user（/logout 需要）
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (req: unknown, _res: unknown, next: () => void) => {
    (req as { user: unknown }).user = { userId: 'u1', phone: '13800000000' };
    next();
  },
}));

import router from './auth.js';
import * as userService from '../services/user-service.js';
import { errorHandler } from '../middleware/error-handler.js';

// 共享 Express app 与服务器实例
let server: Server;
let baseURL: string;

beforeAll(() => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', router);
  // 挂载全局错误处理，验证 route 抛出的错误（register/login 不匹配 message 的 throw、
  // refresh 的 service 抛错 throw）能正确冒泡至统一错误响应
  app.use(errorHandler);
  server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  baseURL = `http://localhost:${port}/api/auth`;
});

afterAll(() => server.close());

describe('auth 认证路由', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('POST /register 用户注册', () => {
    it('合法 body 调用 register(body) 返回注册结果', async () => {
      (userService.register as ReturnType<typeof vi.fn>).mockResolvedValue({
        userId: 'u2',
        phone: '13900000000',
        nickname: '新用户',
      });

      const res = await fetch(`${baseURL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '13900000000', password: 'abc123', nickname: '新用户' }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({ userId: 'u2', phone: '13900000000', nickname: '新用户' });
      // 验证校验后的 body 透传至 service
      expect(userService.register).toHaveBeenCalledWith({
        phone: '13900000000',
        password: 'abc123',
        nickname: '新用户',
      });
    });

    it('phone 过短（<11）validate 校验失败返回 400 + VALIDATION_ERROR', async () => {
      const res = await fetch(`${baseURL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '123', password: 'abc123', nickname: '新用户' }),
      });
      const body = await res.json();

      // validate 抛 AppError(VALIDATION_ERROR) 冒泡至 errorHandler
      expect(res.status).toBe(400);
      expect(body.code).toBe(1007);
      expect(body.message).toBe('参数校验失败');
      // 校验失败不应调用 service
      expect(userService.register).not.toHaveBeenCalled();
    });

    it('service 抛 "手机号已注册" 时 fail 返回 1005 业务码', async () => {
      (userService.register as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('手机号已注册')
      );

      const res = await fetch(`${baseURL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '13900000000', password: 'abc123', nickname: '重复' }),
      });
      const body = await res.json();

      // catch 内匹配特定 message，fail(res, 1005, msg)；1005 CONFLICT 映射为 HTTP 409
      expect(res.status).toBe(409);
      expect(body.code).toBe(1005);
      expect(body.message).toBe('手机号已注册');
    });

    it('service 抛非匹配 message 时 throw 冒泡至 errorHandler 返回 500', async () => {
      (userService.register as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('数据库写入失败')
      );

      const res = await fetch(`${baseURL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '13900000000', password: 'abc123', nickname: '用户' }),
      });
      const body = await res.json();

      // catch 内不匹配 "手机号已注册"，throw err → errorHandler 捕获非 AppError → 500
      expect(res.status).toBe(500);
      expect(body.code).toBe(1006);
      expect(body.message).toBe('服务器内部错误');
    });
  });

  describe('POST /login 用户登录', () => {
    it('合法 body 调用 login(body) 返回 token', async () => {
      (userService.login as ReturnType<typeof vi.fn>).mockResolvedValue({
        token: 'jwt-token',
        refreshToken: 'refresh-token',
        userId: 'u1',
      });

      const res = await fetch(`${baseURL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '13800000000', password: 'abc123' }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({ token: 'jwt-token', refreshToken: 'refresh-token', userId: 'u1' });
      expect(userService.login).toHaveBeenCalledWith({ phone: '13800000000', password: 'abc123' });
    });

    it('password 为空 validate 校验失败返回 400 + VALIDATION_ERROR', async () => {
      const res = await fetch(`${baseURL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '13800000000', password: '' }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.code).toBe(1007);
      expect(userService.login).not.toHaveBeenCalled();
    });

    it('service 抛 "手机号或密码错误" 时 fail 返回 1002 业务码', async () => {
      (userService.login as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('手机号或密码错误')
      );

      const res = await fetch(`${baseURL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '13800000000', password: 'wrong' }),
      });
      const body = await res.json();

      // catch 内匹配 "手机号或密码错误"，fail(res, 1002, msg)；1002 UNAUTHORIZED 映射为 HTTP 401
      expect(res.status).toBe(401);
      expect(body.code).toBe(1002);
      expect(body.message).toBe('手机号或密码错误');
    });

    it('service 抛非匹配 message 时 throw 冒泡至 errorHandler 返回 500', async () => {
      (userService.login as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Redis 不可用')
      );

      const res = await fetch(`${baseURL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '13800000000', password: 'abc123' }),
      });
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.code).toBe(1006);
      expect(body.message).toBe('服务器内部错误');
    });
  });

  describe('POST /refresh 刷新令牌', () => {
    it('缺少 refreshToken 返回 400 + 1001 "refreshToken 必填"', async () => {
      const res = await fetch(`${baseURL}/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json();

      // 手动校验 refreshToken 必填，fail(res, 1001, 'refreshToken 必填')
      expect(res.status).toBe(400);
      expect(body.code).toBe(1001);
      expect(body.message).toBe('refreshToken 必填');
      expect(userService.refreshToken).not.toHaveBeenCalled();
    });

    it('合法 refreshToken 调用 refreshToken(token) 返回新令牌', async () => {
      (userService.refreshToken as ReturnType<typeof vi.fn>).mockResolvedValue({
        token: 'new-jwt',
        refreshToken: 'new-refresh',
      });

      const res = await fetch(`${baseURL}/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: 'old-refresh' }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({ token: 'new-jwt', refreshToken: 'new-refresh' });
      expect(userService.refreshToken).toHaveBeenCalledWith('old-refresh');
    });

    it('service 抛错时无 try/catch，throw 冒泡至 errorHandler 返回 500', async () => {
      (userService.refreshToken as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('刷新令牌无效')
      );

      const res = await fetch(`${baseURL}/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: 'invalid' }),
      });
      const body = await res.json();

      // /refresh 路由无 try/catch，service reject 直接 throw → errorHandler 捕获非 AppError → 500
      expect(res.status).toBe(500);
      expect(body.code).toBe(1006);
      expect(body.message).toBe('服务器内部错误');
    });
  });

  describe('POST /logout 用户登出', () => {
    it('已授权调用 logout(token) 返回登出成功', async () => {
      (userService.logout as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const res = await fetch(`${baseURL}/logout`, {
        method: 'POST',
        headers: { Authorization: 'Bearer my-jwt-token' },
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      // 登出固定返回 null data + 自定义 message
      expect(body).toEqual({ code: 200, message: '登出成功', data: null });
      // 验证 token 从 Authorization header 提取（slice(7) 跳过 "Bearer "）
      // 不传 body 时 refreshToken 为 undefined，兼容旧前端
      expect(userService.logout).toHaveBeenCalledWith('my-jwt-token', undefined);
    });

    it('body 中传 refreshToken 时透传至 service 用于黑名单', async () => {
      (userService.logout as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const res = await fetch(`${baseURL}/logout`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer my-jwt-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken: 'my-refresh-token' }),
      });

      expect(res.status).toBe(200);
      // refreshToken 应透传至 service 第二参数，与 access token 一起黑名单
      expect(userService.logout).toHaveBeenCalledWith('my-jwt-token', 'my-refresh-token');
    });

    it('service 抛错时 throw 冒泡至 errorHandler 返回 500', async () => {
      (userService.logout as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Redis 写入失败')
      );

      const res = await fetch(`${baseURL}/logout`, {
        method: 'POST',
        headers: { Authorization: 'Bearer my-jwt-token' },
      });
      const body = await res.json();

      // /logout 路由无 try/catch，service reject 直接 throw → errorHandler 捕获 → 500
      expect(res.status).toBe(500);
      expect(body.code).toBe(1006);
      expect(body.message).toBe('服务器内部错误');
    });
  });
});
