import { describe, it, expect } from 'vitest';
// 直接导入纯函数，无需 mock PixiJS 引擎，验证结算分档与奖励计算的边界正确性
import { calculateSettlement } from './demo';

describe('calculateSettlement 结算计算', () => {
  it('零分场景应返回最低档排名且无奖励', () => {
    const result = calculateSettlement(0);
    expect(result).toEqual({
      rank: 4,
      score: 0,
      expReward: 0,
      goldReward: 0,
      isMVP: false,
    });
  });

  it('50 分为第 4 档边界（含），不触发 MVP', () => {
    // 设计原因：rank 阈值用 > 而非 >=，50 分应落在第 4 档而非第 3 档
    const result = calculateSettlement(50);
    expect(result.rank).toBe(4);
    expect(result.isMVP).toBe(false);
  });

  it('51 分进入第 3 档排名', () => {
    const result = calculateSettlement(51);
    expect(result.rank).toBe(3);
    expect(result.isMVP).toBe(false);
  });

  it('100 分为第 3 档边界（含），不触发 MVP', () => {
    // 设计原因：isMVP 阈值 > 100，100 分不应获得 MVP
    const result = calculateSettlement(100);
    expect(result.rank).toBe(3);
    expect(result.isMVP).toBe(false);
  });

  it('101 分进入第 2 档并触发 MVP', () => {
    const result = calculateSettlement(101);
    expect(result.rank).toBe(2);
    expect(result.isMVP).toBe(true);
  });

  it('200 分为第 2 档边界（含），仍为 MVP', () => {
    // 设计原因：rank 第 1 档阈值 > 200，200 分不应进入第 1 档
    const result = calculateSettlement(200);
    expect(result.rank).toBe(2);
    expect(result.isMVP).toBe(true);
  });

  it('201 分进入第 1 档排名', () => {
    const result = calculateSettlement(201);
    expect(result.rank).toBe(1);
    expect(result.isMVP).toBe(true);
  });

  it('奖励计算应按 1.5 倍经验和 0.8 倍金币向下取整', () => {
    // 验证 Math.floor 对小数奖励的截断行为，避免浮点误差导致奖励虚高
    const result = calculateSettlement(100);
    expect(result.expReward).toBe(150);
    expect(result.goldReward).toBe(80);
    // 非整数场景验证向下取整：99 * 1.5 = 148.5 → 148
    const fractional = calculateSettlement(99);
    expect(fractional.expReward).toBe(148);
    expect(fractional.goldReward).toBe(79);
  });

  it('score 字段应原样回传最终得分', () => {
    const result = calculateSettlement(250);
    expect(result.score).toBe(250);
  });
});
