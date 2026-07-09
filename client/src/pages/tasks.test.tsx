import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// vi.hoisted 让 mock 工厂引用的运行时可变状态在 vi.mock 提升后仍可访问
// showConfirm 在领取流程测试中需可控返回 true/false，模拟用户确认/取消
const taskApiMock = vi.hoisted(() => ({
  getDailyTasks: vi.fn(),
  claimReward: vi.fn(),
}));
const confirmMock = vi.hoisted(() => ({
  showConfirm: vi.fn(),
}));

vi.mock('@/api/tasks', () => ({ taskApi: taskApiMock }));
// mock 弹窗/Toast/错误处理工具，避免副作用与 DOM 污染
vi.mock('@/utils/confirm', () => ({ showConfirm: confirmMock.showConfirm }));
vi.mock('@/utils/toast', () => ({ showToast: vi.fn() }));
vi.mock('@/utils/api-error', () => ({ showApiError: vi.fn() }));

import TasksPage from '@/pages/tasks';
import type { DailyTask } from '@/api/tasks';

// 三种任务状态样本：pending（进行中）/ completed（可领取）/ claimed（已领取）
const pendingTask: DailyTask = {
  id: 1, code: 'battle_1', name: '对战任务A', type: 0,
  target: 10, progress: 3, claimed: false, reward_exp: 50, reward_gold: 20,
};
const completedTask: DailyTask = {
  id: 2, code: 'idle_1', name: '挂机任务B', type: 1,
  target: 5, progress: 5, claimed: false, reward_exp: 100, reward_gold: 50,
};
const claimedTask: DailyTask = {
  id: 3, code: 'social_1', name: '社交任务C', type: 2,
  target: 3, progress: 3, claimed: true, reward_exp: 30, reward_gold: 10,
};

describe('TasksPage 每日任务页', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认确认弹窗返回 true（用户点击确认），取消场景单独覆盖
    confirmMock.showConfirm.mockResolvedValue(true);
  });

  it('初始加载任务列表后渲染任务名', async () => {
    taskApiMock.getDailyTasks.mockResolvedValue([pendingTask]);

    render(<TasksPage onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('对战任务A')).toBeInTheDocument();
    });
    expect(taskApiMock.getDailyTasks).toHaveBeenCalledTimes(1);
  });

  it('任务为空时显示空状态提示', async () => {
    taskApiMock.getDailyTasks.mockResolvedValue([]);

    render(<TasksPage onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('暂无任务')).toBeInTheDocument();
    });
  });

  it('已完成未领取任务显示"领取"按钮，进行中任务不显示', async () => {
    taskApiMock.getDailyTasks.mockResolvedValue([pendingTask, completedTask]);

    render(<TasksPage onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('对战任务A')).toBeInTheDocument();
    });
    // completed 任务应渲染领取按钮
    expect(screen.getByRole('button', { name: '领取' })).toBeInTheDocument();
    // pending 任务状态标签为"进行中"
    expect(screen.getByText('进行中')).toBeInTheDocument();
    expect(screen.getByText('可领取')).toBeInTheDocument();
  });

  it('点击领取触发确认弹窗，确认后调用 claimReward 并刷新列表', async () => {
    taskApiMock.getDailyTasks
      .mockResolvedValueOnce([completedTask])
      .mockResolvedValueOnce([{ ...completedTask, claimed: true }]);
    taskApiMock.claimReward.mockResolvedValue({
      success: true, reward_exp: 100, reward_gold: 50,
    });

    render(<TasksPage onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '领取' })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '领取' }));
    });

    // 确认弹窗被调用，message 含任务名与奖励
    expect(confirmMock.showConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '领取奖励',
        message: expect.stringContaining('挂机任务B'),
      }),
    );
    // 确认后调用 claimReward
    await waitFor(() => {
      expect(taskApiMock.claimReward).toHaveBeenCalledWith(completedTask.id);
    });
  });

  it('确认弹窗取消时不调用 claimReward', async () => {
    taskApiMock.getDailyTasks.mockResolvedValue([completedTask]);
    confirmMock.showConfirm.mockResolvedValue(false);

    render(<TasksPage onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '领取' })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '领取' }));
    });

    expect(confirmMock.showConfirm).toHaveBeenCalledTimes(1);
    expect(taskApiMock.claimReward).not.toHaveBeenCalled();
  });

  it('已领取任务显示"✓ 已领取"标签且无领取按钮', async () => {
    taskApiMock.getDailyTasks.mockResolvedValue([claimedTask]);

    render(<TasksPage onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('社交任务C')).toBeInTheDocument();
    });
    expect(screen.getByText('✓ 已领取')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '领取' })).not.toBeInTheDocument();
  });
});
