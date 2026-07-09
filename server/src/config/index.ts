// server/src/config/index.ts
// 全局配置：读取并校验环境变量，import 即触发校验
// 缺失必填变量时直接退出进程，避免带病启动

// 加载 .env 文件到 process.env（必须在读取环境变量之前执行）
import 'dotenv/config';

interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  name: string;
}

interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;                 // 共享 Redis 实例时区分项目：情绪用 1
}

interface AiConfig {
  apiKey: string;
  apiUrl: string;
}

interface Config {
  port: number;
  nodeEnv: string;
  jwtSecret: string;
  db: DbConfig;
  redis: RedisConfig;
  ai: AiConfig;
}

// 将字符串安全转为正整数，非法值回退到默认值
function toInt(value: string | undefined, defaultValue: number): number {
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : defaultValue;
}

// 校验必填变量：非空字符串
function assertRequired(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    console.error(
      JSON.stringify({
        level: 'error',
        message: `启动校验失败：环境变量 ${name} 未配置或为空`,
        timestamp: new Date().toISOString(),
      }),
    );
    process.exit(1);
  }
  return value;
}

// 启动校验：三个必填变量
assertRequired('JWT_SECRET', process.env.JWT_SECRET);
assertRequired('DB_PASSWORD', process.env.DB_PASSWORD);
// AI_API_KEY 暂未配置，跳过校验
if (!process.env.AI_API_KEY) console.warn('AI_API_KEY missing, AI disabled');

export const config: Config = {
  port: toInt(process.env.PORT, 3000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  jwtSecret: process.env.JWT_SECRET as string,
  db: {
    host: process.env.DB_HOST ?? 'postgres',
    port: toInt(process.env.DB_PORT, 5432),
    user: process.env.DB_USER ?? 'emotion',
    password: process.env.DB_PASSWORD as string,
    name: process.env.DB_NAME ?? 'emotion_burst',
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'redis',
    port: toInt(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: toInt(process.env.REDIS_DB, 1),    // 默认 DB 1（共享实例时与社区隔离）
  },
  ai: {
    apiKey: process.env.AI_API_KEY as string,
    apiUrl: process.env.AI_API_URL ?? '',
  },
};

export function getEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

export default config;
