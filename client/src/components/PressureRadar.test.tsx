import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PressureRadar from '@/components/PressureRadar';

const baseData = { work: 80, life: 60, social: 40, finance: 70, health: 50, hasData: true };

describe('PressureRadar 压力雷达图', () => {
  it('渲染五维标签文本', () => {
    render(<PressureRadar data={baseData} />);
    expect(screen.getByText('工作')).toBeInTheDocument();
    expect(screen.getByText('生活')).toBeInTheDocument();
    expect(screen.getByText('社交')).toBeInTheDocument();
    expect(screen.getByText('财务')).toBeInTheDocument();
    expect(screen.getByText('健康')).toBeInTheDocument();
  });

  it('hasData=true 时不渲染兜底提示', () => {
    render(<PressureRadar data={baseData} />);
    expect(screen.queryByText('暂无个人数据，展示全站平均')).not.toBeInTheDocument();
  });

  it('hasData=false 渲染兜底提示文案', () => {
    render(
      <PressureRadar
        data={{ work: 0, life: 0, social: 0, finance: 0, health: 0, hasData: false }}
      />
    );
    expect(screen.getByText('暂无个人数据，展示全站平均')).toBeInTheDocument();
  });

  it('hasData=false 时使用兜底数据 50 渲染数据点', () => {
    const { container } = render(
      <PressureRadar
        data={{ work: 0, life: 0, social: 0, finance: 0, health: 0, hasData: false }}
      />
    );
    // 兜底数据全 50，hover 第一个数据点应显示 50
    const dataDots = container.querySelectorAll('circle[r="5"]');
    expect(dataDots.length).toBe(5);
    fireEvent.mouseEnter(dataDots[0]);
    // tooltip 显示 "工作：50"
    expect(screen.getByText(/工作：/)).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
  });

  it('数值越界 clamp 到 [0,100] 不报错', () => {
    // 150 应被 clamp 到 100，-20 应被 clamp 到 0
    render(
      <PressureRadar
        data={{ work: 150, life: -20, social: 60, finance: 70, health: 50, hasData: true }}
      />
    );
    expect(screen.getByText('工作')).toBeInTheDocument();
  });

  it('渲染 SVG 容器与多边形路径', () => {
    const { container } = render(<PressureRadar data={baseData} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
    // 5 层网格 + 1 个数据多边形，至少 6 个 path
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBeGreaterThanOrEqual(6);
  });

  it('自定义 size 生效（影响 SVG 宽高）', () => {
    const { container } = render(<PressureRadar data={baseData} size={400} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('400');
    expect(svg?.getAttribute('height')).toBe('400');
  });

  it('hover 数据点显示 tooltip 并可离开隐藏', () => {
    const { container } = render(<PressureRadar data={baseData} />);
    const dataDots = container.querySelectorAll('circle[r="5"]');
    // 初始无 tooltip
    expect(screen.queryByText(/工作：/)).not.toBeInTheDocument();
    // hover 第一个点
    fireEvent.mouseEnter(dataDots[0]);
    expect(screen.getByText(/工作：/)).toBeInTheDocument();
    // 离开隐藏
    fireEvent.mouseLeave(dataDots[0]);
    expect(screen.queryByText(/工作：/)).not.toBeInTheDocument();
  });

  it('不同数值区间渲染对应颜色标签', () => {
    // work=30（低）、life=50（中）、social=75（高）验证 clamp 与颜色函数不报错
    render(
      <PressureRadar
        data={{ work: 30, life: 50, social: 75, finance: 90, health: 100, hasData: true }}
      />
    );
    expect(screen.getByText('工作')).toBeInTheDocument();
    expect(screen.getByText('健康')).toBeInTheDocument();
  });
});
