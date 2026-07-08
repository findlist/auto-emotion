// server/src/idle/offline-calculator.test.ts
// 离线收益计算器单元测试：覆盖时长计算、12 小时上限、倍率兜底
// 设计原因：离线收益是用户长线留存核心奖励，计算错误直接影响经济平衡；
// 本模块为纯读计算（不写库），mock pool.query 即可覆盖全部分支

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  // pool.query：characters 与 idle_areas 两次查询
  queryMock: vi.fn(),
}));

vi.mock('../config/database.js', () => ({
  default: { query: mocks.queryMock },
}));

import { calculateOffline } from './offline-calculator.js';

describe('offline-calculator 离线收益计算器', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 固定"当前时间"为 2026-07-05 12:00:00 UTC，保证离线时长可预测
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-05T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('角色不存在时抛 "角色不存在"', async () => {
    mocks.queryMock.mockResolvedValue({ rows: [] });

    await expect(calculateOffline('u1')).rejects.toThrow('角色不存在');
  });

  it('离线时长 <= 0（idle_since 在未来）时返回全零结果', async () => {
    // idle_since 设为当前时间之后 1 小时，模拟时钟漂移或未来时间
    mocks.queryMock.mockResolvedValue({
      rows: [{
        idle_since: '2026-07-05T13:00:00Z',
        area_id: 1,
        efficiency: '1',
        level: 5,
      }],
    });

    const result = await calculateOffline('u1');

    expect(result).toEqual({ offlineSeconds: 0, exp: 0, gold: 0, cappedHours: 0 });
    // 离线时长非正时不应再查区域，避免无意义查询
    expect(mocks.queryMock).toHaveBeenCalledTimes(1);
  });

  it('正常计算：未达 12 小时上限，按公式 exp=10*level*rate*eff*hours 计算', async () => {
    // 离线 2 小时：idle_since = 10:00，now = 12:00
    mocks.queryMock
      .mockResolvedValueOnce({
        rows: [{
          idle_since: '2026-07-05T10:00:00Z',
          area_id: 1,
          efficiency: '1.5',
          level: 10,
        }],
      })
      .mockResolvedValueOnce({
        rows: [{ exp_rate: '2', gold_rate: '1.5' }],
      });

    const result = await calculateOffline('u1');

    // offlineSeconds = 7200，cappedHours = 2
    expect(result.offlineSeconds).toBe(7200);
    expect(result.cappedHours).toBe(2);
    // exp = floor(10 * 10 * 2 * 1.5 * 2) = 600
    expect(result.exp).toBe(600);
    // gold = floor(5 * 1.5 * 1.5 * 2) = 22
    expect(result.gold).toBe(22);
  });

  it('超过 12 小时上限时封顶 12 小时计算收益', async () => {
    // 离线 24 小时：idle_since = 前一天 12:00，now = 今天 12:00
    mocks.queryMock
      .mockResolvedValueOnce({
        rows: [{
          idle_since: '2026-07-04T12:00:00Z',
          area_id: 1,
          efficiency: '1',
          level: 5,
        }],
      })
      .mockResolvedValueOnce({
        rows: [{ exp_rate: '1', gold_rate: '1' }],
      });

    const result = await calculateOffline('u1');

    // 实际离线 86400 秒，但 cappedHours 封顶 12
    expect(result.offlineSeconds).toBe(86400);
    expect(result.cappedHours).toBe(12);
    // exp = floor(10 * 5 * 1 * 1 * 12) = 600
    expect(result.exp).toBe(600);
    // gold = floor(5 * 1 * 1 * 12) = 60
    expect(result.gold).toBe(60);
  });

  it('区域查询无结果时使用默认 1.0 倍率兜底', async () => {
    // 离线 1 小时，idle_areas 查询返回空
    mocks.queryMock
      .mockResolvedValueOnce({
        rows: [{
          idle_since: '2026-07-05T11:00:00Z',
          area_id: 99,
          efficiency: '1',
          level: 10,
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await calculateOffline('u1');

    expect(result.cappedHours).toBe(1);
    // exp = floor(10 * 10 * 1.0 * 1 * 1) = 100
    expect(result.exp).toBe(100);
    // gold = floor(5 * 1.0 * 1 * 1) = 5
    expect(result.gold).toBe(5);
  });
});
