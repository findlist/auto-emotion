import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from '@/components/ConfirmDialog';

// 辅助：获取弹窗内可聚焦元素，与组件内焦点陷阱选择器保持一致
function getFocusables(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
  );
}

describe('ConfirmDialog 确认弹窗', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('默认 type=warning 渲染 ⚠ 图标', () => {
    render(<ConfirmDialog title="确认操作" message="是否继续？" onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('⚠')).toBeInTheDocument();
  });

  it('info 类型渲染 ℹ 图标', () => {
    render(<ConfirmDialog type="info" title="提示" message="内容" onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('ℹ')).toBeInTheDocument();
  });

  it('danger 类型渲染 ✗ 图标', () => {
    render(<ConfirmDialog type="danger" title="危险操作" message="不可恢复" onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('✗')).toBeInTheDocument();
  });

  it('渲染 title 与 message 文本', () => {
    render(<ConfirmDialog title="删除确认" message="确定删除该好友？" onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('删除确认')).toBeInTheDocument();
    expect(screen.getByText('确定删除该好友？')).toBeInTheDocument();
  });

  it('自定义 confirmText 与 cancelText 生效', () => {
    render(
      <ConfirmDialog
        title="t"
        message="m"
        confirmText="删除"
        cancelText="保留"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保留' })).toBeInTheDocument();
  });

  it('点击确认按钮触发 onConfirm', () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog title="t" message="m" onConfirm={onConfirm} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('连点确认按钮多次仅触发一次 onConfirm（防重入）', () => {
    // 场景：用户快速连点确认按钮，handleConfirm 内 isConfirmingRef 守卫应阻止重复回调
    // 设计原因：与 handleClose 的 isLeavingRef 守卫保持一致的重入防护模式；
    // showConfirm 内 cleanup 会同步卸载组件，连点第二次虽点不到按钮，但若业务层直接使用
    // ConfirmDialog 且 onConfirm 不卸载组件，连点会触发多次业务回调（如重复提交订单）
    const onConfirm = vi.fn();
    render(<ConfirmDialog title="t" message="m" onConfirm={onConfirm} onClose={vi.fn()} />);
    const confirmBtn = screen.getByRole('button', { name: '确认' });
    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('点击取消按钮触发 onClose（含出场动画延迟）', () => {
    const onClose = vi.fn();
    render(<ConfirmDialog title="t" message="m" onConfirm={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    // handleClose 内有 200ms 出场动画延迟
    vi.advanceTimersByTime(200);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ESC 键触发 onClose', () => {
    const onClose = vi.fn();
    render(<ConfirmDialog title="t" message="m" onConfirm={vi.fn()} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    vi.advanceTimersByTime(200);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('点击遮罩层触发 onClose', () => {
    const onClose = vi.fn();
    const { container } = render(
      <ConfirmDialog title="t" message="m" onConfirm={vi.fn()} onClose={onClose} />
    );
    // 遮罩是外层 fixed 容器（container.firstChild）
    const overlay = container.firstChild as HTMLElement;
    fireEvent.click(overlay);
    vi.advanceTimersByTime(200);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('点击卡片内部不触发 onClose（stopPropagation）', () => {
    const onClose = vi.fn();
    render(<ConfirmDialog title="标题" message="m" onConfirm={vi.fn()} onClose={onClose} />);
    // 点击内容区文字，不应触发遮罩关闭
    fireEvent.click(screen.getByText('标题'));
    vi.advanceTimersByTime(200);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('出场动画期间重复触发关闭不重复回调', () => {
    const onClose = vi.fn();
    render(<ConfirmDialog title="t" message="m" onConfirm={vi.fn()} onClose={onClose} />);
    // 第一次触发关闭，进入出场动画
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    // 立即再次触发（ESC），isLeaving=true 应被忽略
    fireEvent.keyDown(window, { key: 'Escape' });
    vi.advanceTimersByTime(200);
    // onClose 仅触发一次
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ============ 无障碍适配 ============

  it('弹窗容器具备 role=dialog 与 aria-modal=true', () => {
    render(<ConfirmDialog title="t" message="m" onConfirm={vi.fn()} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('aria-labelledby 关联标题元素，aria-describedby 关联消息元素', () => {
    render(<ConfirmDialog title="标题文案" message="消息文案" onConfirm={vi.fn()} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    const describedBy = dialog.getAttribute('aria-describedby');
    expect(labelledBy).toBeTruthy();
    expect(describedBy).toBeTruthy();
    // aria-labelledby 指向的元素文本即标题
    expect(document.getElementById(labelledBy!)?.textContent).toBe('标题文案');
    // aria-describedby 指向的元素文本即消息
    expect(document.getElementById(describedBy!)?.textContent).toBe('消息文案');
  });

  it('非 danger 类型打开时自动聚焦确认按钮（提升常用操作效率）', () => {
    render(<ConfirmDialog title="t" message="m" onConfirm={vi.fn()} onClose={vi.fn()} />);
    const confirmBtn = screen.getByRole('button', { name: '确认' });
    expect(document.activeElement).toBe(confirmBtn);
  });

  it('danger 类型打开时聚焦取消按钮（防误触危险操作）', () => {
    render(<ConfirmDialog type="danger" title="t" message="m" onConfirm={vi.fn()} onClose={vi.fn()} />);
    const cancelBtn = screen.getByRole('button', { name: '取消' });
    expect(document.activeElement).toBe(cancelBtn);
  });

  it('Tab 焦点陷阱：焦点在最后一个按钮时按 Tab 跳回第一个', () => {
    const { container } = render(
      <ConfirmDialog title="t" message="m" onConfirm={vi.fn()} onClose={vi.fn()} />
    );
    const dialog = screen.getByRole('dialog');
    const focusables = getFocusables(dialog);
    expect(focusables.length).toBeGreaterThanOrEqual(2);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    // 模拟焦点在最后一个按钮时按 Tab，应 preventDefault 并跳回第一个
    last.focus();
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    // 容器引用避免 lint 未使用告警
    expect(container).toBeTruthy();
  });

  it('Shift+Tab 焦点陷阱：焦点在第一个按钮时跳到最后一个', () => {
    render(<ConfirmDialog title="t" message="m" onConfirm={vi.fn()} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    const focusables = getFocusables(dialog);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    first.focus();
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('卸载后恢复焦点到触发元素', () => {
    // 准备一个触发按钮模拟打开弹窗前的焦点
    const trigger = document.createElement('button');
    trigger.textContent = '触发';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = render(
      <ConfirmDialog title="t" message="m" onConfirm={vi.fn()} onClose={vi.fn()} />
    );
    // 弹窗打开后焦点切换到确认按钮
    expect(document.activeElement).not.toBe(trigger);
    unmount();
    // 卸载后焦点恢复到触发按钮
    expect(document.activeElement).toBe(trigger);
    document.body.removeChild(trigger);
  });
});
