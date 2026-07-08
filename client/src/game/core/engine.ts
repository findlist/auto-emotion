import { Application, Container } from 'pixi.js';
import type { Rectangle, Renderer, Ticker } from 'pixi.js';

/** 引擎初始化选项 */
export interface EngineOptions {
  width: number;
  height: number;
  backgroundColor?: number;
}

/**
 * PixiJS Application 封装
 * 提供 init / destroy / ticker 等核心能力
 */
export class GameEngine {
  private _app: Application;
  private ready = false;

  constructor() {
    // PixiJS 8：构造函数不再接收 options，需 await init()
    this._app = new Application();
  }

  /** 初始化引擎，必须在使用前调用 */
  async init(options: EngineOptions): Promise<void> {
    await this._app.init({
      width: options.width,
      height: options.height,
      backgroundColor: options.backgroundColor ?? 0xfff8e7,
      antialias: true,
      resolution: window.devicePixelRatio,
      autoDensity: true,
    });
    this.ready = true;
  }

  get canvas(): HTMLCanvasElement {
    return this._app.canvas;
  }

  get stage(): Container {
    return this._app.stage;
  }

  get screen(): Rectangle {
    return this._app.screen;
  }

  get renderer(): Renderer {
    return this._app.renderer;
  }

  get ticker(): Ticker {
    return this._app.ticker;
  }

  get app(): Application {
    return this._app;
  }

  destroy(): void {
    if (!this.ready) return;
    this._app.destroy(true, { children: true });
    this.ready = false;
  }
}
