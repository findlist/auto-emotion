// server/src/routes/user.test.ts
// 用户路由单元测试：复用 game-record 范式（authMiddleware + validate + errorHandler）
// 设计原因：user.ts 使用 authMiddleware 鉴权 + zod validate 校验 body，
// handler 内不检查 req.user、不 try/catch，错误统一冒泡至 errorHandler。
// 因此测试 app 挂载真实 validate 中间件（验证校验逻辑）+ mock authMiddleware + 挂 errorHandler。
// mock 边界：service 层全量 mock，route 测试聚焦鉴权透传、参数校验、错误冒泡。

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';

// mock 用户 service：route 测试不验证 SQL，只验证调用与透传
vi.mock('../services/user-service.js', () => ({
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
  getPressureStats: vi.fn(),
}));

// mock authMiddleware：跳过真实 JWT/Redis 校验，直接注入 req.user
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (req: unknown, _res: unknown, next: () => void) => {
    (req as { user: unknown }).user = { userId: 'u1', phone: '13800000000' };
    next();
  },
}));

import router from './user.js';
import * as userService from '../services/user-service.js';
import { errorHandler } from '../middleware/error-handler.js';
import { AppError, ErrorCode } from '../utils/error.js';

// 共享 Express app 与服务器实例，避免每个用例重复 listen/close
let server: Server;
let baseURL: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/users', router);
  // 挂载全局错误处理，验证 route 抛出的 AppError（含 validate 校验失败）能正确冒泡
  app.use(errorHandler);
  server = app.listen(0);
  // 等待端口绑定完成再读取 address，避免并行测试时绑定未完成 address() 返回 null 导致 fetch "bad port"
  await new Promise<void>(resolve => server.once('listening', resolve));
  const port = (server.address() as { port: number }).port;
  baseURL = `http://localhost:${port}/api/users`;
});

afterAll(() => server.close());

describe('user 用户路由', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('GET /profile 用户资料', () => {
    it('调用 getProfile(userId) 返回用户资料', async () => {
      (userService.getProfile as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'u1',
        nickname: '玩家',
        level: 5,
        gold: 1000,
      });

      const res = await fetch(`${baseURL}/profile`);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({
        code: 200,
        message: 'ok',
        data: { id: 'u1', nickname: '玩家', level: 5, gold: 1000 },
      });
      // 验证 userId 来自 authMiddleware 注入
      expect(userService.getProfile).toHaveBeenCalledWith('u1');
    });

    it('service 抛 NOT_FOUND 时冒泡至 errorHandler 返回 404 + 业务码', async () => {
      (userService.getProfile as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AppError(ErrorCode.NOT_FOUND, '用户不存在')
      );

      const res = await fetch(`${baseURL}/profile`);
      const body = await res.json();

      // NOT_FOUND 按 ErrorCode 语义映射为 HTTP 404，业务码保留
      expect(res.status).toBe(404);
      expect(body.code).toBe(ErrorCode.NOT_FOUND);
      expect(body.message).toBe('用户不存在');
    });
  });

  describe('PUT /profile 更新资料', () => {
    it('合法 body 调用 updateProfile(userId, body) 返回更新后资料', async () => {
      (userService.updateProfile as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'u1',
        nickname: '新昵称',
        avatar_url: 'https://example.com/a.png',
      });

      const res = await fetch(`${baseURL}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: '新昵称', avatar_url: 'https://example.com/a.png' }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({
        id: 'u1',
        nickname: '新昵称',
        avatar_url: 'https://example.com/a.png',
      });
      // 验证 userId 与校验后的 body 透传
      expect(userService.updateProfile).toHaveBeenCalledWith('u1', {
        nickname: '新昵称',
        avatar_url: 'https://example.com/a.png',
      });
    });

    it('nickname 过短（<2）validate 校验失败返回 400 + VALIDATION_ERROR', async () => {
      const res = await fetch(`${baseURL}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: 'a' }),
      });
      const body = await res.json();

      // validate 抛 AppError(VALIDATION_ERROR) 冒泡至 errorHandler
      expect(res.status).toBe(400);
      expect(body.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(body.message).toBe('参数校验失败');
      // 校验失败不应调用 service
      expect(userService.updateProfile).not.toHaveBeenCalled();
    });

    it('avatar_url 非合法 URL validate 校验失败返回 400', async () => {
      const res = await fetch(`${baseURL}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar_url: 'not-a-url' }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(userService.updateProfile).not.toHaveBeenCalled();
    });

    it('空 body（两个字段均 optional）校验通过，调用 updateProfile(userId, {})', async () => {
      (userService.updateProfile as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'u1',
        nickname: '原昵称',
      });

      const res = await fetch(`${baseURL}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      // 两个字段均 optional，空对象校验通过
      expect(userService.updateProfile).toHaveBeenCalledWith('u1', {});
      expect(body.data).toEqual({ id: 'u1', nickname: '原昵称' });
    });

    it('service 抛 CONFLICT 冒泡至 errorHandler 返回 409 + 业务码', async () => {
      (userService.updateProfile as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AppError(ErrorCode.CONFLICT, '昵称已被占用')
      );

      const res = await fetch(`${baseURL}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: '已占用昵称' }),
      });
      const body = await res.json();

      // CONFLICT 按 ErrorCode 语义映射为 HTTP 409
      expect(res.status).toBe(409);
      expect(body.code).toBe(ErrorCode.CONFLICT);
      expect(body.message).toBe('昵称已被占用');
    });
  });

  describe('GET /pressure-stats 压力统计', () => {
    it('调用 getPressureStats(userId) 返回统计数据', async () => {
      (userService.getPressureStats as ReturnType<typeof vi.fn>).mockResolvedValue({
        totalBattles: 50,
        winRate: 0.6,
        stressLevel: 'low',
      });

      const res = await fetch(`${baseURL}/pressure-stats`);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({
        totalBattles: 50,
        winRate: 0.6,
        stressLevel: 'low',
      });
      expect(userService.getPressureStats).toHaveBeenCalledWith('u1');
    });

    it('service 抛 INTERNAL_ERROR 冒泡至 errorHandler 返回 500 + 业务码', async () => {
      (userService.getPressureStats as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AppError(ErrorCode.INTERNAL_ERROR, '统计计算异常')
      );

      const res = await fetch(`${baseURL}/pressure-stats`);
      const body = await res.json();

      // INTERNAL_ERROR 按 ErrorCode 语义映射为 HTTP 500
      expect(res.status).toBe(500);
      expect(body.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(body.message).toBe('统计计算异常');
    });
  });
});
