import { useEffect, useRef } from 'react';

/**
 * useAsyncEffect：抽取 4 处页面（achievements/friends/season-pass/tasks）初始加载场景的
 * `useEffect + let cancelled = false + async IIFE + try/catch/finally` 样板。
 *
 * 设计原因：
 * 1. 手写 cancelled 标志易遗漏 cleanup 返回，导致组件卸载后仍触发 setState 警告。
 *    统一 hook 后内部维护标志语义，调用方仅需提供 effect 与回调即可。
 * 2. 通过 useRef 在每次渲染时更新回调引用，避免回调闭包捕获过期状态；
 *    同时避免回调变化触发 effect 重跑（依赖项仅由 deps 控制，与 useEffect 行为一致）。
 * 3. 不提供 setLoading 自动调用，因为各页面的 setLoading 语义不同
 *    （初始加载与 handleXxx 操作共用 setLoading），由调用方通过 onFinally 显式传入更清晰。
 *
 * 适用边界：仅用于初始加载/依赖项触发的异步副作用。按钮触发的操作（如领取奖励）保持原写法，
 * 因其语义为用户交互而非副作用，强行统一会模糊意图。
 */
export function useAsyncEffect<T>(
  effect: () => Promise<T>,
  onSuccess: (data: T) => void,
  options: {
    onError?: (err: unknown) => void;
    onFinally?: () => void;
    deps?: React.DependencyList;
  } = {}
): void {
  // 每次渲染同步更新 ref，确保 effect 内部读取的回调始终为最新版本
  const effectRef = useRef(effect);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(options.onError);
  const onFinallyRef = useRef(options.onFinally);

  effectRef.current = effect;
  onSuccessRef.current = onSuccess;
  onErrorRef.current = options.onError;
  onFinallyRef.current = options.onFinally;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await effectRef.current();
        if (!cancelled) onSuccessRef.current(data);
      } catch (err) {
        // 组件卸载后吞掉错误，避免对已卸载组件调用 onError 触发 setState 警告
        if (!cancelled && onErrorRef.current) {
          onErrorRef.current(err);
        }
      } finally {
        if (!cancelled && onFinallyRef.current) {
          onFinallyRef.current();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // deps 由调用方控制重跑时机，ref 已保证回调最新无需纳入依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, options.deps ?? []);
}
