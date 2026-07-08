import { useEffect, useRef, useState } from 'react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  type: ToastType;
  message: string;
  duration?: number;
  onClose: () => void;
}

const typeConfig: Record<ToastType, { bg: string; border: string; icon: string }> = {
  success: { bg: 'bg-mint', border: 'border-mint', icon: '✓' },
  error: { bg: 'bg-pink', border: 'border-pink', icon: '✗' },
  warning: { bg: 'bg-yellow', border: 'border-yellow', icon: '⚠' },
  info: { bg: 'bg-orange', border: 'border-orange', icon: 'ℹ' },
};

export function Toast({ type, message, duration = 3000, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  // 防重入标志用 ref：自动消失定时器与手动关闭按钮都通过 handleClose 触发关闭流程，
  // 若两者先后触发（如自动消失过程中用户又点关闭按钮）会导致 onClose 被调用两次；
  // ref.current 可变不受闭包捕获影响，与 ConfirmDialog 保持一致的重入守卫模式
  const isLeavingRef = useRef(false);
  // 出场动画定时器引用：handleClose 触发 300ms 出场动画后调用 onClose 卸载组件，
  // 若组件在此期间被父组件强制卸载（路由跳转等），未清理的 setTimeout 仍会执行 onClose，
  // 属于资源泄漏。存储 timer id 在卸载时 clearTimeout 保障资源及时释放，与 ConfirmDialog 对称
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // 统一关闭流程：先做出场动画，再回调 onClose 卸载；重入直接返回避免多次回调
  function handleClose() {
    if (isLeavingRef.current) return;
    isLeavingRef.current = true;
    setIsLeaving(true);
    // 存储 timer id 供卸载时清理，避免组件被强制卸载后定时器仍触发 onClose
    leaveTimerRef.current = setTimeout(onClose, 300);
  }

  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));

    const timer = setTimeout(handleClose, duration);

    return () => {
      clearTimeout(timer);
      // 清理未完成的出场动画定时器，防止组件卸载后仍触发 onClose 造成资源泄漏
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current);
      }
    };
    // handleClose 通过 ref 防重入，onClose 变化无需重设定时器；
    // duration 变化时重设倒计时符合预期
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration]);

  const config = typeConfig[type];

  return (
    <div
      // role=status + aria-live=polite：屏幕阅读器在空闲时朗读 toast 内容，
      // 不会打断用户当前操作；polite 适用于非紧急提示（成功/信息/警告），
      // error 类型也用 polite 而非 assertive，避免打断用户输入
      role="status"
      aria-live="polite"
      className={`
        ${config.bg} border-4 ${config.border} shadow-[4px_4px_0_#1a1a1a] px-4 py-3
        flex items-center gap-3 min-w-[280px] max-w-sm
        transition-all duration-300 ease-out
        ${isVisible && !isLeaving ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
      `}
    >
      <span aria-hidden="true" className="text-xl font-bold">{config.icon}</span>
      <p className="font-mono text-sm text-ink flex-1">{message}</p>
      <button
        onClick={handleClose}
        aria-label="关闭提示"
        className="text-ink/60 hover:text-ink transition-colors"
      >
        ✕
      </button>
    </div>
  );
}

export type { ToastType, ToastProps };