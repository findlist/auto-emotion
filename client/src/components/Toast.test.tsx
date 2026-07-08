import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Toast } from '@/components/Toast';

describe('Toast 提示组件', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('success 类型渲染 ✓ 图标与消息文本', () => {
    render(<Toast type="success" message="操作成功" onClose={vi.fn()} />);
    expect(screen.getByText('✓')).toBeInTheDocument();
    expect(screen.getByText('操作成功')).toBeInTheDocument();
  });

  it('error 类型渲染 ✗ 图标', () => {
    render(<Toast type="error" message="操作失败" onClose={vi.fn()} />);
    expect(screen.getByText('✗')).toBeInTheDocument();
  });

  it('warning 类型渲染 ⚠ 图标', () => {
    render(<Toast type="warning" message="请注意" onClose={vi.fn()} />);
    expect(screen.getByText('⚠')).toBeInTheDocument();
  });

  it('info 类型渲染 ℹ 图标', () => {
    render(<Toast type="info" message="提示信息" onClose={vi.fn()} />);
    expect(screen.getByText('ℹ')).toBeInTheDocument();
  });

  it('duration 到期后自动触发 onClose', () => {
    const onClose = vi.fn();
    render(<Toast type="info" message="自动关闭" duration={1000} onClose={onClose} />);
    expect(onClose).not.toHaveBeenCalled();
    // duration(1000) + 离场动画(300) 后触发 onClose
    vi.advanceTimersByTime(1300);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('点击关闭按钮触发 onClose', () => {
    const onClose = vi.fn();
    render(<Toast type="info" message="手动关闭" onClose={onClose} />);
    fireEvent.click(screen.getByText('✕'));
    // 离场动画 300ms 后回调
    vi.advanceTimersByTime(300);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ============ 重入守卫（修复连点 / 自动消失+手动关闭同时触发导致 onClose 多次回调） ============

  it('连续点击关闭按钮多次仅触发一次 onClose（防重入）', () => {
    const onClose = vi.fn();
    render(<Toast type="info" message="连点测试" onClose={onClose} />);
    const closeBtn = screen.getByText('✕');
    // 连续点击 3 次，重入守卫应保证只回调一次
    fireEvent.click(closeBtn);
    fireEvent.click(closeBtn);
    fireEvent.click(closeBtn);
    vi.advanceTimersByTime(300);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('自动消失过程中点击关闭按钮仅触发一次 onClose', () => {
    const onClose = vi.fn();
    render(<Toast type="info" message="混合触发" duration={1000} onClose={onClose} />);
    // 推进 800ms：自动消失定时器尚未到期，此时手动点关闭按钮触发 handleClose
    vi.advanceTimersByTime(800);
    fireEvent.click(screen.getByText('✕'));
    // 再推进到自动消失定时器本应触发的时刻（200ms 后即 1000ms）+ 离场动画 300ms
    vi.advanceTimersByTime(500);
    // 自动消失定时器回调与手动关闭回调只能有一个生效
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('默认 duration 为 3000ms', () => {
    const onClose = vi.fn();
    render(<Toast type="info" message="默认时长" onClose={onClose} />);
    // 3000ms 前不应关闭
    vi.advanceTimersByTime(2999);
    expect(onClose).not.toHaveBeenCalled();
    // 3300ms（含离场动画）后关闭
    vi.advanceTimersByTime(301);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('组件卸载时清理定时器避免内存泄漏', () => {
    const onClose = vi.fn();
    const { unmount } = render(<Toast type="info" message="卸载测试" onClose={onClose} />);
    // 卸载不应触发 onClose（仅清理）
    unmount();
    expect(onClose).not.toHaveBeenCalled();
  });

  // ============ 无障碍适配 ============

  it('容器具备 role=status 与 aria-live=polite，供屏幕阅读器朗读', () => {
    render(<Toast type="info" message="无障碍提示" onClose={vi.fn()} />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('无障碍提示');
  });

  it('装饰图标标 aria-hidden=true，避免屏幕阅读器重复朗读符号', () => {
    render(<Toast type="success" message="m" onClose={vi.fn()} />);
    const icon = screen.getByText('✓');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('关闭按钮有 aria-label 语义化标签（按钮内仅符号字符）', () => {
    render(<Toast type="info" message="m" onClose={vi.fn()} />);
    const closeBtn = screen.getByRole('button', { name: '关闭提示' });
    expect(closeBtn).toBeInTheDocument();
  });
});
