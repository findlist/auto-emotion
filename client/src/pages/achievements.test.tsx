import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// vi.hoisted 让 mock 工厂引用的运行时可变状态在 vi.mock 提升后仍可访问
// showConfirm 在领取流程测试中需可控返回 true/false，模拟用户确认/取消
const achievementApiMock = vi.hoisted(() => ({
  getAchievements: vi.fn(),
  claimReward: vi.fn(),
}));
const confirmMock = vi.hoisted(() => ({
  showConfirm: vi.fn(),
}));

vi.mock('@/api/achievements', () => ({ achievementApi: achievementApiMock }));
// mock 弹窗/Toast/错误处理工具，避免副作用与 DOM 污染
vi.mock('@/utils/confirm', () => ({ showConfirm: confirmMock.showConfirm }));
vi.mock('@/utils/toast', () => ({ showToast: vi.fn() }));
vi.mock('@/utils/api-error', () => ({ showApiError: vi.fn() }));

import AchievementsPage from '@/pages/achievements';
import type { Achievement } from '@/api/achievements';

// 三种成就状态样本：进行中（未完成）/ 已完成可领取 / 已领取
// type 1 对应"破坏"分组，便于断言分组标题渲染
const pendingAchievement: Achievement = {
  id: 1, code: 'battle_10', name: '进行中成就A', description: '描述A', type: 1,
  target: 10, progress: 3, completed: false, claimed: false,
  reward_type: 'skin', reward_id: 1,
};
const completedAchievement: Achievement = {
  id: 2, code: 'destroy_1', name: '可领取成就B', description: '描述B', type: 1,
  target: 5, progress: 5, completed: true, claimed: false,
  reward_type: 'pet', reward_id: 2,
};
const claimedAchievement: Achievement = {
  id: 3, code: 'destroy_2', name: '已领取成就C', description: '描述C', type: 1,
  target: 3, progress: 3, completed: true, claimed: true,
  reward_type: 'item', reward_id: 3,
};

describe('AchievementsPage 成就页', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认确认弹窗返回 true（用户点击确认），取消场景单独覆盖
    confirmMock.showConfirm.mockResolvedValue(true);
  });

  it('初始加载成就列表后渲染成就名与分组标题', async () => {
    achievementApiMock.getAchievements.mockResolvedValue([completedAchievement]);

    render(<AchievementsPage onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('可领取成就B')).toBeInTheDocument();
    });
    // type 1 对应"破坏"分组标题应渲染
    expect(screen.getByText('破坏')).toBeInTheDocument();
    expect(achievementApiMock.getAchievements).toHaveBeenCalledTimes(1);
  });

  it('成就为空时统计显示 0/0', async () => {
    achievementApiMock.getAchievements.mockResolvedValue([]);

    render(<AchievementsPage onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('0/0')).toBeInTheDocument();
    });
    // 已完成/已领取计数均为 0
    // 样式精修将数字用 <span> 包裹加色，getByText 无法匹配跨子元素文本，改用 body.textContent 检查
    expect(document.body.textContent).toContain('已完成 0 个');
    expect(document.body.textContent).toContain('已领取 0 个奖励');
  });

  it('已完成未领取成就显示"领取"按钮，进行中成就不显示', async () => {
    achievementApiMock.getAchievements.mockResolvedValue([pendingAchievement, completedAchievement]);

    render(<AchievementsPage onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('可领取成就B')).toBeInTheDocument();
    });
    // completed 成就渲染领取按钮
    expect(screen.getByRole('button', { name: '领取' })).toBeInTheDocument();
    // 进行中成就进度文案存在（3/10）
    expect(screen.getByText('3/10')).toBeInTheDocument();
  });

  it('已领取成就显示"✓ 已领取"标签且无领取按钮', async () => {
    achievementApiMock.getAchievements.mockResolvedValue([claimedAchievement]);

    render(<AchievementsPage onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('已领取成就C')).toBeInTheDocument();
    });
    expect(screen.getByText('✓ 已领取')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '领取' })).not.toBeInTheDocument();
  });

  it('点击领取触发确认弹窗，确认后调用 claimReward 并刷新列表', async () => {
    // 首次返回可领取，刷新后返回已领取（验证 loadAchievements 被再次调用）
    achievementApiMock.getAchievements
      .mockResolvedValueOnce([completedAchievement])
      .mockResolvedValueOnce([{ ...completedAchievement, claimed: true }]);
    achievementApiMock.claimReward.mockResolvedValue({
      success: true, reward_type: 'pet', reward_id: 2,
    });

    render(<AchievementsPage onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '领取' })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '领取' }));
    });

    // 确认弹窗被调用，message 含成就名
    expect(confirmMock.showConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '领取奖励',
        message: expect.stringContaining('可领取成就B'),
      }),
    );
    // 确认后调用 claimReward 传入成就 id
    await waitFor(() => {
      expect(achievementApiMock.claimReward).toHaveBeenCalledWith(completedAchievement.id);
    });
    // 刷新列表（getAchievements 被调用两次：初始加载 + 领取后刷新）
    await waitFor(() => {
      expect(achievementApiMock.getAchievements).toHaveBeenCalledTimes(2);
    });
  });

  it('确认弹窗取消时不调用 claimReward', async () => {
    achievementApiMock.getAchievements.mockResolvedValue([completedAchievement]);
    confirmMock.showConfirm.mockResolvedValue(false);

    render(<AchievementsPage onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '领取' })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '领取' }));
    });

    expect(confirmMock.showConfirm).toHaveBeenCalledTimes(1);
    expect(achievementApiMock.claimReward).not.toHaveBeenCalled();
    // 取消不触发刷新，getAchievements 仅初始加载一次
    expect(achievementApiMock.getAchievements).toHaveBeenCalledTimes(1);
  });
});
