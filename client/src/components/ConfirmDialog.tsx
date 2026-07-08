import { useEffect, useRef, useState, useId } from 'react';

// 确认弹窗类型：info 普通 / warning 警告 / danger 危险操作
type ConfirmType = 'info' | 'warning' | 'danger';

interface ConfirmDialogProps {
  type?: ConfirmType;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onClose: () => void;
}

// 类型样式配置：标题条颜色 + 图标
const typeConfig: Record<ConfirmType, { accent: string; icon: string }> = {
  info: { accent: 'bg-ink', icon: 'ℹ' },
  warning: { accent: 'bg-yellow', icon: '⚠' },
  danger: { accent: 'bg-pink', icon: '✗' },
};

/**
 * 通用确认弹窗组件
 * - 模态遮罩 + 居中卡片，遵循项目 neo-brutalism 风格
 * - 支持 ESC 关闭、点击遮罩关闭
 * - 入场/出场动画
 * - 无障碍：role=dialog/aria-modal 标识模态，aria-labelledby/describedby 关联标题与说明，
 *   焦点初始聚焦到主操作按钮（danger 反向聚焦取消按钮防误触），Tab 焦点陷阱避免逃逸，
 *   关闭后恢复焦点到触发元素，便于屏幕阅读器与键盘用户继续原操作流
 */
export function ConfirmDialog({
  type = 'warning',
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  // 防重入标志用 ref：useEffect([]) 注册的 handleEsc 闭包捕获首次渲染的 isLeaving state 旧值，
  // 会导致连续触发关闭时 onClose 被多次调用；ref.current 可变，不受闭包捕获影响
  const isLeavingRef = useRef(false);
  // 确认按钮防重入标志：连点确认按钮会触发 onConfirm 多次（如 showConfirm 内部 cleanup
  // 多次调用导致 React 警告 "root.unmount on unmounted root"）；与 isLeavingRef 保持一致的守卫模式
  const isConfirmingRef = useRef(false);
  // 出场动画定时器引用：handleClose 触发 200ms 出场动画后调用 onClose 卸载组件，
  // 若组件在此期间被父组件强制卸载（路由跳转/登出等），未清理的 setTimeout 仍会执行 onClose，
  // 属于资源泄漏。存储 timer id 在卸载时 clearTimeout 保障资源及时释放
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // 弹窗容器 ref：用于焦点陷阱查询可聚焦元素
  const dialogRef = useRef<HTMLDivElement>(null);
  // 主操作按钮 ref：用于打开时初始聚焦
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  // 打开前焦点元素 ref：关闭时恢复，便于键盘用户继续原操作流
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  // useId 生成稳定唯一 id，避免多实例同时渲染时 aria-labelledby 重复
  const titleId = useId();
  const msgId = useId();

  useEffect(() => {
    // 记录触发元素，关闭时恢复焦点
    lastFocusedRef.current = document.activeElement as HTMLElement;
    // danger 类型聚焦取消按钮（防误触危险操作），其他聚焦确认按钮（提升常用操作效率）
    const targetBtn = type === 'danger' ? cancelBtnRef.current : confirmBtnRef.current;
    targetBtn?.focus();

    requestAnimationFrame(() => setIsVisible(true));

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
        return;
      }
      // 焦点陷阱：Tab/Shift+Tab 在弹窗内循环，避免键盘焦点逃逸到背景元素
      if (e.key === 'Tab') {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const focusables = dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      // 清理未完成的出场动画定时器，防止组件卸载后仍触发 onClose 造成资源泄漏
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current);
      }
      // 卸载时恢复焦点到触发元素
      lastFocusedRef.current?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 统一的关闭流程：先做出场动画，再回调 onClose 卸载
  function handleClose() {
    if (isLeavingRef.current) return;
    isLeavingRef.current = true;
    setIsLeaving(true);
    // 存储 timer id 供卸载时清理，避免组件被强制卸载后定时器仍触发 onClose
    leaveTimerRef.current = setTimeout(onClose, 200);
  }

  // 确认按钮统一入口：防重入守卫，避免连点触发 onConfirm 多次
  function handleConfirm() {
    if (isConfirmingRef.current) return;
    isConfirmingRef.current = true;
    onConfirm();
  }

  const config = typeConfig[type];
  const visible = isVisible && !isLeaving;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-ink/50 transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={handleClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={msgId}
        className={`bg-cream border-4 border-ink shadow-[6px_6px_0_#1a1a1a] max-w-sm w-full mx-4 transition-all duration-200 ${
          visible ? 'translate-y-0 scale-100' : 'translate-y-4 scale-95'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className={`${config.accent} px-4 py-3 flex items-center gap-3`}>
          <span aria-hidden="true" className="text-xl font-bold text-cream">{config.icon}</span>
          <h2 id={titleId} className="font-cn text-lg font-bold text-cream">{title}</h2>
        </div>

        {/* 内容区 */}
        <div className="p-4">
          <p id={msgId} className="font-mono text-sm text-ink whitespace-pre-line">{message}</p>
          <div className="flex gap-2 mt-4">
            <button
              ref={cancelBtnRef}
              onClick={handleClose}
              className="flex-1 bg-cream border-2 border-ink text-ink px-4 py-2 font-cn font-bold hover:bg-ink/10 transition-colors"
            >
              {cancelText}
            </button>
            <button
              ref={confirmBtnRef}
              onClick={handleConfirm}
              className={`flex-1 ${config.accent} text-cream px-4 py-2 font-cn font-bold hover:opacity-80 transition-opacity`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export type { ConfirmDialogProps, ConfirmType };
