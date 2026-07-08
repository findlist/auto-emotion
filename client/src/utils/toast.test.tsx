import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, act } from '@testing-library/react';

// showToast 内部维护模块级单例 container，需每个用例前 resetModules 重置
let showToast: typeof import('@/utils/toast')['showToast'];

describe('showToast 全局提示', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    // 重置模块状态，让 toastContainer 单例归零避免跨用例污染
    vi.resetModules();
    ({ showToast } = await import('@/utils/toast'));
  });
  afterEach(() => vi.useRealTimers());

  it('success 类型渲染 ✓ 图标与消息文本', async () => {
    showToast('success', '操作成功');
    // createRoot 在 React 19 concurrent 模式下异步渲染，需 act 推进微任务
    await act(async () => {});
    expect(screen.getByText('✓')).toBeInTheDocument();
    expect(screen.getByText('操作成功')).toBeInTheDocument();
  });

  it('warning 类型渲染 ⚠ 图标', async () => {
    showToast('warning', '请注意');
    await act(async () => {});
    expect(screen.getByText('⚠')).toBeInTheDocument();
  });

  it('error 类型渲染 ✗ 图标', async () => {
    showToast('error', '操作失败');
    await act(async () => {});
    expect(screen.getByText('✗')).toBeInTheDocument();
  });

  it('多次调用累加多个 Toast', async () => {
    showToast('success', '第一条');
    showToast('error', '第二条');
    await act(async () => {});
    expect(screen.getByText('第一条')).toBeInTheDocument();
    expect(screen.getByText('第二条')).toBeInTheDocument();
  });

  it('container 单例复用', async () => {
    showToast('success', '第一条');
    await act(async () => {});
    const container1 = document.body.querySelector('.fixed.top-4.right-4');
    showToast('error', '第二条');
    await act(async () => {});
    const container2 = document.body.querySelector('.fixed.top-4.right-4');
    // 第二次调用应复用首次创建的 container，不重复创建
    expect(container1).toBe(container2);
  });

  it('duration 到期后自动移除 Toast', async () => {
    showToast('info', '自动关闭', 1000);
    await act(async () => {});
    expect(screen.getByText('自动关闭')).toBeInTheDocument();
    // duration(1000) + 离场动画(300) 后触发 onClose 移除
    await act(async () => {
      vi.advanceTimersByTime(1300);
    });
    expect(screen.queryByText('自动关闭')).not.toBeInTheDocument();
  });

  it('所有 Toast 关闭后清理 container', async () => {
    showToast('info', '提示', 1000);
    await act(async () => {});
    expect(document.body.querySelector('.fixed.top-4.right-4')).not.toBeNull();
    // Toast 关闭后 handleClose 检查 container.children.length===0 时移除 container
    await act(async () => {
      vi.advanceTimersByTime(1300);
    });
    expect(document.body.querySelector('.fixed.top-4.right-4')).toBeNull();
  });
});
