// server/src/ai/emotion-adapter.ts
// 情绪自适应反馈：根据玩家表现调整游戏强度

/**
 * 玩家节律报告
 */
export interface RhythmReport {
  playerId: string;
  scorePerSecond: number;  // 每秒得分
  comboCount: number;       // 连击数
  accuracy: number;        // 准确率 0-1
}

/**
 * 效果强度等级
 */
export type EffectIntensity = 'low' | 'mid' | 'high';

/**
 * 根据玩家表现计算效果强度
 * 用于动态调整事件生成和游戏难度
 *
 * 规则：
 * - high: scorePerSecond > 50 或 comboCount > 20（玩家表现好，增强体验）
 * - mid: scorePerSecond > 20 或 comboCount > 8（正常体验）
 * - low: 低于上述阈值（适当降低难度，保持参与感）
 */
export function computeEffectIntensity(report: RhythmReport): EffectIntensity {
  const { scorePerSecond, comboCount } = report;

  if (scorePerSecond > 50 || comboCount > 20) {
    return 'high';
  }
  if (scorePerSecond > 20 || comboCount > 8) {
    return 'mid';
  }
  return 'low';
}

/**
 * 根据强度等级获取事件倍率
 * 用于调整事件发生的频率和效果
 */
export function getEventMultiplier(intensity: EffectIntensity): number {
  switch (intensity) {
    case 'high':
      return 1.5;  // 玩家表现好，增加事件频率
    case 'mid':
      return 1.0;  // 正常频率
    case 'low':
      return 0.5;  // 降低事件频率，避免打击玩家
  }
}
