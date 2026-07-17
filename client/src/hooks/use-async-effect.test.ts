import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAsyncEffect } from './use-async-effect';

/**
 * useAsyncEffect 测试：覆盖成功/失败/卸载守卫/deps 重跑/回调 ref 更新五个核心场景。
 * 使用 renderHook + 微任务 flush 保证 async 流程可控。
 */
describe('useAsyncEffect', () => {
  it('effect 成功后调用 onSuccess 传入数据', async () => {
    const effect = vi.fn().mockResolvedValue('payload');
    const onSuccess = vi.fn();
    const onFinally = vi.fn();

    renderHook(() => useAsyncEffect(effect, onSuccess, { onFinally }));

    // 等待微任务链完成（effect → onSuccess → onFinally）
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(effect).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith('payload');
    expect(onFinally).toHaveBeenCalledTimes(1);
  });

  it('effect 抛错时调用 onError 并跳过 onSuccess', async () => {
    const error = new Error('boom');
    const effect = vi.fn().mockRejectedValue(error);
    const onSuccess = vi.fn();
    const onError = vi.fn();

    renderHook(() => useAsyncEffect(effect, onSuccess, { onError }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onError).toHaveBeenCalledWith(error);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('组件在 effect resolve 前卸载时跳过 onSuccess 与 onFinally', async () => {
    // 用一个可控的 deferred 让 effect 处于 pending 状态
    let resolveEffect: (value: string) => void = () => {};
    const effect = vi.fn().mockImplementation(
      () => new Promise<string>((resolve) => { resolveEffect = resolve; })
    );
    const onSuccess = vi.fn();
    const onFinally = vi.fn();

    const { unmount } = renderHook(() => useAsyncEffect(effect, onSuccess, { onFinally }));

    // 在 effect pending 时卸载组件，触发 cancelled = true
    unmount();

    // 卸载后 resolve effect，hook 应跳过所有回调
    await act(async () => {
      resolveEffect('late-data');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onFinally).not.toHaveBeenCalled();
  });

  it('deps 变化触发 effect 重跑，回调被多次调用', async () => {
    const effect = vi.fn().mockResolvedValue('data');
    const onSuccess = vi.fn();

    const { rerender } = renderHook(
      ({ dep }) => useAsyncEffect(effect, onSuccess, { deps: [dep] }),
      { initialProps: { dep: 1 } }
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(effect).toHaveBeenCalledTimes(1);

    // 修改 dep 触发重跑
    rerender({ dep: 2 });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(effect).toHaveBeenCalledTimes(2);
    expect(onSuccess).toHaveBeenCalledTimes(2);
  });

  it('回调变化不触发 effect 重跑（ref 更新语义）', async () => {
    const effect = vi.fn().mockResolvedValue('data');
    const firstOnSuccess = vi.fn();
    const secondOnSuccess = vi.fn();

    const { rerender } = renderHook(
      ({ onSuccess }) => useAsyncEffect(effect, onSuccess),
      { initialProps: { onSuccess: firstOnSuccess } }
    );

    // 首次 effect 完成
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(effect).toHaveBeenCalledTimes(1);
    expect(firstOnSuccess).toHaveBeenCalledTimes(1);

    // 传入新 onSuccess 引用但不改 deps，effect 不应重跑
    rerender({ onSuccess: secondOnSuccess });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(effect).toHaveBeenCalledTimes(1);
    expect(secondOnSuccess).not.toHaveBeenCalled();
  });
});
