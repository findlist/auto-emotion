// server/src/config/redis.ts
// Redis 客户端配置

import { Redis, type RedisOptions } from 'ioredis';
import { config } from './index.js';
// 设计原因：redis.on('error'/'connect') 是运行时回调（网络抖动、重连成功均会多次触发），需用结构化 logger 保证全项目日志格式统一
import { logger } from '../utils/logger.js';

// 显式构造选项：仅在配置了密码时才传入 password，
// 避免将 undefined 显式传给 ioredis（部分版本会误发 AUTH 空串），
// 同时保证无密码 Redis 也能正常连接。
const redisOptions: RedisOptions = {
  host: config.redis.host,
  port: config.redis.port,
  db: config.redis.db,                 // 共享 Redis 实例：情绪用 DB 1
  lazyConnect: true,
  retryStrategy: (times: number) => (times <= 5 ? Math.min(times * 200, 2000) : null),
  maxRetriesPerRequest: 3,
};

if (config.redis.password) {
  redisOptions.password = config.redis.password;
}

export const redis = new Redis(redisOptions);

// 运行时回调：Redis 网络抖动、连接异常时触发，生产环境需结构化日志便于聚合排查
redis.on('error', (err: Error) => {
  logger.error('Redis 连接错误', { error: err.message });
});

// 运行时回调：连接/重连成功时触发（重连场景会多次触发），需结构化日志便于监控连接状态
redis.on('connect', () => {
  const auth = config.redis.password ? '已启用密码认证' : '未启用密码';
  logger.info('Redis 已连接', {
    host: config.redis.host,
    port: config.redis.port,
    db: config.redis.db,
    auth,
  });
});

export default redis;