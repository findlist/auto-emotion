// server/src/ai/client.test.ts
// AI 客户端重试机制单元测试
// 设计原因：重试逻辑涉及网络错误/5xx/4xx 分支判断与指数退避，
// 需 mock axios 验证各分支行为，确保 transient 错误重试、客户端错误不重试、重试耗尽正确抛错。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// mock axios，仅关注 post 调用次数与抛错行为
vi.mock('axios', () => ({
  default: { post: vi.fn() },
}));

import axios from 'axios';
import { chat } from './client.js';
import { ErrorCode } from '../utils/error.js';

// 断言 axios.post 被调用次数
function expectCallCount(count: number): void {
  expect(axios.post).toHaveBeenCalledTimes(count);
}

describe('ai/client AI 客户端', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 提供有效 API Key，跳过未配置分支
    process.env.AI_API_KEY = 'test-key';
    process.env.AI_BASE_URL = 'https://test-ai.example.com';
    // 用假定时器加速重试退避，避免真实等待 500ms/1000ms
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.AI_API_KEY;
    delete process.env.AI_BASE_URL;
  });

  it('首次调用成功直接返回内容', async () => {
    (axios.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { choices: [{ message: { content: 'AI 生成结果' } }] },
    });

    const result = await chat('生成怪兽', '系统提示');
    expect(result).toBe('AI 生成结果');
    expectCallCount(1);
  });

  it('AI_API_KEY 未配置立即抛 INTERNAL_ERROR 不发起请求', async () => {
    delete process.env.AI_API_KEY;

    await expect(chat('test')).rejects.toMatchObject({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'AI_API_KEY 未配置',
    });
    expectCallCount(0);
  });

  it('网络错误重试后成功（共 2 次尝试）', async () => {
    const networkErr = Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' });
    (axios.post as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(networkErr)
      .mockResolvedValueOnce({ data: { choices: [{ message: { content: '重试成功' } }] } });

    const promise = chat('test');
    // 跳过第一次重试前的 500ms 退避
    await vi.advanceTimersByTimeAsync(500);
    const result = await promise;

    expect(result).toBe('重试成功');
    expectCallCount(2);
  });

  it('5xx 错误重试两次后成功（共 3 次尝试）', async () => {
    const serverErr = { response: { status: 503 } };
    (axios.post as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(serverErr)
      .mockRejectedValueOnce(serverErr)
      .mockResolvedValueOnce({ data: { choices: [{ message: { content: '第三次成功' } }] } });

    const promise = chat('test');
    await vi.advanceTimersByTimeAsync(500); // 第一次退避
    await vi.advanceTimersByTimeAsync(1000); // 第二次退避
    const result = await promise;

    expect(result).toBe('第三次成功');
    expectCallCount(3);
  });

  it('4xx 客户端错误不重试直接抛 AI 服务调用失败', async () => {
    const clientErr = { response: { status: 401 } };
    (axios.post as ReturnType<typeof vi.fn>).mockRejectedValue(clientErr);

    await expect(chat('test')).rejects.toMatchObject({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'AI 服务调用失败',
    });
    // 4xx 不可重试，仅调用 1 次
    expectCallCount(1);
  });

  it('重试耗尽仍失败抛 AI 服务调用失败', async () => {
    const serverErr = { response: { status: 500 } };
    (axios.post as ReturnType<typeof vi.fn>).mockRejectedValue(serverErr);

    const promise = chat('test');
    // 先附加 catch 避免 unhandled rejection：timer 跳过后 promise 会立即 reject，
    // 而 expect(promise).rejects 附加的 handler 在后续 await 才注册，时序上会触发 Node warning
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).rejects.toMatchObject({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'AI 服务调用失败',
    });
    // 首次 + 2 次重试 = 3 次
    expectCallCount(3);
  });

  it('超时错误（ECONNABORTED）重试耗尽抛 AI 服务响应超时', async () => {
    const timeoutErr = Object.assign(new Error('timeout of 10000ms exceeded'), { code: 'ECONNABORTED' });
    (axios.post as ReturnType<typeof vi.fn>).mockRejectedValue(timeoutErr);

    const promise = chat('test');
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).rejects.toMatchObject({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'AI 服务响应超时',
    });
    expectCallCount(3);
  });

  it('空响应内容返回空字符串', async () => {
    (axios.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { choices: [] },
    });

    const result = await chat('test');
    expect(result).toBe('');
  });
});
