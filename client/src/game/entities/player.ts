import { Container, Sprite } from 'pixi.js';
import type { Texture } from 'pixi.js';

/**
 * 玩家角色：圆形 + 自动朝向鼠标
 * 由 body（圆形主体）+ indicator（方向指示器）组成
 * 旋转 container 即可让指示器指向鼠标方向
 */
export class Player {
  readonly container: Container;
  private body: Sprite;
  private indicator: Sprite;
  private radius: number;

  constructor(bodyTexture: Texture, indicatorTexture: Texture, radius: number) {
    this.container = new Container();
    this.radius = radius;

    // 圆形主体，锚点居中
    this.body = new Sprite(bodyTexture);
    this.body.anchor.set(0.5);
    this.container.addChild(this.body);

    // 方向指示器：放在主体右侧，随 container 旋转
    this.indicator = new Sprite(indicatorTexture);
    this.indicator.anchor.set(0.5);
    this.indicator.position.set(radius + 6, 0);
    this.container.addChild(this.indicator);
  }

  setPosition(x: number, y: number): void {
    this.container.position.set(x, y);
  }

  get x(): number {
    return this.container.x;
  }

  get y(): number {
    return this.container.y;
  }

  get radiusValue(): number {
    return this.radius;
  }

  /** 朝向鼠标位置旋转 */
  faceTo(mouseX: number, mouseY: number): void {
    const dx = mouseX - this.container.x;
    const dy = mouseY - this.container.y;
    this.container.rotation = Math.atan2(dy, dx);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
