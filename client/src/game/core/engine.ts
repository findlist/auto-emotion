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
    // 无论 init 是否完成都尝试销毁 _app，避免 init 进行中用户退出导致 Application 泄漏
    // 设计原因：原 if(!this.ready) return 在 init 未完成时跳过销毁，但 _app 已创建并可能
    // 正在获取 WebGL 上下文，不销毁会导致 GPU 资源泄漏；init 未完成时 destroy 可能
    // 因 renderer/stage 未初始化抛错，catch 忽略以不阻断 cleanup 后续资源释放
    try {
      this._app.destroy(true, { children: true });
    } catch {
      // init 未完成时 _app 内部资源未完全初始化，destroy 抛错可安全忽略
    }
  }
}
