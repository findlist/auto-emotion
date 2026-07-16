// server/src/utils/idempotency.test.ts
// Redis 5 秒窗口幂等控制单元测试
// 设计原因：付费/领奖接口依赖幂等拦截重复提交，拦截命中与放行写入两条路径必须验证

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Response } from 'express';
import { ErrorCode } from './error.js';

// 使用 vi.hoisted 提升 redis mock，确保 vi.mock 工厂能引用到
const { redisMock } = vi.hoisted(() => ({
  redisMock: {
    // SET NX EX 原子操作：返回 'OK' 表示设置成功，null 表示 key 已存在
    set: vi.fn(),
  },
}));

vi.mock('../config/redis.js', () => ({
  default: redisMock,
}));

import { checkIdempotency, withIdempotency } from './idempotency.js';

// 构造链式 mock response：res.status(code) 返回含 json 的对象，便于断言链式调用
function mockResponse(): Response {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { status, json } as unknown as Response;
}

describe('idempotency 幂等控制', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('key 已存在时（SET NX 返回 null）抛 CONFLICT "请求已存在，请稍后重试"', async () => {
    // set 返回 null 表示 NX 条件不满足（key 已存在），重复提交应被拦截
    redisMock.set.mockResolvedValue(null);

    await expect(checkIdempotency('order-123')).rejects.toMatchObject({
      code: ErrorCode.CONFLICT,
      message: '请求已存在，请稍后重试',
    });
  });

  it('key 不存在时（SET NX 返回 OK）写入并返回 true', async () => {
    // set 返回 'OK' 表示 key 不存在且已成功设置，首次请求应放行
    redisMock.set.mockResolvedValue('OK');

    const result = await checkIdempotency('order-456');

    expect(result).toBe(true);
    // key 带有 idempotent: 前缀，默认 TTL=5 秒，值为 '1'，NX 保证仅 key 不存在时写入
    expect(redisMock.set).toHaveBeenCalledWith('idempotent:order-456', '1', 'EX', 5, 'NX');
  });

  it('自定义 ttl 透传至 SET EX 参数', async () => {
    redisMock.set.mockResolvedValue('OK');

    await checkIdempotency('order-789', 10);

    // 不同业务场景需要不同幂等窗口，ttl 应可灵活配置
    expect(redisMock.set).toHaveBeenCalledWith('idempotent:order-789', '1', 'EX', 10, 'NX');
  });
});

describe('withIdempotency 幂等控制辅助', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('首次请求（SET NX 返回 OK）放行，返回 true 且不调用 res 失败响应', async () => {
    redisMock.set.mockResolvedValue('OK');
    const res = mockResponse();

    const result = await withIdempotency(res, 'idle:settle:user-1');

    expect(result).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('命中幂等拦截（CONFLICT）返回 false 并向客户端返回 409 业务失败', async () => {
    // set 返回 null → checkIdempotency 抛 AppError(CONFLICT) → withIdempotency 应调 fail 返回 409
    redisMock.set.mockResolvedValue(null);
    const res = mockResponse();

    const result = await withIdempotency(res, 'shop:buy:user-1:item-1');

    expect(result).toBe(false);
    // fail 内部按 CONFLICT(1005) 映射为 HTTP 409，并写入业务码 1005 与固定文案
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      code: ErrorCode.CONFLICT,
      message: '请求已存在，请稍后重试',
      errors: undefined,
    });
  });

  it('Redis 异常（非 AppError）按降级规则放行，返回 true 且不返回失败响应', async () => {
    // 模拟 Redis 连接故障：set 抛非 AppError（如 Error: connection refused）
    // 设计原因：规范第八条降级规则，Redis 异常不阻塞核心业务，标记故障待修复
    redisMock.set.mockRejectedValue(new Error('connection refused'));
    const res = mockResponse();

    const result = await withIdempotency(res, 'tasks:claim:user-1:task-1');

    expect(result).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('自定义 ttl 透传至 checkIdempotency 的 SET EX 参数', async () => {
    redisMock.set.mockResolvedValue('OK');
    const res = mockResponse();

    await withIdempotency(res, 'season-pass:buy:user-1', 10);

    expect(redisMock.set).toHaveBeenCalledWith(
      'idempotent:season-pass:buy:user-1',
      '1',
      'EX',
      10,
      'NX'
    );
  });
});
