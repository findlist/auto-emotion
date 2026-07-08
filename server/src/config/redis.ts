// server/src/config/redis.ts
// Redis 客户端配置

import { Redis } from 'ioredis';
import { config } from './index.js';

export const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  lazyConnect: true,
});

redis.on('error', (err: Error) => {
  console.error('Redis 连接错误:', err.message);
});

redis.on('connect', () => {
  console.log('Redis 已连接');
});

export default redis;