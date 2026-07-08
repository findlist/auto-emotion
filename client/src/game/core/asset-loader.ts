import { Graphics } from 'pixi.js';
import type { Renderer, Texture } from 'pixi.js';

/**
 * 资源加载器：使用 PixiJS Graphics 生成占位纹理
 * 支持生成圆形 / 矩形纹理并缓存复用
 */
export class AssetLoader {
  private textures = new Map<string, Texture>();
  private renderer: Renderer;

  constructor(renderer: Renderer) {
    this.renderer = renderer;
  }

  /** 生成（或取缓存）圆形纹理 */
  createCircleTexture(key: string, radius: number, color: number): Texture {
    const cached = this.textures.get(key);
    if (cached) return cached;

    const g = new Graphics();
    g.circle(0, 0, radius).fill({ color });
    const texture = this.renderer.generateTexture({ target: g, antialias: true });
    this.textures.set(key, texture);
    g.destroy();
    return texture;
  }

  /** 生成（或取缓存）矩形纹理 */
  createRectTexture(key: string, width: number, height: number, color: number): Texture {
    const cached = this.textures.get(key);
    if (cached) return cached;

    const g = new Graphics();
    g.rect(0, 0, width, height).fill({ color });
    const texture = this.renderer.generateTexture({ target: g, antialias: true });
    this.textures.set(key, texture);
    g.destroy();
    return texture;
  }

  get(key: string): Texture | undefined {
    return this.textures.get(key);
  }

  destroy(): void {
    for (const texture of this.textures.values()) {
      texture.destroy(true);
    }
    this.textures.clear();
  }
}
