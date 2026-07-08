import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// vi.hoisted 让 mock 工厂引用的运行时可变状态在 vi.mock 提升后仍可访问。
// state.loading 在不同用例中动态调整，setMockLoading 写入后下次渲染读取最新值。
const { storeState, setMockLoading, mockLogin } = vi.hoisted(() => {
  const state: { loading: boolean } = { loading: false };
  return {
    storeState: state,
    setMockLoading: (loading: boolean) => {
      state.loading = loading;
    },
    mockLogin: vi.fn(),
  };
});

vi.mock('@/stores/user-store', () => ({
  // useUserStore 是 zustand hook，原签名 (selector) => selector(state)
  // mock 时每次渲染读取 storeState.loading 最新值，模拟 store 状态变化触发重渲染
  useUserStore: (selector: (s: { login: typeof mockLogin; loading: boolean }) => unknown) =>
    selector({ login: mockLogin, loading: storeState.loading }),
}));

import LoginPage from '@/pages/login';

describe('LoginPage 登录页', () => {
  beforeEach(() => {
    setMockLoading(false);
    mockLogin.mockReset();
  });

  it('渲染手机号与密码输入框，label 通过 htmlFor 关联 input.id', () => {
    render(<LoginPage onNavigateToRegister={vi.fn()} onLoginSuccess={vi.fn()} />);
    // getByLabelText 同时校验 label.htmlFor ↔ input.id 关联，未关联会抛错
    expect(screen.getByLabelText('手机号')).toBeInTheDocument();
    expect(screen.getByLabelText('密码')).toBeInTheDocument();
  });

  it('初始无错误时 input 无 aria-invalid 与 aria-describedby', () => {
    render(<LoginPage onNavigateToRegister={vi.fn()} onLoginSuccess={vi.fn()} />);
    const phoneInput = screen.getByLabelText('手机号');
    const passwordInput = screen.getByLabelText('密码');
    expect(phoneInput).not.toHaveAttribute('aria-invalid');
    expect(phoneInput).not.toHaveAttribute('aria-describedby');
    expect(passwordInput).not.toHaveAttribute('aria-invalid');
    // 不存在 role=alert 元素，避免屏幕阅读器误读空白错误
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('登录失败后渲染 role=alert 错误提示，input 标记 aria-invalid 与 aria-describedby 关联错误元素', async () => {
    mockLogin.mockRejectedValueOnce(new Error('密码错误'));
    render(<LoginPage onNavigateToRegister={vi.fn()} onLoginSuccess={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('手机号'), { target: { value: '13800000000' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('密码错误');

    // aria-describedby 指向错误元素 id，屏幕阅读器朗读输入框时同步播报错误
    const phoneInput = screen.getByLabelText('手机号');
    const passwordInput = screen.getByLabelText('密码');
    expect(phoneInput).toHaveAttribute('aria-invalid', 'true');
    expect(phoneInput).toHaveAttribute('aria-describedby', alert.id);
    expect(passwordInput).toHaveAttribute('aria-invalid', 'true');
    expect(passwordInput).toHaveAttribute('aria-describedby', alert.id);
  });

  it('登录成功后调用 onLoginSuccess 回调', async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    const onLoginSuccess = vi.fn();
    render(<LoginPage onNavigateToRegister={vi.fn()} onLoginSuccess={onLoginSuccess} />);

    fireEvent.change(screen.getByLabelText('手机号'), { target: { value: '13800000000' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'pwd123' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => expect(onLoginSuccess).toHaveBeenCalledTimes(1));
  });

  it('loading=true 时按钮禁用且文案变为"登录中..."', () => {
    setMockLoading(true);
    render(<LoginPage onNavigateToRegister={vi.fn()} onLoginSuccess={vi.fn()} />);
    const btn = screen.getByRole('button', { name: '登录中...' });
    expect(btn).toBeDisabled();
  });

  it('点击"立即注册"触发 onNavigateToRegister 跳转', () => {
    const onNavigateToRegister = vi.fn();
    render(<LoginPage onNavigateToRegister={onNavigateToRegister} onLoginSuccess={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '立即注册' }));
    expect(onNavigateToRegister).toHaveBeenCalledTimes(1);
  });
});
