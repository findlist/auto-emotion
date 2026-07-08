import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Loading from '@/components/Loading';

describe('Loading 加载组件', () => {
  it('默认 size=md 渲染 spinner 与默认文案', () => {
    const { container } = render(<Loading />);
    // md 对应 w-10 h-10
    expect(container.querySelector('.w-10.h-10')).toBeInTheDocument();
    expect(screen.getByText('加载中...')).toBeInTheDocument();
  });

  it('size=sm 渲染小尺寸 spinner', () => {
    const { container } = render(<Loading size="sm" />);
    expect(container.querySelector('.w-6.h-6')).toBeInTheDocument();
  });

  it('size=lg 渲染大尺寸 spinner', () => {
    const { container } = render(<Loading size="lg" />);
    expect(container.querySelector('.w-16.h-16')).toBeInTheDocument();
  });

  it('自定义 text 渲染对应文案', () => {
    render(<Loading text="正在进入对战..." />);
    expect(screen.getByText('正在进入对战...')).toBeInTheDocument();
    expect(screen.queryByText('加载中...')).not.toBeInTheDocument();
  });

  it('text 为空字符串时不渲染文案节点', () => {
    const { container } = render(<Loading text="" />);
    expect(container.querySelector('p')).not.toBeInTheDocument();
  });
});
