// server/src/middleware/rate-limit.ts
// 滑动窗口限流（基于 Redis）

import { Request, Response, NextFunction } from 'express';
import redis from '../config/redis.js';
import { AppError, ErrorCode } from '../utils/error.js';

interface RateLimitOptions {
  windowMs: number;   // 窗口大小（毫秒）
  max: number;        // 窗口内最大请求数
  keyPrefix?: string;
}

export function rateLimit(options: RateLimitOptions) {
  const { windowMs, max, keyPrefix = 'rl' } = options;

  return async function rateLimitMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction
  ): Promise<void> {
    const key = `${keyPrefix}:${req.ip}:${req.path}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    const multi = redis.multi();
    multi.zremrangebyscore(key, 0, windowStart);
    multi.zadd(key, now.toString(), `${now}-${Math.random()}`);
    multi.zcard(key);
    multi.pexpire(key, windowMs);

    // Redis 故障时 fail-open：限流是保护措施，不应阻塞核心功能
    // 设计原因：原 multi.exec() 无 try/catch，Redis 故障时抛错导致所有限流路由返回 500
    let count: number | undefined;
    try {
      const results = await multi.exec();
      count = results?.[2]?.[1] as number;
    } catch {
      next();
      return;
    }

    if (count !== undefined && count > max) {
      throw new AppError(ErrorCode.RATE_LIMIT, '请求过于频繁，请稍后重试');
    }

    next();
  };
}