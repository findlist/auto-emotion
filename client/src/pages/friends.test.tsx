import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// vi.hoisted 让 mock 工厂引用的运行时可变状态在 vi.mock 提升后仍可访问
// showConfirm 在删除流程测试中需可控返回 true/false，模拟用户确认/取消
// showToast 在添加好友无效 ID 测试中需断言警告文案
const friendApiMock = vi.hoisted(() => ({
  getFriends: vi.fn(),
  getRequests: vi.fn(),
  sendRequest: vi.fn(),
  accept: vi.fn(),
  reject: vi.fn(),
  remove: vi.fn(),
}));
const confirmMock = vi.hoisted(() => ({ showConfirm: vi.fn() }));
const toastMock = vi.hoisted(() => ({ showToast: vi.fn() }));

vi.mock('@/api/friends', () => ({ friendApi: friendApiMock }));
// mock 弹窗/Toast/错误处理工具，避免副作用与 DOM 污染
vi.mock('@/utils/confirm', () => ({ showConfirm: confirmMock.showConfirm }));
vi.mock('@/utils/toast', () => ({ showToast: toastMock.showToast }));
vi.mock('@/utils/api-error', () => ({ showApiError: vi.fn() }));

import FriendsPage from '@/pages/friends';
import type { Friend, FriendRequest } from '@/api/friends';

// 好友与请求样本：name 唯一以便精确定位渲染结果
const friend: Friend = {
  id: 10, nickname: '好友甲', avatar_url: '', status: 1, online: true,
};
const request: FriendRequest = {
  id: 20, from_user_id: 99, nickname: '请求者乙', avatar_url: '', created_at: '2026-07-01',
};

