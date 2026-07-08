import { Container, Sprite } from 'pixi.js';
import type { Texture } from 'pixi.js';

/** 破碎回调签名 */
export type ShatterCallback = (target: Destructible) => void;

/**
 * 可破坏物：矩形 + 血量 + 破碎回调
 * 被击中扣血，血量归零时触发破碎回调
 */
export class Destructible {
  readonly container: Container;
  private sprite: Sprite;
  private hp: number;
  private maxHp: number;
  private width: number;
  private height: number;
  private color: number;
  private alive = true;
  private onShatter: ShatterCallback | null;

  constructor(
    texture: Texture,
    x: number,
    y: number,
    width: number,
    height: number,
    color: number,
    hp: number,
    onShatter: ShatterCallback | null,
  ) {
    this.container = new Container();
    this.sprite = new Sprite(texture);
    this.sprite.anchor.set(0.5);
    this.sprite.tint = color;
    this.container.position.set(x, y);
    this.container.addChild(this.sprite);

    this.hp = hp;
    this.maxHp = hp;
    this.width = width;
    this.height = height;
    this.color = color;
    this.onShatter = onShatter;
  }

  get x(): number {
    return this.container.x;
  }

  get y(): number {
    return this.container.y;
  }

  get halfWidth(): number {
    return this.width / 2;
  }

  get halfHeight(): number {
    return this.height / 2;
  }

  get colorValue(): number {
    return this.color;
  }

  get isAlive(): boolean {
    return this.alive;
  }

  get hpRatio(): number {
    return this.maxHp > 0 ? this.hp / this.maxHp : 0;
  }

  /** 受到伤害，血量归零时触发破碎回调 */
  takeDamage(amount: number): void {
    if (!this.alive) return;

    this.hp -= amount;

    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.onShatter?.(this);
    }
  }

  destroy(): void {
    this.alive = false;
    this.container.destroy({ children: true });
  }
}
