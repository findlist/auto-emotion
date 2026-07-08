import { Sprite } from 'pixi.js';
import type { Texture } from 'pixi.js';

/**
 * 投射物：直线飞行 + 边界销毁
 * 沿固定方向匀速移动，超出边界后标记销毁
 */
export class Projectile {
  readonly sprite: Sprite;
  private speed: number;
  private dirX: number;
  private dirY: number;
  private radius: number;
  private bounds: { width: number; height: number };
  private alive = true;

  constructor(
    texture: Texture,
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    speed: number,
    bounds: { width: number; height: number },
    radius: number,
  ) {
    this.sprite = new Sprite(texture);
    this.sprite.anchor.set(0.5);
    this.sprite.position.set(x, y);
    this.sprite.rotation = Math.atan2(dirY, dirX);
    this.dirX = dirX;
    this.dirY = dirY;
    this.speed = speed;
    this.bounds = bounds;
    this.radius = radius;
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  get radiusValue(): number {
    return this.radius;
  }

  get isAlive(): boolean {
    return this.alive;
  }

  /** 每帧更新位置，越界则标记销毁 */
  update(deltaMS: number): void {
    if (!this.alive) return;

    const step = (this.speed * deltaMS) / 1000;
    this.sprite.x += this.dirX * step;
    this.sprite.y += this.dirY * step;

    // 超出边界销毁
    if (
      this.sprite.x < -this.radius ||
      this.sprite.x > this.bounds.width + this.radius ||
      this.sprite.y < -this.radius ||
      this.sprite.y > this.bounds.height + this.radius
    ) {
      this.alive = false;
    }
  }

  destroy(): void {
    this.alive = false;
    this.sprite.destroy();
  }
}
