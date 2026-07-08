// server/src/idle/growth-curve.test.ts
// 成长曲线纯函数单元测试

import { describe, it, expect } from 'vitest';
import {
  expForLevel,
  expToNextLevel,
  weaponUpgradeCost,
  skillUnlockLevel,
} from './growth-curve.js';

describe('growth-curve 成长曲线', () => {
  describe('expForLevel 等级经验曲线 100 * level^2', () => {
    it('level=1 时返回 100', () => {
      expect(expForLevel(1)).toBe(100);
    });

    it('level=10 时返回 10000', () => {
      expect(expForLevel(10)).toBe(10000);
    });

    it('level=0 时返回 0（边界值）', () => {
      expect(expForLevel(0)).toBe(0);
    });
  });

  describe('expToNextLevel 升级所需经验', () => {
    it('level=1 到 level=2 需 300 经验（400 - 100）', () => {
      expect(expToNextLevel(1)).toBe(300);
    });

    it('level=0 到 level=1 需 100 经验', () => {
      expect(expToNextLevel(0)).toBe(100);
    });

    it('递增值为正数', () => {
      expect(expToNextLevel(5)).toBeGreaterThan(expToNextLevel(4));
    });
  });

  describe('weaponUpgradeCost 武器升级消耗', () => {
    it('level=1 时金币 50、碎片 10', () => {
      expect(weaponUpgradeCost(1)).toEqual({ gold: 50, fragments: 10 });
    });

    it('level=5 时金币 1250、碎片 50', () => {
      expect(weaponUpgradeCost(5)).toEqual({ gold: 1250, fragments: 50 });
    });

    it('消耗随等级递增', () => {
      const low = weaponUpgradeCost(3);
      const high = weaponUpgradeCost(10);
      expect(high.gold).toBeGreaterThan(low.gold);
      expect(high.fragments).toBeGreaterThan(low.fragments);
    });
  });

  describe('skillUnlockLevel 技能解锁等级', () => {
    it('skillId=1 解锁等级 1', () => {
      expect(skillUnlockLevel(1)).toBe(1);
    });

    it('skillId=5 解锁等级 20', () => {
      expect(skillUnlockLevel(5)).toBe(20);
    });

    it('未知 skillId 兜底返回 1', () => {
      expect(skillUnlockLevel(999)).toBe(1);
    });
  });
});
