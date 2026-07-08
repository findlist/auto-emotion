import { createRoot } from 'react-dom/client';
import { ConfirmDialog, type ConfirmType } from '@/components/ConfirmDialog';

interface ConfirmOptions {
  type?: ConfirmType;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
}

/**
 * 全局确认弹窗，返回 Promise<boolean>
 * - true：用户点击确认
 * - false：用户点击取消 / ESC / 遮罩
 *
 * 使用示例：
 *   const ok = await showConfirm({ title: '购买', message: '确认花费 100 金币？' });
 *   if (!ok) return;
 */
export function showConfirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    // 卸载并清理 DOM 节点
    const cleanup = () => {
      root.unmount();
      container.remove();
    };

    root.render(
      <ConfirmDialog
        type={options.type}
        title={options.title}
        message={options.message}
        confirmText={options.confirmText}
        cancelText={options.cancelText}
        onConfirm={() => {
          cleanup();
          resolve(true);
        }}
        onClose={() => {
          cleanup();
          resolve(false);
        }}
      />
    );
  });
}
