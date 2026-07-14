// server/src/config/database.ts
// PostgreSQL 连接池配置
import pg from 'pg';
const { Pool } = pg;
import { getEnv } from './index.js';
// 设计原因：pool.on('error') 是运行时回调（空闲连接异常会触发），需用结构化 logger 保证全项目日志格式统一
import { logger } from '../utils/logger.js';

const pool = new Pool({
  host: getEnv('DB_HOST', 'localhost'),
  port: parseInt(getEnv('DB_PORT', '5432'), 10),
  database: getEnv('DB_NAME', 'emotion_burst'),
  user: getEnv('DB_USER', 'postgres'),
  password: getEnv('DB_PASSWORD', ''),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// 运行时回调：连接池空闲连接异常时触发，生产环境需结构化日志便于聚合排查
pool.on('error', (err: unknown) => {
  logger.error('PostgreSQL 连接池错误', { error: String(err) });
});

export async function testConnection(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    console.log('✓ PostgreSQL connected');
  } finally {
    client.release();
  }
}

export default pool;
