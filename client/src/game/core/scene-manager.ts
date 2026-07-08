import type { Container } from 'pixi.js';

/** 场景接口：每个场景需提供 container，可选生命周期回调 */
export interface Scene {
  container: Container;
  onEnter?(): void;
  onExit?(): void;
  update?(deltaMS: number): void;
}

/**
 * 场景管理器：负责场景注册与切换
 * 同一时刻仅一个场景处于活动状态
 */
export class SceneManager {
  private scenes = new Map<string, Scene>();
  private current: Scene | null = null;
  private root: Container;

  constructor(root: Container) {
    this.root = root;
  }

  register(name: string, scene: Scene): void {
    this.scenes.set(name, scene);
  }

  switchTo(name: string): void {
    const next = this.scenes.get(name);
    if (!next) return;

    // 退出当前场景
    if (this.current) {
      this.current.onExit?.();
      this.root.removeChild(this.current.container);
    }

    // 进入新场景
    this.current = next;
    this.root.addChild(next.container);
    next.onEnter?.();
  }

  update(deltaMS: number): void {
    this.current?.update?.(deltaMS);
  }

  destroy(): void {
    if (this.current) {
      this.current.onExit?.();
      this.root.removeChild(this.current.container);
      this.current = null;
    }
    this.scenes.clear();
  }
}