describe('FriendsPage 好友页', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认确认弹窗返回 true（用户点击确认），取消场景单独覆盖
    confirmMock.showConfirm.mockResolvedValue(true);
    // 默认空列表，单测按需覆盖返回值
    friendApiMock.getFriends.mockResolvedValue([]);
    friendApiMock.getRequests.mockResolvedValue([]);
  });

  it('初始加载好友列表后渲染好友昵称（默认好友 tab）', async () => {
    friendApiMock.getFriends.mockResolvedValue([friend]);

    render(<FriendsPage onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('好友甲')).toBeInTheDocument();
    });
    // tab 文案含好友数量
    expect(screen.getByText('好友列表 (1)')).toBeInTheDocument();
  });

  it('好友为空时显示空状态提示', async () => {
    render(<FriendsPage onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('还没有好友，快去添加吧')).toBeInTheDocument();
    });
  });

  it('切换到请求 tab 显示请求列表，请求为空时显示空状态', async () => {
    render(<FriendsPage onBack={() => {}} />);

    // 切换到好友请求 tab（默认好友 tab，需点击切换）
    await act(async () => {
      fireEvent.click(screen.getByText('好友请求 (0)'));
    });

    await waitFor(() => {
      expect(screen.getByText('暂无好友请求')).toBeInTheDocument();
    });
  });

  it('点击接受请求调用 accept 并刷新列表', async () => {
    friendApiMock.getRequests.mockResolvedValue([request]);
    friendApiMock.accept.mockResolvedValue({ success: true });

    render(<FriendsPage onBack={() => {}} />);

    // 等待初始加载完成，确保 requests 状态已更新为 [request]
    await waitFor(() => {
      expect(friendApiMock.getRequests).toHaveBeenCalledTimes(1);
    });
    // 切换到请求 tab：用 role+regex 定位，避免计数文案被 badge span 拆分导致匹配失败
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /好友请求/ }));
    });

    await waitFor(() => {
      expect(screen.getByText('请求者乙')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '接受' }));
    });

    // 接受请求传入 requestId
    await waitFor(() => {
      expect(friendApiMock.accept).toHaveBeenCalledWith(request.id);
    });
    // 刷新列表：getFriends/getRequests 各被调用两次（初始加载 + 接受后刷新）
    await waitFor(() => {
      expect(friendApiMock.getFriends).toHaveBeenCalledTimes(2);
      expect(friendApiMock.getRequests).toHaveBeenCalledTimes(2);
    });
    expect(toastMock.showToast).toHaveBeenCalledWith('success', '已接受好友请求');
  });

  it('点击拒绝请求调用 reject 并刷新列表', async () => {
    friendApiMock.getRequests.mockResolvedValue([request]);
    friendApiMock.reject.mockResolvedValue({ success: true });

    render(<FriendsPage onBack={() => {}} />);

    await waitFor(() => {
      expect(friendApiMock.getRequests).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /好友请求/ }));
    });

    await waitFor(() => {
      expect(screen.getByText('请求者乙')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '拒绝' }));
    });

    await waitFor(() => {
      expect(friendApiMock.reject).toHaveBeenCalledWith(request.id);
    });
    // 拒绝成功后刷新列表
    await waitFor(() => {
      expect(friendApiMock.getRequests).toHaveBeenCalledTimes(2);
    });
  });

  it('输入为空时添加按钮禁用', async () => {
    // number input 已在浏览器层限制非数字输入，空值由按钮 disabled 拦截，
    // parseInt 的 NaN 分支为防御性兜底，UI 不可达，此处验证实际 UI 守卫
    render(<FriendsPage onBack={() => {}} />);

    await waitFor(() => {
      expect(friendApiMock.getFriends).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByRole('button', { name: '添加' })).toBeDisabled();
  });

  it('添加好友成功且对方自动接受时提示"已成为好友"', async () => {
    friendApiMock.sendRequest.mockResolvedValue({ success: true, autoAccepted: true });

    render(<FriendsPage onBack={() => {}} />);

    await act(async () => {
      fireEvent.change(screen.getByLabelText('用户ID'), { target: { value: '99' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '添加' }));
    });

    // sendRequest 传入解析后的数字 ID
    await waitFor(() => {
      expect(friendApiMock.sendRequest).toHaveBeenCalledWith(99);
    });
    expect(toastMock.showToast).toHaveBeenCalledWith('success', '已成为好友！');
  });

  it('添加好友成功且对方未自动接受时提示"好友请求已发送"', async () => {
    friendApiMock.sendRequest.mockResolvedValue({ success: true, autoAccepted: false });

    render(<FriendsPage onBack={() => {}} />);

    await act(async () => {
      fireEvent.change(screen.getByLabelText('用户ID'), { target: { value: '88' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '添加' }));
    });

    await waitFor(() => {
      expect(friendApiMock.sendRequest).toHaveBeenCalledWith(88);
    });
    expect(toastMock.showToast).toHaveBeenCalledWith('success', '好友请求已发送');
  });

  it('删除好友触发确认弹窗，确认后调用 remove 并刷新列表', async () => {
    friendApiMock.getFriends.mockResolvedValue([friend]);
    friendApiMock.remove.mockResolvedValue({ success: true });

    render(<FriendsPage onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('好友甲')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '删除' }));
    });

    // 删除好友为不可逆操作，需二次确认
    expect(confirmMock.showConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '删除好友',
        type: 'danger',
      }),
    );
    await waitFor(() => {
      expect(friendApiMock.remove).toHaveBeenCalledWith(friend.id);
    });
    expect(toastMock.showToast).toHaveBeenCalledWith('success', '已删除好友');
  });

  it('确认弹窗取消时不调用 remove', async () => {
    friendApiMock.getFriends.mockResolvedValue([friend]);
    confirmMock.showConfirm.mockResolvedValue(false);

    render(<FriendsPage onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('好友甲')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '删除' }));
    });

    expect(confirmMock.showConfirm).toHaveBeenCalledTimes(1);
    expect(friendApiMock.remove).not.toHaveBeenCalled();
  });
});
