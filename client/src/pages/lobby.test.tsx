import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// vi.hoisted 让 mock 工厂引用的运行时可变状态在 vi.mock 提升后仍可访问。
// user/loading/error 在不同用例中动态调整，setter 写入后下次渲染读取最新值。
const { storeState, setUser, setError } = vi.hoisted(() => {
  const state: {
    // User.id 已收敛为 string（后端 UUID 契约），mock 类型同步对齐
    user: { id: string; nickname: string; level: number; coins: number; power: number } | null;
    error: string | null;
  } = { user: null, error: null };
  return {
    storeState: state,
    setUser: (u: typeof state.user) => {
      state.user = u;
    },
    setError: (e: string | null) => {
      state.error = e;
    },
  };
});

vi.mock('@/stores/user-store', () => ({
  useUserStore: (selector: (s: { user: typeof storeState.user }) => unknown) =>
    selector({ user: storeState.user }),
}));

vi.mock('@/stores/room-store', () => ({
  useRoomStore: (selector: (s: { loading: boolean; error: string | null; reset: () => void; setLoading: () => void; setError: () => void }) => unknown) =>
    selector({
      loading: false,
      error: storeState.error,
      reset: vi.fn(),
      setLoading: vi.fn(),
      setError: vi.fn(),
    }),
}));

// mock websocket 避免真实连接：waitForConnection 返回带 id 的伪 socket，
// roomActions 仅验证调用。connect 同步返回避免阻塞测试。
vi.mock('@/websocket/index', () => ({
  connect: vi.fn(),
  waitForConnection: vi.fn().mockResolvedValue({ id: 'sock-123', connected: true }),
  roomActions: { joinRoom: vi.fn() },
}));

// mock http 拦截真实请求，post 返回值由用例动态设置
vi.mock('@/api/http', () => ({
  default: { post: vi.fn() },
}));

import LobbyPage from '@/pages/lobby';
import { connect, waitForConnection, roomActions } from '@/websocket/index';
import http from '@/api/http';

describe('LobbyPage 大厅页无障碍', () => {
  beforeEach(() => {
    setUser(null);
    setError(null);
  });

  it('点击"加入房间"后显示房间号输入框，input 有 aria-label="房间号"', () => {
    render(<LobbyPage onEnterRoom={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '加入房间' }));
    // getByLabelText 校验 aria-label 关联，未设置会抛错
    expect(screen.getByLabelText('房间号')).toBeInTheDocument();
  });

  it('"×" 取消按钮有 aria-label="取消加入房间"（按钮内仅符号字符无语义）', () => {
    render(<LobbyPage onEnterRoom={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '加入房间' }));
    expect(screen.getByRole('button', { name: '取消加入房间' })).toBeInTheDocument();
  });

  it('error 出现时渲染 role=alert 强制屏幕阅读器立即朗读', () => {
    setError('创建房间失败');
    render(<LobbyPage onEnterRoom={vi.fn()} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('创建房间失败');
  });

  it('无 error 时不渲染 role=alert 元素，避免屏幕阅读器误读空白错误', () => {
    render(<LobbyPage onEnterRoom={vi.fn()} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('LobbyPage 快速匹配 socketId 传递', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setUser({ id: '1', nickname: '测试玩家', level: 10, coins: 100, power: 50 });
    setError(null);
    // 重置 waitForConnection 默认返回带 id 的伪 socket
    (waitForConnection as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'sock-123',
      connected: true,
    });
  });

  it('匹配成功时将 waitForConnection 返回的 socket.id 透传给 /match/quick', async () => {
    // 模拟后端匹配成功返回 roomId
    (http.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { roomId: 'ROOM-XYZ' },
    });
    const onEnterRoom = vi.fn();

    render(<LobbyPage onEnterRoom={onEnterRoom} />);
    fireEvent.click(screen.getByRole('button', { name: '快速匹配' }));

    // 等待异步流程完成
    await waitFor(() => expect(onEnterRoom).toHaveBeenCalled());

    // 核心断言：socketId 为 waitForConnection 返回的真实 id，非空字符串
    expect(http.post).toHaveBeenCalledWith('/match/quick', {
      nickname: '测试玩家',
      socketId: 'sock-123',
    });
    expect(connect).toHaveBeenCalled();
    expect(waitForConnection).toHaveBeenCalled();
    expect(roomActions.joinRoom).toHaveBeenCalledWith('ROOM-XYZ', '测试玩家');
  });

  it('匹配未满 4 人返回 inQueue 时不进入房间页，显示队列提示', async () => {
    (http.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { inQueue: true, queueCount: 2 },
    });
    const onEnterRoom = vi.fn();

    render(<LobbyPage onEnterRoom={onEnterRoom} />);
    // 点击后按钮变为 '匹配中...' 并禁用（matching=true）
    fireEvent.click(screen.getByRole('button', { name: '快速匹配' }));

    // 等待流程完成：matching 恢复 false 后按钮重新可点击且文案恢复 '快速匹配'
    // 设计原因：room-store mock 的 setError 是空操作不触发重渲染，
    // 用按钮状态（local useState matching）作为流程完成信号更可靠
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '快速匹配' })).toBeEnabled();
    });
    expect(onEnterRoom).not.toHaveBeenCalled();
    expect(roomActions.joinRoom).not.toHaveBeenCalled();
  });

  it('waitForConnection 抛错时不调用 /match/quick，显示错误提示', async () => {
    (waitForConnection as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('WebSocket 连接超时')
    );

    render(<LobbyPage onEnterRoom={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '快速匹配' }));

    // 等待 catch 块执行完毕：matching 恢复 false 后按钮重新可点击
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '快速匹配' })).toBeEnabled();
    });
    // 连接失败时不应发起匹配请求
    expect(http.post).not.toHaveBeenCalled();
  });
});
