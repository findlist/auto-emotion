import type { Container } from 'pixi.js';
import type { EffectTier } from './particle';

/** 各档位震动配置：强度(px) + 持续(ms) */
const TIER_SHAKE_CONFIG: Record<EffectTier, { intensity: number; duration: number }> = {
  low: { intensity: 1, duration: 100 },
  mid: { intensity: 3, duration: 200 },
  high: { intensity: 5, duration: 300 },
};

/**
 * 屏幕震动：按档位震动 N px 持续 M ms
 * 通过给 container 施加随机偏移实现，结束后复位
 */
export class ScreenShake {
  private target: Container;
  private elapsed = 0;
  private duration = 0;
  private intensity = 0;
  private originalX = 0;
  private originalY = 0;
  private shaking = false;

  constructor(target: Container) {
    this.target = target;
  }

  /** 触发一次震动 */
  shake(tier: EffectTier): void {
    const config = TIER_SHAKE_CONFIG[tier];
    // 记录原始位置（仅首次震动时记录，避免嵌套震动丢失基准）
    if (!this.shaking) {
      this.originalX = this.target.x;
      this.originalY = this.target.y;
    }
    this.intensity = config.intensity;
    this.duration = config.duration;
    this.elapsed = 0;
    this.shaking = true;
  }

  update(deltaMS: number): void {
    if (!this.shaking) return;

    this.elapsed += deltaMS;
    if (this.elapsed >= this.duration) {
      // 复位
      this.target.position.set(this.originalX, this.originalY);
      this.shaking = false;
      return;
    }

    // 衰减系数：随时间递减
    const ratio = 1 - this.elapsed / this.duration;
    const magnitude = this.intensity * ratio;
    const offsetX = (Math.random() * 2 - 1) * magnitude;
    const offsetY = (Math.random() * 2 - 1) * magnitude;
    this.target.position.set(this.originalX + offsetX, this.originalY + offsetY);
  }

  get isShaking(): boolean {
    return this.shaking;
  }

  destroy(): void {
    if (this.shaking) {
      this.target.position.set(this.originalX, this.originalY);
      this.shaking = false;
    }
  }
}
