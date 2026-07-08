import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Empty from '@/components/Empty';

describe('Empty 空状态组件', () => {
  it('默认渲染兜底 icon 与 title', () => {
    render(<Empty />);
    expect(screen.getByText('📭')).toBeInTheDocument();
    expect(screen.getByText('暂无数据')).toBeInTheDocument();
  });

  it('自定义 icon 与 title 透传渲染', () => {
    render(<Empty icon="🎮" title="还没有对战记录" />);
    expect(screen.getByText('🎮')).toBeInTheDocument();
    expect(screen.getByText('还没有对战记录')).toBeInTheDocument();
    expect(screen.queryByText('暂无数据')).not.toBeInTheDocument();
  });

  it('传入 description 渲染描述文案', () => {
    render(<Empty title="好友列表为空" description="去添加好友一起开黑吧" />);
    expect(screen.getByText('好友列表为空')).toBeInTheDocument();
    expect(screen.getByText('去添加好友一起开黑吧')).toBeInTheDocument();
  });

  it('未传 description 不渲染描述节点', () => {
    const { container } = render(<Empty />);
    // title 节点是 p，description 也是 p，仅应有 1 个 p（title）
    expect(container.querySelectorAll('p')).toHaveLength(1);
  });

  it('传入 action 渲染按钮并触发 onClick', () => {
    const onClick = vi.fn();
    render(<Empty action={{ label: '去逛逛', onClick }} />);
    const btn = screen.getByRole('button', { name: '去逛逛' });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('未传 action 不渲染按钮', () => {
    render(<Empty />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
