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

/**
 * 从玩家名 span 反查其所在的排名行容器
 * 设计原因：commit 670a2ae 重构后排名数字与玩家名分属不同元素
 * （奖牌圆 div aria-hidden=true + 玩家名 span），测试需通过 closest 反查父容器，
 * 避免依赖已不存在的 "1. 玩家1" 连续文本断言
 *
 * selector 限定 span：MVP 区玩家名是 div，排名行玩家名是 span，
 * 同名玩家在 MVP 区与排名行各出现一次，不限定 span 会导致 getByText 抛 Found multiple elements
 */
function findRankRow(nickname: string): HTMLElement {
  const nameSpan = screen.getByText(nickname, { selector: 'span' });
  // 父容器为排名行 div（含奖牌圆 + 玩家名 span + 分数 span）
  return nameSpan.closest('div.flex.justify-between') as HTMLElement;
}

/** 取指定玩家名对应排名行的奖牌圆 badge div */
function findMedalBadge(nickname: string): HTMLElement {
  const row = findRankRow(nickname);
  return row.querySelector('div[aria-hidden="true"]') as HTMLElement;
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
    // 排名行通过玩家名 span 反查父容器验证存在性（排名数字与玩家名分属不同元素）
    expect(findRankRow('玩家1')).toBeTruthy();
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
    // 验证 3 个玩家名 span 均渲染（selector 限定 span 区分 MVP 区 div 中的同名文本）
    expect(screen.getByText('高分', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('中分', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('低分', { selector: 'span' })).toBeInTheDocument();

    // 验证排名行 DOM 顺序按分数降序：第一名=高分、第二名=中分、第三名=低分
    const dialog = screen.getByRole('alertdialog');
    const rows = dialog.querySelectorAll('div.flex.justify-between');
    expect(rows[0].textContent).toContain('高分');
    expect(rows[1].textContent).toContain('中分');
    expect(rows[2].textContent).toContain('低分');
  });

  it('第一名奖牌色为金色，第二名非金色', () => {
    const settlement = makeSettlement({
      finalScores: [
        { userId: 'u1', nickname: '冠军', score: 200 },
        { userId: 'u2', nickname: '亚军', score: 100 },
      ],
    });
    render(<SettlementPopup settlement={settlement} onBack={() => {}} />);
    // 通过奖牌 badge 的 className 验证奖牌色（commit 670a2ae 后奖牌为独立 aria-hidden 元素）
    const championMedal = findMedalBadge('冠军');
    expect(championMedal.className).toContain('medal-gold');
    const runnerMedal = findMedalBadge('亚军');
    expect(runnerMedal.className).toContain('medal-silver');
    expect(runnerMedal.className).not.toContain('medal-gold');
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
