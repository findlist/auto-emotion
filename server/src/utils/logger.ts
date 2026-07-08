// server/src/utils/logger.ts
// 结构化 JSON 日志

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  [key: string]: unknown;
}

function formatLog(level: LogLevel, message: string, meta?: Record<string, unknown>): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => {
    console.log(JSON.stringify(formatLog('info', message, meta)));
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    console.warn(JSON.stringify(formatLog('warn', message, meta)));
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    console.error(JSON.stringify(formatLog('error', message, meta)));
  },
  debug: (message: string, meta?: Record<string, unknown>) => {
    console.debug(JSON.stringify(formatLog('debug', message, meta)));
  },
};