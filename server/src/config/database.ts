// server/src/config/database.ts
// PostgreSQL 连接池配置
import pg from 'pg';
const { Pool } = pg;
import { getEnv } from './index.js';

const pool = new Pool({
  host: getEnv('DB_HOST', 'localhost'),
  port: parseInt(getEnv('DB_PORT', '5432')),
  database: getEnv('DB_NAME', 'emotion_burst'),
  user: getEnv('DB_USER', 'postgres'),
  password: getEnv('DB_PASSWORD', ''),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// 启动时验证连接
pool.on('error', (err: unknown) => {
  console.error('Unexpected PostgreSQL pool error:', err);
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
