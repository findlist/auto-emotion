import { createRoot } from 'react-dom/client';
import { Toast, type ToastType } from '@/components/Toast';

let toastContainer: HTMLElement | null = null;
let toastId = 0;

function getContainer(): HTMLElement {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'fixed top-4 right-4 z-50 flex flex-col gap-2';
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

export function showToast(type: ToastType, message: string, duration?: number): void {
  const container = getContainer();
  const toastDiv = document.createElement('div');
  container.appendChild(toastDiv);

  const id = ++toastId;
  const root = createRoot(toastDiv);

  const handleClose = () => {
    root.unmount();
    toastDiv.remove();
    if (container.children.length === 0) {
      container.remove();
      toastContainer = null;
    }
  };

  root.render(
    <Toast
      key={id}
      type={type}
      message={message}
      duration={duration}
      onClose={handleClose}
    />
  );
}