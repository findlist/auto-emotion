// server/src/utils/idempotency.ts
// Redis 5秒窗口幂等控制

import { Response } from 'express';
import redis from '../config/redis.js';
import { ErrorCode, AppError } from './error.js';
import { fail } from './response.js';

export async function checkIdempotency(key: string, ttlSeconds = 5): Promise<boolean> {
  // 使用 SET NX EX 原子操作：key 不存在时才设置并返回 'OK'，已存在返回 null
  // 设计原因：原 exists + setex 两步非原子，并发请求都查到 exists=0 后各自 setex，
  // 幂等失效导致重复发奖/重复扣款。SET NX EX 是 Redis 单命令原子操作，彻底消除竞态
  const result = await redis.set(`idempotent:${key}`, '1', 'EX', ttlSeconds, 'NX');
  if (!result) {
    throw new AppError(ErrorCode.CONFLICT, '请求已存在，请稍后重试');
  }
  return true;
}

/**
 * 幂等控制辅助：执行 checkIdempotency，命中拦截时返回业务失败响应，Redis 异常时降级放行
 * 设计原因：7 处路由重复 10 行 try/catch + instanceof AppError 模板，提取为工具函数消除重复
 * 返回值：true=放行（首次请求或 Redis 异常降级），false=已拒绝（命中幂等拦截，调用方需 return）
 */
export async function withIdempotency(
  res: Response,
  key: string,
  ttlSeconds = 5
): Promise<boolean> {
  try {
    await checkIdempotency(key, ttlSeconds);
    return true;
  } catch (err) {
    // AppError(CONFLICT) 表示命中幂等拦截（重复请求），返回 409 拒绝
    if (err instanceof AppError) {
      fail(res, err.code, err.message);
      return false;
    }
    // 非 AppError 表示 Redis 连接异常，按降级规则放行不阻塞核心业务
    return true;
  }
}
