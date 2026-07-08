// server/src/utils/logger.test.ts
// 结构化 JSON 日志单元测试
// 设计原因：日志是错误追踪的核心依据，需验证各级别映射正确且 meta 字段正确合并

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from './logger.js';

describe('logger 结构化日志', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let debugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // 拦截 console 方法，避免污染测试输出并捕获输出内容
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('info 调用 console.log 并输出含 level=info 的 JSON', () => {
    logger.info('启动服务');

    expect(logSpy).toHaveBeenCalledOnce();
    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(output.level).toBe('info');
    expect(output.message).toBe('启动服务');
    // timestamp 为 ISO 8601 格式，便于日志系统解析
    expect(output.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('warn 调用 console.warn 并输出含 level=warn', () => {
    logger.warn('配置缺失');

    expect(warnSpy).toHaveBeenCalledOnce();
    const output = JSON.parse(warnSpy.mock.calls[0][0] as string);
    expect(output.level).toBe('warn');
  });

  it('error 调用 console.error 并输出含 level=error', () => {
    logger.error('数据库连接失败');

    expect(errorSpy).toHaveBeenCalledOnce();
    const output = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(output.level).toBe('error');
  });

  it('debug 调用 console.debug 并输出含 level=debug', () => {
    logger.debug('调试信息');

    expect(debugSpy).toHaveBeenCalledOnce();
    const output = JSON.parse(debugSpy.mock.calls[0][0] as string);
    expect(output.level).toBe('debug');
  });

  it('meta 字段展开合并到日志条目', () => {
    logger.info('用户登录', { userId: 'u1', ip: '127.0.0.1' });

    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(output.userId).toBe('u1');
    expect(output.ip).toBe('127.0.0.1');
    expect(output.message).toBe('用户登录');
  });

  it('未传 meta 时仅包含 timestamp/level/message 三个基础字段', () => {
    logger.info('简单日志');

    const output = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(Object.keys(output).sort()).toEqual(['level', 'message', 'timestamp']);
  });
});
