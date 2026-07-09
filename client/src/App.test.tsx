import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

// vi.hoisted 让 mock 工厂引用的状态在 vi.mock 提升后仍可访问
const { userState, restoreMock, logoutMock, roomState } = vi.hoisted(() => ({
  // 默认 user=null 模拟未登录，App 会重定向到 login 页
  // restored=true 模拟 restore 已完成，避免守卫 effect 被阻断无法测试跳转逻辑
  userState: { user: null as unknown, restored: true },
  restoreMock: vi.fn().mockResolvedValue(undefined),
  logoutMock: vi.fn().mockResolvedValue(undefined),
  roomState: { roomId: '', mode: 'boss' as const },
}));

// mock useUserStore：App.tsx 调用 (s) => s.user / s.restored / s.restore / s.logout 四个 selector
vi.mock('@/stores/user-store', () => ({
  useUserStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ user: userState.user, restored: userState.restored, restore: restoreMock, logout: logoutMock }),
}));

// mock useRoomStore：App.tsx 调用 (s) => ({ roomId: s.roomId, mode: s.mode })
vi.mock('@/stores/room-store', () => ({
  useRoomStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector(roomState),
}));

import App from '@/App';

describe('App 根组件无障碍', () => {
  beforeEach(() => {
    // jsdom 默认 pathname 为空，重置到根路径避免上一用例 pushState 残留
    window.history.replaceState({}, '', '/');
  });

  it('渲染跳过链接，href 指向 #main-content，文案为"跳到主内容"', () => {
    render(<App />);
    const skipLink = screen.queryByText('跳到主内容');
    expect(skipLink).not.toBeNull();
    expect(skipLink).toHaveAttribute('href', '#main-content');
    expect(skipLink).toHaveClass('skip-link');
  });

  it('渲染主内容容器，id=main-content 且 tabIndex=-1 支持编程聚焦', () => {
    render(<App />);
    // skip link 的 href 指向 #main-content，通过 document.getElementById 验证锚点存在
    const mainContent = document.getElementById('main-content');
    expect(mainContent).not.toBeNull();
    expect(mainContent).toHaveAttribute('tabindex', '-1');
  });

  it('跳过链接在 DOM 中位于主内容容器之前，确保 Tab 顺序优先', () => {
    const { container } = render(<App />);
    const skipLink = screen.getByText('跳到主内容');
    const mainContent = document.getElementById('main-content');
    // 比较 DOM 顺序：skip link 应在 main-content 之前，保证首次 Tab 即可聚焦
    expect(container.contains(skipLink)).toBe(true);
    expect(container.contains(mainContent)).toBe(true);
    // compareDocumentPosition: 4 = Node.DOCUMENT_POSITION_FOLLOWING（skipLink 在 mainContent 之前）
    expect(skipLink.compareDocumentPosition(mainContent as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});

describe('App 浏览器返回键导航（popstate 监听）', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    // 默认重置为未登录，避免上一用例的 userState 残留污染
    userState.user = null;
  });

  it('popstate 事件触发时同步 page 状态到当前 URL，恢复浏览器返回键导航能力', async () => {
    // 模拟已登录用户，避免未登录守卫 effect 把 page 强制拉回 login 干扰 popstate 验证
    userState.user = { nickname: '测试用户' } as unknown;
    render(<App />);

    // 模拟浏览器返回键：pushState 改变 URL 后触发 popstate 事件
    // pushState 本身不触发 popstate，需手动 dispatch 模拟用户点返回/前进
    // 用 act 包裹：确保 popstate 回调里的 setPage 状态更新在断言前确定性刷新，
    // 避免全量并发跑测时 dispatchEvent 在 act 外触发 React 批处理延迟、findByText 超时 flaky
    await act(async () => {
      window.history.pushState({}, '', '/login');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    // 验证 page 状态已同步为 login，LoginPage 渲染出标志性文案
    expect(await screen.findByText('登录以继续游戏', {}, { timeout: 2000 })).toBeInTheDocument();
  });
});
