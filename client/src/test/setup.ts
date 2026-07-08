import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// 每个用例结束自动卸载组件，避免 DOM 残留影响后续断言
afterEach(() => {
  cleanup();
});

// jsdom 未实现 requestAnimationFrame，Toast/ConfirmDialog 入场动画依赖它，统一 mock
if (!globalThis.requestAnimationFrame) {
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
    return setTimeout(() => cb(performance.now()), 0) as unknown as number;
  };
  globalThis.cancelAnimationFrame = (handle: number) => clearTimeout(handle);
}

// jsdom 无 matchMedia，部分组件可能查询媒体查询，提供安全兜底
if (!globalThis.matchMedia) {
  globalThis.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    // 旧版 API 占位，保留签名以兼容依赖库
    addListener: (_listener: unknown) => {},
    removeListener: (_listener: unknown) => {},
    addEventListener: (_type: unknown, _listener: unknown) => {},
    removeEventListener: (_type: unknown, _listener: unknown) => {},
    dispatchEvent: (_event: unknown) => false,
  });
}

// 默认屏蔽 logger 噪音，需要验证 logger 调用的用例可局部 restore
vi.stubGlobal('console', {
  ...console,
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
});
