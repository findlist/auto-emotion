// server/src/utils/idempotency.test.ts
// Redis 5 秒窗口幂等控制单元测试
// 设计原因：付费/领奖接口依赖幂等拦截重复提交，拦截命中与放行写入两条路径必须验证

import { describe, it, expect, vi, beforeEach } from 'vitest';
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

import { checkIdempotency } from './idempotency.js';

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
