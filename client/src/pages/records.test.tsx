import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// vi.hoisted 让 mock 工厂引用的运行时可变状态在 vi.mock 提升后仍可访问。
// list/get 在不同用例中动态调整返回值，setter 写入后下次渲染读取最新值。
const recordApiMock = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
}));

vi.mock('@/api/record', () => ({
  recordApi: recordApiMock,
}));

import RecordsPage from '@/pages/records';

// 模拟一条战绩列表数据，覆盖 boss 模式 + MVP 场景
const mockRecord = {
  id: 'r1',
  room_id: 'room1',
  mode: 'boss',
  duration_seconds: 180,
  total_score: 1000,
  created_at: '2026-07-07T10:00:00Z',
  nickname: '玩家1',
  score: 800,
  rank: 1,
  is_mvp: true,
  exp_reward: 100,
  gold_reward: 50,
};

// 详情数据扩展 damage 字段，验证详情独有字段渲染
const mockDetail = { ...mockRecord, damage: 500 };

describe('RecordsPage 战绩页无障碍与 focus trap', () => {
  beforeEach(() => {
    recordApiMock.list.mockResolvedValue({ records: [mockRecord], total: 1 });
    recordApiMock.get.mockResolvedValue(mockDetail);
  });

  it('加载战绩列表后渲染卡片（含模式标签）', async () => {
    render(<RecordsPage />);
    expect(await screen.findByText('Boss 模式')).toBeInTheDocument();
  });

  it('卡片有 role=button + aria-label 描述模式与排名，键盘可访问', async () => {
    render(<RecordsPage />);
    // getByRole button + name 正则匹配 aria-label，校验语义化标签与可访问性
    const card = await screen.findByRole('button', { name: /查看Boss 模式战绩详情.*排名第1名/ });
    expect(card).toHaveAttribute('tabindex', '0');
  });

  it('点击卡片打开详情弹窗，弹窗容器有 role=dialog + aria-modal + aria-label', async () => {
    render(<RecordsPage />);
    const card = await screen.findByRole('button', { name: /查看/ });
    fireEvent.click(card);
    // waitFor 等待异步 openDetail 完成后弹窗渲染
    await waitFor(() => {
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-label', '战绩详情');
    });
  });

  it('打开弹窗后焦点进入对话框容器（focus trap 初始聚焦，含 Loading 期间稳定）', async () => {
    render(<RecordsPage />);
    const card = await screen.findByRole('button', { name: /查看/ });
    fireEvent.click(card);
    // 弹窗渲染后 useEffect 聚焦 dialog 容器（tabIndex=-1 可编程聚焦）
    await waitFor(() => {
      const dialog = screen.getByRole('dialog');
      expect(document.activeElement).toBe(dialog);
    });
  });

  it('ESC 关闭详情弹窗', async () => {
    render(<RecordsPage />);
    const card = await screen.findByRole('button', { name: /查看/ });
    fireEvent.click(card);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    fireEvent.keyDown(window, { key: 'Escape' });
    // 等待 setSelectedRecord(null) 触发 re-render 卸载弹窗
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('关闭后焦点恢复到触发卡片，便于键盘用户继续列表浏览', async () => {
    render(<RecordsPage />);
    const card = await screen.findByRole('button', { name: /查看/ });
    // 显式聚焦卡片模拟键盘用户从卡片触发详情查看
    card.focus();
    fireEvent.click(card);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // useEffect cleanup 恢复焦点到 trigger（卡片）
    expect(document.activeElement).toBe(card);
  });

  it('Tab 焦点陷阱：详情加载后焦点在关闭按钮时 Tab 循环回自身（单按钮场景）', async () => {
    render(<RecordsPage />);
    const card = await screen.findByRole('button', { name: /查看/ });
    fireEvent.click(card);
    // 等待 detailLoading=false 后关闭按钮渲染
    await waitFor(() => expect(screen.getByRole('button', { name: '关闭' })).toBeInTheDocument());
    const closeBtn = screen.getByRole('button', { name: '关闭' });
    closeBtn.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    // 单按钮场景：first === last，Tab 应 preventDefault 并循环回关闭按钮
    expect(document.activeElement).toBe(closeBtn);
  });
});
