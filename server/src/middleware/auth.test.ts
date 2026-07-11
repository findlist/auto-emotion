// server/src/middleware/auth.test.ts
// JWT 认证 + Redis 黑名单中间件单元测试

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request } from 'express';
import { ErrorCode } from '../utils/error.js';

// mock redis 客户端：仅暴露 get 方法供黑名单查询
vi.mock('../config/redis.js', () => ({
  default: {
    get: vi.fn(),
  },
}));

// mock jsonwebtoken：仅暴露 verify 方法
vi.mock('jsonwebtoken', () => ({
  default: {
    verify: vi.fn(),
  },
}));

import { authMiddleware } from './auth.js';
import redis from '../config/redis.js';
import jwt from 'jsonwebtoken';

// 构造带 authorization 头的 Request mock
function createMockRequest(authHeader?: string): Request {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
  } as unknown as Request;
}

describe('auth JWT 认证中间件', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('JWT_SECRET', 'test-secret');
  });

  describe('令牌缺失场景', () => {
    it('无 authorization 头时抛 UNAUTHORIZED "未提供认证令牌"', async () => {
      const req = createMockRequest(undefined);

      await expect(
        authMiddleware(req, {} as never, () => {})
      ).rejects.toMatchObject({
        code: ErrorCode.UNAUTHORIZED,
        message: '未提供认证令牌',
      });
      // 缺令牌不应查询 redis
      expect(redis.get).not.toHaveBeenCalled();
    });

    it('authorization 非 Bearer 前缀时抛 UNAUTHORIZED', async () => {
      const req = createMockRequest('Basic abc123');

      await expect(
        authMiddleware(req, {} as never, () => {})
      ).rejects.toMatchObject({ code: ErrorCode.UNAUTHORIZED });
      expect(redis.get).not.toHaveBeenCalled();
    });
  });

  describe('Redis 黑名单场景', () => {
    it('token 命中黑名单时抛 UNAUTHORIZED "令牌已失效"', async () => {
      (redis.get as ReturnType<typeof vi.fn>).mockResolvedValue('1');
      const req = createMockRequest('Bearer blacklisted-token');

      await expect(
        authMiddleware(req, {} as never, () => {})
      ).rejects.toMatchObject({
        code: ErrorCode.UNAUTHORIZED,
        message: '令牌已失效',
      });
      // 命中黑名单后不应再校验 jwt
      expect(jwt.verify).not.toHaveBeenCalled();
    });

    it('token 未命中黑名单时继续校验 jwt', async () => {
      (redis.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (jwt.verify as ReturnType<typeof vi.fn>).mockReturnValue({
        userId: 'u1',
        phone: '13800000000',
      });
      const req = createMockRequest('Bearer valid-token');
      let nextCalled = 0;

      await authMiddleware(req, {} as never, () => { nextCalled++; });

      expect(redis.get).toHaveBeenCalledWith('blacklist:valid-token');
      expect(jwt.verify).toHaveBeenCalledWith('valid-token', 'test-secret');
      expect(nextCalled).toBe(1);
      expect(req.user).toEqual({ userId: 'u1', phone: '13800000000' });
    });

    it('Redis 故障时抛 INTERNAL_ERROR "认证服务暂时不可用"（fail-closed 不放行）', async () => {
      // 设计原因：Redis 不可用时 fail-closed 拒绝请求，防止已登出 token 被放行；
      // 包装为 AppError 使错误响应符合统一格式，且不继续校验 jwt 避免无效计算
      (redis.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Connection refused'));
      const req = createMockRequest('Bearer some-token');

      await expect(
        authMiddleware(req, {} as never, () => {})
      ).rejects.toMatchObject({
        code: ErrorCode.INTERNAL_ERROR,
        message: '认证服务暂时不可用',
      });
      // Redis 故障时不应继续校验 jwt
      expect(jwt.verify).not.toHaveBeenCalled();
    });
  });

  describe('JWT 校验失败场景', () => {
    it('jwt.verify 抛错时包装为 UNAUTHORIZED "无效的认证令牌"', async () => {
      (redis.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (jwt.verify as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('jwt malformed');
      });
      const req = createMockRequest('Bearer bad-token');

      await expect(
        authMiddleware(req, {} as never, () => {})
      ).rejects.toMatchObject({
        code: ErrorCode.UNAUTHORIZED,
        message: '无效的认证令牌',
      });
    });
  });

  describe('正常放行场景', () => {
    it('有效 token 通过黑名单与 jwt 校验后写入 req.user 并调用 next', async () => {
      const payload = { userId: 'user-99', phone: '13900000000' };
      (redis.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (jwt.verify as ReturnType<typeof vi.fn>).mockReturnValue(payload);
      const req = createMockRequest('Bearer good-token');

      await authMiddleware(req, {} as never, () => {});

      expect(req.user).toBe(payload);
    });
  });
});
