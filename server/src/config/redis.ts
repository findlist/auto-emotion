// server/src/config/redis.ts
// Redis 客户端配置

import { Redis, type RedisOptions } from 'ioredis';
import { config } from './index.js';

// 显式构造选项：仅在配置了密码时才传入 password，
// 避免将 undefined 显式传给 ioredis（部分版本会误发 AUTH 空串），
// 同时保证无密码 Redis 也能正常连接。
const redisOptions: RedisOptions = {
  host: config.redis.host,
  port: config.redis.port,
  lazyConnect: true,
  retryStrategy: (times: number) => (times <= 5 ? Math.min(times * 200, 2000) : null),
  maxRetriesPerRequest: 3,
};

if (config.redis.password) {
  redisOptions.password = config.redis.password;
}

export const redis = new Redis(redisOptions);

redis.on('error', (err: Error) => {
  console.error('Redis 连接错误:', err.message);
});

redis.on('connect', () => {
  const auth = config.redis.password ? '（已启用密码认证）' : '（未启用密码）';
  console.log(`Redis 已连接: ${config.redis.host}:${config.redis.port} ${auth}`);
});

export default redis;