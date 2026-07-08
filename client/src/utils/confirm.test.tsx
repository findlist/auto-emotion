import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';
import { showConfirm } from '@/utils/confirm';

describe('showConfirm 全局确认弹窗', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 工具函数直接挂载到 body，需手动清空避免用例间污染
    document.body.innerHTML = '';
  });
  afterEach(() => vi.useRealTimers());

  it('点击确认按钮 resolve(true)', async () => {
    const promise = showConfirm({ title: '确认', message: '是否继续？' });
    // createRoot 在 React 19 concurrent 模式下异步渲染，需 act 推进微任务
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    // onConfirm 同步触发 cleanup + resolve
    const result = await promise;
    expect(result).toBe(true);
  });

  it('点击取消按钮 resolve(false)', async () => {
    const promise = showConfirm({ title: '确认', message: '是否继续？' });
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    // handleClose 含 200ms 出场动画延迟
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    const result = await promise;
    expect(result).toBe(false);
  });

  it('自定义 type/title/message/confirmText/cancelText 透传', async () => {
    const promise = showConfirm({
      type: 'danger',
      title: '删除好友',
      message: '确定删除该好友？',
      confirmText: '删除',
      cancelText: '保留',
    });
    await act(async () => {});
    expect(screen.getByText('删除好友')).toBeInTheDocument();
    expect(screen.getByText('确定删除该好友？')).toBeInTheDocument();
    // danger 类型渲染 ✗ 图标
    expect(screen.getByText('✗')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保留' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    expect(await promise).toBe(true);
  });

  it('确认后清理 DOM 容器', async () => {
    const promise = showConfirm({ title: 't', message: 'm' });
    await act(async () => {});
    expect(document.body.querySelector('div')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await promise;
    // cleanup 卸载 root 并移除容器节点，unmount 异步需 act 等待
    await act(async () => {});
    expect(document.body.querySelector('div')).toBeNull();
  });

  it('取消后清理 DOM 容器', async () => {
    const promise = showConfirm({ title: 't', message: 'm' });
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    await promise;
    await act(async () => {});
    expect(document.body.querySelector('div')).toBeNull();
  });
});
