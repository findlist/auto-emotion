// server/src/utils/idempotency.ts
// Redis 5秒窗口幂等控制

import redis from '../config/redis.js';
import { ErrorCode, AppError } from './error.js';

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
