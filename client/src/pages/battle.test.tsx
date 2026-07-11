import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ComponentProps } from 'react';
// 直接导入纯渲染组件，无需 mock PixiJS 引擎（SettlementPopup 无 Canvas 依赖）
import { SettlementPopup } from './battle';

type SettlementProps = ComponentProps<typeof SettlementPopup>;

/** 构造测试用结算数据，默认 show=true 空列表，避免每个用例重复拼字面量 */
function makeSettlement(overrides: Partial<SettlementProps['settlement']> = {}): SettlementProps['settlement'] {
  return { show: true, finalScores: [], ...overrides };
}

describe('SettlementPopup 结算弹窗', () => {
  it('show=false 时不渲染任何内容', () => {
    const { container } = render(
      <SettlementPopup settlement={makeSettlement({ show: false })} onBack={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('单玩家时显示 MVP 标志与排名信息', () => {
    const settlement = makeSettlement({
      finalScores: [{ userId: 'u1', nickname: '玩家1', score: 100 }],
    });
    render(<SettlementPopup settlement={settlement} onBack={() => {}} />);
    expect(screen.getByText('★ MVP ★')).toBeInTheDocument();
    expect(screen.getByText('1. 玩家1')).toBeInTheDocument();
    // 单玩家时分数在 MVP 区与排名列表各显示一次
    expect(screen.getAllByText('100 分')).toHaveLength(2);
  });

  it('多玩家时按分数降序排序展示排名', () => {
    const settlement = makeSettlement({
      finalScores: [
        { userId: 'u1', nickname: '低分', score: 50 },
        { userId: 'u2', nickname: '高分', score: 200 },
        { userId: 'u3', nickname: '中分', score: 100 },
      ],
    });
    render(<SettlementPopup settlement={settlement} onBack={() => {}} />);
    expect(screen.getByText('1. 高分')).toBeInTheDocument();
    expect(screen.getByText('2. 中分')).toBeInTheDocument();
    expect(screen.getByText('3. 低分')).toBeInTheDocument();
  });

  it('第一名奖牌色为金色，第二名非金色', () => {
    const settlement = makeSettlement({
      finalScores: [
        { userId: 'u1', nickname: '冠军', score: 200 },
        { userId: 'u2', nickname: '亚军', score: 100 },
      ],
    });
    render(<SettlementPopup settlement={settlement} onBack={() => {}} />);
    const champion = screen.getByText('1. 冠军');
    expect(champion.className).toContain('text-yellow');
    const runner = screen.getByText('2. 亚军');
    expect(runner.className).not.toContain('text-yellow');
  });

  it('点击返回大厅按钮触发 onBack 回调', () => {
    const onBack = vi.fn();
    const settlement = makeSettlement({
      finalScores: [{ userId: 'u1', nickname: '玩家1', score: 100 }],
    });
    render(<SettlementPopup settlement={settlement} onBack={onBack} />);
    fireEvent.click(screen.getByText('返回大厅'));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
