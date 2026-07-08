import { describe, it, expect } from 'vitest';
import { computeEffectIntensity, getEventMultiplier, type RhythmReport } from './emotion-adapter.js';

// 复用报告构造器，仅覆盖测试关注字段
function report(over: Partial<RhythmReport> = {}): RhythmReport {
  return { playerId: 'p1', scorePerSecond: 0, comboCount: 0, accuracy: 1, ...over };
}

describe('emotion-adapter 情绪自适应反馈', () => {
  describe('computeEffectIntensity 玩家表现强度计算', () => {
    it('scorePerSecond > 50 判定 high（即便 comboCount 为 0）', () => {
      expect(computeEffectIntensity(report({ scorePerSecond: 51, comboCount: 0 }))).toBe('high');
    });

    it('comboCount > 20 判定 high（即便 scorePerSecond 为 0）', () => {
      expect(computeEffectIntensity(report({ scorePerSecond: 0, comboCount: 21 }))).toBe('high');
    });

    it('scorePerSecond > 20 判定 mid', () => {
      expect(computeEffectIntensity(report({ scorePerSecond: 21, comboCount: 0 }))).toBe('mid');
    });

    it('comboCount > 8 判定 mid', () => {
      expect(computeEffectIntensity(report({ scorePerSecond: 0, comboCount: 9 }))).toBe('mid');
    });

    it('阈值边界：scorePerSecond=50 与 comboCount=20 仍判定 mid（> 而非 >=）', () => {
      expect(computeEffectIntensity(report({ scorePerSecond: 50, comboCount: 20 }))).toBe('mid');
    });

    it('阈值边界：scorePerSecond=20 与 comboCount=8 仍判定 low', () => {
      expect(computeEffectIntensity(report({ scorePerSecond: 20, comboCount: 8 }))).toBe('low');
    });

    it('全部低于阈值判定 low', () => {
      expect(computeEffectIntensity(report({ scorePerSecond: 5, comboCount: 1 }))).toBe('low');
    });

    it('两条件均达 high 阈值仍判定 high（短路或）', () => {
      expect(computeEffectIntensity(report({ scorePerSecond: 100, comboCount: 30 }))).toBe('high');
    });
  });

  describe('getEventMultiplier 事件倍率映射', () => {
    it('high 倍率 1.5（玩家表现好，增加事件频率）', () => {
      expect(getEventMultiplier('high')).toBe(1.5);
    });

    it('mid 倍率 1.0（正常频率）', () => {
      expect(getEventMultiplier('mid')).toBe(1.0);
    });

    it('low 倍率 0.5（降低频率避免打击玩家）', () => {
      expect(getEventMultiplier('low')).toBe(0.5);
    });
  });
});
