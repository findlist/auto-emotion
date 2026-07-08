import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// 可控抛错子组件：通过 ref 控制是否抛错，便于测试错误恢复
let shouldThrow = false;
function Thrower() {
  if (shouldThrow) throw new Error('子组件爆炸');
  return <div>正常内容</div>;
}

describe('ErrorBoundary 错误边界', () => {
  it('无错误时透传渲染 children', () => {
    shouldThrow = false;
    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>
    );
    expect(screen.getByText('正常内容')).toBeInTheDocument();
  });

  it('子组件抛错时渲染默认兜底 UI', () => {
    shouldThrow = true;
    // React 错误边界会向 console.error 输出堆栈，setup.ts 已全局 mock 屏蔽噪音
    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>
    );
    expect(screen.getByText('哎呀，出错了！')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
  });

  it('传入自定义 fallback 时优先渲染 fallback', () => {
    shouldThrow = true;
    render(
      <ErrorBoundary fallback={<div>自定义兜底</div>}>
        <Thrower />
      </ErrorBoundary>
    );
    expect(screen.getByText('自定义兜底')).toBeInTheDocument();
    // 不应出现默认兜底文案
    expect(screen.queryByText('哎呀，出错了！')).not.toBeInTheDocument();
  });

  it('DEV 模式下展示错误信息辅助调试', () => {
    shouldThrow = true;
    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>
    );
    // vitest 默认 import.meta.env.DEV=true，error.message 应可见
    expect(screen.getByText('子组件爆炸')).toBeInTheDocument();
  });

  it('PROD 模式下不展示错误详情，仅显示兜底 UI 与重试按钮', () => {
    // 设计原因：生产环境泄露 error.message/stack 可能暴露实现细节与敏感路径，
    // 是安全风险。ErrorBoundary 通过 import.meta.env.DEV 门控错误详情块（组件 line 49），
    // PROD 下应仅展示通用提示与重试按钮。logger 的 isDev 是模块加载时捕获，
    // stubEnv 不影响其行为，但测试关注点是 render 输出而非日志，不受影响。
    vi.stubEnv('DEV', false);
    shouldThrow = true;
    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>
    );
    // 兜底 UI 与重试按钮始终渲染，不受 DEV/PROD 影响
    expect(screen.getByText('哎呀，出错了！')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
    // 错误详情（error.message）不应泄露给终端用户
    expect(screen.queryByText('子组件爆炸')).not.toBeInTheDocument();
    // 恢复环境变量，避免污染后续用例（setup.ts 未全局 unstub）
    vi.unstubAllEnvs();
  });

  it('点击重试按钮重置错误状态并重新渲染 children', async () => {
    shouldThrow = true;
    const user = userEvent.setup();
    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>
    );
    expect(screen.getByText('哎呀，出错了！')).toBeInTheDocument();

    // 子组件恢复不抛错
    shouldThrow = false;
    await user.click(screen.getByRole('button', { name: '重试' }));

    expect(screen.getByText('正常内容')).toBeInTheDocument();
    expect(screen.queryByText('哎呀，出错了！')).not.toBeInTheDocument();
  });

  it('componentDidCatch 触发后调用 logger.error 记录', () => {
    shouldThrow = true;
    // 直接验证 console.error 被调用（logger.error 在 DEV 下转发到 console.error）
    const spy = vi.spyOn(console, 'error');
    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>
    );
    expect(spy).toHaveBeenCalled();
  });

  it('重试后 children 再次抛错，错误边界重新捕获并显示兜底（循环恢复场景）', async () => {
    // 场景：API 暂时不可用，用户点重试后问题仍存在，错误边界应能重复捕获
    shouldThrow = true;
    const user = userEvent.setup();
    const { rerender } = render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>
    );
    expect(screen.getByText('哎呀，出错了！')).toBeInTheDocument();

    // 第一次重试：子组件恢复正常
    shouldThrow = false;
    await user.click(screen.getByRole('button', { name: '重试' }));
    expect(screen.getByText('正常内容')).toBeInTheDocument();

    // 模拟子组件再次故障（如网络抖动），rerender 触发 Thrower 重新执行抛错
    shouldThrow = true;
    rerender(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>
    );

    // 错误边界重新捕获，兜底 UI 再次显示
    expect(screen.getByText('哎呀，出错了！')).toBeInTheDocument();
    expect(screen.queryByText('正常内容')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
  });
});
