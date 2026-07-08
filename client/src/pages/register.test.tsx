import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// vi.hoisted 让 mock 工厂引用的运行时可变状态在 vi.mock 提升后仍可访问。
// state.loading 在不同用例中动态调整，setMockLoading 写入后下次渲染读取最新值。
const { storeState, setMockLoading, mockRegister } = vi.hoisted(() => {
  const state: { loading: boolean } = { loading: false };
  return {
    storeState: state,
    setMockLoading: (loading: boolean) => {
      state.loading = loading;
    },
    mockRegister: vi.fn(),
  };
});

vi.mock('@/stores/user-store', () => ({
  // useUserStore 是 zustand hook，原签名 (selector) => selector(state)
  // mock 时每次渲染读取 storeState.loading 最新值，模拟 store 状态变化触发重渲染
  useUserStore: (selector: (s: { register: typeof mockRegister; loading: boolean }) => unknown) =>
    selector({ register: mockRegister, loading: storeState.loading }),
}));

import RegisterPage from '@/pages/register';

describe('RegisterPage 注册页', () => {
  beforeEach(() => {
    setMockLoading(false);
    mockRegister.mockReset();
  });

  it('渲染 4 个输入框，label 通过 htmlFor 关联 input.id', () => {
    render(<RegisterPage onNavigateToLogin={vi.fn()} onRegisterSuccess={vi.fn()} />);
    // getByLabelText 同时校验 label.htmlFor ↔ input.id 关联，未关联会抛错
    expect(screen.getByLabelText('手机号')).toBeInTheDocument();
    expect(screen.getByLabelText('昵称')).toBeInTheDocument();
    expect(screen.getByLabelText('密码')).toBeInTheDocument();
    expect(screen.getByLabelText('确认密码')).toBeInTheDocument();
  });

  it('初始无错误时 input 无 aria-invalid 与 aria-describedby', () => {
    render(<RegisterPage onNavigateToLogin={vi.fn()} onRegisterSuccess={vi.fn()} />);
    expect(screen.getByLabelText('手机号')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByLabelText('密码')).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('两次密码不一致时显示错误提示，input 标记 aria-invalid=true', async () => {
    render(<RegisterPage onNavigateToLogin={vi.fn()} onRegisterSuccess={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('手机号'), { target: { value: '13800000000' } });
    fireEvent.change(screen.getByLabelText('昵称'), { target: { value: '小明' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'pwd123' } });
    fireEvent.change(screen.getByLabelText('确认密码'), { target: { value: 'different' } });
    fireEvent.click(screen.getByRole('button', { name: '注册' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('两次密码输入不一致');
    expect(screen.getByLabelText('手机号')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('密码')).toHaveAttribute('aria-invalid', 'true');
  });

  it('密码长度不足 6 位时显示错误提示', async () => {
    render(<RegisterPage onNavigateToLogin={vi.fn()} onRegisterSuccess={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('手机号'), { target: { value: '13800000000' } });
    fireEvent.change(screen.getByLabelText('昵称'), { target: { value: '小明' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: '123' } });
    fireEvent.change(screen.getByLabelText('确认密码'), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: '注册' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('密码长度至少6位');
    // 前端校验失败不应调用 register
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('注册成功后调用 onRegisterSuccess 回调', async () => {
    mockRegister.mockResolvedValueOnce(undefined);
    const onRegisterSuccess = vi.fn();
    render(<RegisterPage onNavigateToLogin={vi.fn()} onRegisterSuccess={onRegisterSuccess} />);

    fireEvent.change(screen.getByLabelText('手机号'), { target: { value: '13800000000' } });
    fireEvent.change(screen.getByLabelText('昵称'), { target: { value: '小明' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'pwd123' } });
    fireEvent.change(screen.getByLabelText('确认密码'), { target: { value: 'pwd123' } });
    fireEvent.click(screen.getByRole('button', { name: '注册' }));

    await waitFor(() => expect(onRegisterSuccess).toHaveBeenCalledTimes(1));
  });

  it('注册失败后 input 标记 aria-invalid 与 aria-describedby 关联错误元素', async () => {
    mockRegister.mockRejectedValueOnce(new Error('手机号已注册'));
    render(<RegisterPage onNavigateToLogin={vi.fn()} onRegisterSuccess={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('手机号'), { target: { value: '13800000000' } });
    fireEvent.change(screen.getByLabelText('昵称'), { target: { value: '小明' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'pwd123' } });
    fireEvent.change(screen.getByLabelText('确认密码'), { target: { value: 'pwd123' } });
    fireEvent.click(screen.getByRole('button', { name: '注册' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('手机号已注册');
    // aria-describedby 指向错误元素 id，屏幕阅读器朗读输入框时同步播报错误
    expect(screen.getByLabelText('手机号')).toHaveAttribute('aria-describedby', alert.id);
  });

  it('loading=true 时按钮禁用且文案变为"注册中..."', () => {
    setMockLoading(true);
    render(<RegisterPage onNavigateToLogin={vi.fn()} onRegisterSuccess={vi.fn()} />);
    expect(screen.getByRole('button', { name: '注册中...' })).toBeDisabled();
  });

  it('点击"立即登录"触发 onNavigateToLogin 跳转', () => {
    const onNavigateToLogin = vi.fn();
    render(<RegisterPage onNavigateToLogin={onNavigateToLogin} onRegisterSuccess={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '立即登录' }));
    expect(onNavigateToLogin).toHaveBeenCalledTimes(1);
  });
});
