import { Sprite } from 'pixi.js';
import type { Container, Texture } from 'pixi.js';

/** 特效档位：低 / 中 / 高 */
export type EffectTier = 'low' | 'mid' | 'high';

/**
 * 档位中文展示标签
 * 设计原因：battle 与 demo 页面均需将 EffectTier 映射为用户可读文案，
 * 收敛到类型定义源头统一维护，避免两处重复定义导致文案漂移
 */
export const TIER_LABEL: Record<EffectTier, string> = {
  low: '低档',
  mid: '中档',
  high: '高档',
};

/** 各档位粒子数量 */
const TIER_PARTICLE_COUNT: Record<EffectTier, number> = {
  low: 5,
  mid: 10,
  high: 20,
};

/** 单个粒子：飞散 + 淡出后销毁 */
class Particle {
  private sprite: Sprite;
  private vx: number;
  private vy: number;
  private elapsed = 0;
  private lifetime: number;
  private startAlpha: number;

  constructor(texture: Texture, x: number, y: number, color: number) {
    this.sprite = new Sprite(texture);
    this.sprite.anchor.set(0.5);
    this.sprite.position.set(x, y);
    this.sprite.tint = color;

    // 随机方向 + 随机速度
    const angle = Math.random() * Math.PI * 2;
    const speed = 80 + Math.random() * 220;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;

    // 随机初始缩放
    const scale = 0.6 + Math.random() * 0.8;
    this.sprite.scale.set(scale);

    this.lifetime = 400 + Math.random() * 300;
    this.startAlpha = 1;
  }

  get view(): Sprite {
    return this.sprite;
  }

  /** 返回 true 表示仍在存活 */
  update(deltaMS: number): boolean {
    this.elapsed += deltaMS;
    if (this.elapsed >= this.lifetime) return false;

    const step = deltaMS / 1000;
    this.sprite.x += this.vx * step;
    this.sprite.y += this.vy * step;

    // 速度衰减
    this.vx *= 0.94;
    this.vy *= 0.94;

    // 淡出
    const ratio = this.elapsed / this.lifetime;
    this.sprite.alpha = this.startAlpha * (1 - ratio);

    return true;
  }

  destroy(): void {
    this.sprite.destroy();
  }
}

/**
 * 粒子特效系统
 * 按档位生成 N 个粒子飞散后销毁
 * 技能释放时可单独传 count 覆盖档位默认值（如 40）
 */
export class ParticleEffect {
  private particles: Particle[] = [];
  private texture: Texture;
  private container: Container;

  constructor(container: Container, texture: Texture) {
    this.container = container;
    this.texture = texture;
  }

  /** 在 (x, y) 生成粒子；count 优先于 tier */
  spawn(x: number, y: number, color: number, tier: EffectTier, count?: number): void {
    const total = count ?? TIER_PARTICLE_COUNT[tier];
    for (let i = 0; i < total; i++) {
      const p = new Particle(this.texture, x, y, color);
      this.particles.push(p);
      this.container.addChild(p.view);
    }
  }

  /** 每帧更新粒子状态，销毁已结束的粒子 */
  update(deltaMS: number): void {
    const alive: Particle[] = [];
    for (const p of this.particles) {
      if (p.update(deltaMS)) {
        alive.push(p);
      } else {
        p.destroy();
      }
    }
    this.particles = alive;
  }

  destroy(): void {
    for (const p of this.particles) p.destroy();
    this.particles = [];
    // 销毁粒子纹理：各游戏类在构造函数中独立创建纹理并传入，无共享，需在此释放 GPU 内存
    this.texture.destroy(true);
  }
}
