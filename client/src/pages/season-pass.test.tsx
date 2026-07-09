import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// vi.hoisted 让 mock 工厂引用的运行时可变状态在 vi.mock 提升后仍可访问
// showConfirm 在购买/领取流程测试中需可控返回 true/false，模拟用户确认/取消
const seasonPassApiMock = vi.hoisted(() => ({
  get: vi.fn(),
  buy: vi.fn(),
  claim: vi.fn(),
}));
const confirmMock = vi.hoisted(() => ({ showConfirm: vi.fn() }));

vi.mock('@/api/season-pass', () => ({ seasonPassApi: seasonPassApiMock }));
// mock 弹窗/Toast/错误处理工具，避免副作用与 DOM 污染
vi.mock('@/utils/confirm', () => ({ showConfirm: confirmMock.showConfirm }));
vi.mock('@/utils/toast', () => ({ showToast: vi.fn() }));
vi.mock('@/utils/api-error', () => ({ showApiError: vi.fn() }));

import SeasonPassPage from '@/pages/season-pass';
import type { SeasonPass } from '@/api/season-pass';

// 基础赛季通行证样本：level 5 已解锁 level 1 奖励，未购买高级通行证
// 仅含 1 个奖励避免多个"领取"按钮导致 getByRole 定位歧义
const baseSeasonPass: SeasonPass = {
  seasonId: 1, seasonName: '测试赛季', seasonStartedAt: '2026-07-01', seasonEndsAt: '2026-07-31',
  level: 5, exp: 100, isPremium: false,
  rewards: [{
    level: 1, exp_required: 0,
    free_reward_type: 'gold', free_reward_id: 1, free_reward_type_amount: 100,
    premium_reward_type: 'skin', premium_reward_id: 2,
    freeClaimed: false, premiumClaimed: false,
  }],
};

describe('SeasonPassPage 赛季通行证页', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认确认弹窗返回 true（用户点击确认），取消场景单独覆盖
    confirmMock.showConfirm.mockResolvedValue(true);
  });

  it('初始加载赛季通行证后渲染赛季名', async () => {
    seasonPassApiMock.get.mockResolvedValue(baseSeasonPass);

    render(<SeasonPassPage onBack={() => {}} />);

    // seasonPass 初始为 null 时显示"加载中..."，加载完成后渲染赛季名
    expect(screen.getByText('加载中...')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('测试赛季')).toBeInTheDocument();
    });
    expect(seasonPassApiMock.get).toHaveBeenCalledTimes(1);
  });

  it('未购买高级通行证时显示"购买高级通行证"按钮', async () => {
    seasonPassApiMock.get.mockResolvedValue(baseSeasonPass);

    render(<SeasonPassPage onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '购买高级通行证' })).toBeInTheDocument();
    });
  });

  it('已购买高级通行证时显示"高级通行证"标识且无购买按钮', async () => {
    seasonPassApiMock.get.mockResolvedValue({ ...baseSeasonPass, isPremium: true });

    render(<SeasonPassPage onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('高级通行证')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: '购买高级通行证' })).not.toBeInTheDocument();
  });

  it('点击购买触发确认弹窗，确认后调用 buy 并刷新列表', async () => {
    // 首次返回未购买，刷新后返回已购买（验证 loadSeasonPass 被再次调用）
    seasonPassApiMock.get
      .mockResolvedValueOnce(baseSeasonPass)
      .mockResolvedValueOnce({ ...baseSeasonPass, isPremium: true });
    seasonPassApiMock.buy.mockResolvedValue({ success: true });

    render(<SeasonPassPage onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '购买高级通行证' })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '购买高级通行证' }));
    });

    // 购买高级通行证为关键付费操作，需二次确认
    expect(confirmMock.showConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '购买高级通行证',
        type: 'warning',
      }),
    );
    await waitFor(() => {
      expect(seasonPassApiMock.buy).toHaveBeenCalledTimes(1);
    });
    // 刷新列表（get 被调用两次：初始加载 + 购买后刷新）
    await waitFor(() => {
      expect(seasonPassApiMock.get).toHaveBeenCalledTimes(2);
    });
  });

  it('购买确认弹窗取消时不调用 buy', async () => {
    seasonPassApiMock.get.mockResolvedValue(baseSeasonPass);
    confirmMock.showConfirm.mockResolvedValue(false);

    render(<SeasonPassPage onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '购买高级通行证' })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '购买高级通行证' }));
    });

    expect(confirmMock.showConfirm).toHaveBeenCalledTimes(1);
    expect(seasonPassApiMock.buy).not.toHaveBeenCalled();
    // 取消不触发刷新，get 仅初始加载一次
    expect(seasonPassApiMock.get).toHaveBeenCalledTimes(1);
  });

  it('已解锁未领取的免费奖励显示"领取"按钮，点击确认后调用 claim', async () => {
    // 首次返回可领取，刷新后返回已领取（验证 loadSeasonPass 被再次调用）
    seasonPassApiMock.get
      .mockResolvedValueOnce(baseSeasonPass)
      .mockResolvedValueOnce({
        ...baseSeasonPass,
        rewards: [{ ...baseSeasonPass.rewards[0], freeClaimed: true }],
      });
    seasonPassApiMock.claim.mockResolvedValue({ success: true });

    render(<SeasonPassPage onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '领取' })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '领取' }));
    });

    // 领取奖励为关键操作，message 含等级与"免费"标识
    expect(confirmMock.showConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '领取奖励',
        message: expect.stringContaining('第 1 阶免费奖励'),
      }),
    );
    // 免费奖励领取：claim(level=1, isPremium=false)
    await waitFor(() => {
      expect(seasonPassApiMock.claim).toHaveBeenCalledWith(1, false);
    });
    // 刷新列表
    await waitFor(() => {
      expect(seasonPassApiMock.get).toHaveBeenCalledTimes(2);
    });
  });
});
