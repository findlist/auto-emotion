// server/src/idle/growth-curve.ts
// 成长曲线计算工具

/**
 * 等级经验曲线：100 * level^2
 * @param level 等级
 * @returns 达到该等级所需的总经验
 */
export function expForLevel(level: number): number {
  return 100 * level * level;
}

/**
 * 升级所需经验（当前等级到下一等级）
 * @param currentLevel 当前等级
 * @returns 升级到下一等级所需经验
 */
export function expToNextLevel(currentLevel: number): number {
  return expForLevel(currentLevel + 1) - expForLevel(currentLevel);
}

/**
 * 武器升级消耗计算
 * @param level 当前等级
 * @returns 升级消耗 { 金币, 碎片 }
 */
export function weaponUpgradeCost(level: number): { gold: number; fragments: number } {
  return {
    gold: 50 * level * level,
    fragments: 10 * level,
  };
}

/**
 * 技能解锁等级要求
 * @param skillId 技能ID
 * @returns 解锁该技能所需的等级
 */
export function skillUnlockLevel(skillId: number): number {
  const thresholds: Record<number, number> = {
    1: 1,
    2: 5,
    3: 10,
    4: 15,
    5: 20,
  };
  return thresholds[skillId] || 1;
}
