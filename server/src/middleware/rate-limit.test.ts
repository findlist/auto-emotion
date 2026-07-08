// server/src/middleware/rate-limit.test.ts
// 滑动窗口限流中间件单元测试（mock redis multi 链式调用）

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request } from 'express';
import { ErrorCode } from '../utils/error.js';

// 使用 vi.hoisted 提升 multi 链式 mock，确保 vi.mock 工厂能引用到
const { multiMock } = vi.hoisted(() => ({
  multiMock: {
    zremrangebyscore: vi.fn().mockReturnThis(),
    zadd: vi.fn().mockReturnThis(),
    zcard: vi.fn().mockReturnThis(),
    pexpire: vi.fn().mockReturnThis(),
    exec: vi.fn(),
  },
}));

vi.mock('../config/redis.js', () => ({
  default: {
    multi: vi.fn(() => multiMock),
  },
}));

import { rateLimit } from './rate-limit.js';
import redis from '../config/redis.js';

// 构造带 ip 与 path 的 Request mock
function createMockRequest(ip: string, path: string): Request {
  return { ip, path } as unknown as Request;
}

// 模拟 ioredis multi.exec() 的返回结构：[[err, result], ...]
// 第 3 项（index=2）为 zcard 的计数结果
function setExecCount(count: number): void {
  multiMock.exec.mockResolvedValue([
    [null, 1],          // zremrangebyscore 删除数
    [null, 1],          // zadd 添加数
    [null, count],      // zcard 当前窗口计数
    [null, 'OK'],       // pexpire 设置结果
  ]);
}

describe('rate-limit 滑动窗口限流中间件', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 重置链式返回 this，避免 clearAllMocks 后丢失
    multiMock.zremrangebyscore.mockReturnThis();
    multiMock.zadd.mockReturnThis();
    multiMock.zcard.mockReturnThis();
    multiMock.pexpire.mockReturnThis();
  });

  describe('限流放行场景', () => {
    it('窗口内请求数小于 max 时放行并调用 next', async () => {
      setExecCount(5); // max=10，当前 5
      const middleware = rateLimit({ windowMs: 60000, max: 10 });
      const req = createMockRequest('127.0.0.1', '/api/test');
      let nextCalled = 0;

      await middleware(req, {} as never, () => { nextCalled++; });

      expect(nextCalled).toBe(1);
    });

    it('窗口内请求数等于 max 时放行（边界值，> max 才拒绝）', async () => {
      setExecCount(10); // max=10，当前 10，等于不触发
      const middleware = rateLimit({ windowMs: 60000, max: 10 });
      const req = createMockRequest('127.0.0.1', '/api/test');
      let nextCalled = 0;

      await middleware(req, {} as never, () => { nextCalled++; });

      expect(nextCalled).toBe(1);
    });

    it('count 为 undefined 时（exec 返回异常结构）放行，不抛错兜底', async () => {
      multiMock.exec.mockResolvedValue([
        [null, 0],
        [null, 1],
        [null, undefined], // zcard 结果缺失
        [null, 'OK'],
      ]);
      const middleware = rateLimit({ windowMs: 60000, max: 1 });
      const req = createMockRequest('127.0.0.1', '/api/test');
      let nextCalled = 0;

      await middleware(req, {} as never, () => { nextCalled++; });

      expect(nextCalled).toBe(1);
    });
  });

  describe('限流拒绝场景', () => {
    it('窗口内请求数大于 max 时抛 RATE_LIMIT', async () => {
      setExecCount(11); // max=10，当前 11
      const middleware = rateLimit({ windowMs: 60000, max: 10 });
      const req = createMockRequest('127.0.0.1', '/api/test');

      await expect(
        middleware(req, {} as never, () => {})
      ).rejects.toMatchObject({
        code: ErrorCode.RATE_LIMIT,
        message: '请求过于频繁，请稍后重试',
      });
    });
  });

  describe('Redis 调用契约', () => {
    it('按 keyPrefix:ip:path 拼接限流 key', async () => {
      setExecCount(1);
      const middleware = rateLimit({
        windowMs: 60000,
        max: 10,
        keyPrefix: 'login',
      });
      const req = createMockRequest('192.168.1.1', '/auth/login');

      await middleware(req, {} as never, () => {});

      // zremrangebyscore 第一个参数为 key
      const key = multiMock.zremrangebyscore.mock.calls[0][0];
      expect(key).toBe('login:192.168.1.1:/auth/login');
    });

    it('默认 keyPrefix 为 rl', async () => {
      setExecCount(1);
      const middleware = rateLimit({ windowMs: 1000, max: 5 });
      const req = createMockRequest('10.0.0.1', '/api/data');

      await middleware(req, {} as never, () => {});

      const key = multiMock.zremrangebyscore.mock.calls[0][0];
      expect(key).toBe('rl:10.0.0.1:/api/data');
    });

    it('调用 redis.multi 链式执行四个命令', async () => {
      setExecCount(1);
      const middleware = rateLimit({ windowMs: 30000, max: 5 });
      const req = createMockRequest('1.1.1.1', '/api/x');

      await middleware(req, {} as never, () => {});

      expect(redis.multi).toHaveBeenCalledOnce();
      // 四个命令均应被调用
      expect(multiMock.zremrangebyscore).toHaveBeenCalledOnce();
      expect(multiMock.zadd).toHaveBeenCalledOnce();
      expect(multiMock.zcard).toHaveBeenCalledOnce();
      expect(multiMock.pexpire).toHaveBeenCalledOnce();
      expect(multiMock.exec).toHaveBeenCalledOnce();
    });
  });
});
