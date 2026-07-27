import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// vi.hoisted 让 mock 工厂引用的运行时可变状态在 vi.mock 提升后仍可访问。
// error/roomState 在不同用例中动态调整，setter 写入后下次渲染读取最新值。
const { storeState, setError, setStatus } = vi.hoisted(() => {
  // status 需按用例动态切换：无障碍测试用 'waiting'（压力源输入可见），
  // 开始游戏测试用 'ready'（开始按钮可见，与 room.tsx 条件渲染对齐）
  const state: { error: string | null; status: string } = { error: null, status: 'waiting' };
  return {
    storeState: state,
    setError: (e: string | null) => {
      state.error = e;
    },
    setStatus: (s: string) => {
      state.status = s;
    },
  };
});

// showConfirm mock：默认返回 true，单测可覆盖 false 验证取消分支
const confirmMock = vi.hoisted(() => ({ showConfirm: vi.fn() }));

vi.mock('@/stores/user-store', () => ({
  useUserStore: () => ({ id: '1', nickname: '小明' }),
}));

vi.mock('@/stores/room-store', () => ({
  useRoomStore: (selector: (s: {
    roomId: string;
    hostId: string;
    status: string;
    mode: string;
    players: { userId: string; nickname: string; isReady: boolean }[];
    stressSources: Record<string, string>;
    error: string | null;
    reset: () => void;
  }) => unknown) =>
    selector({
      roomId: 'ROOM1',
      hostId: '1',
      status: storeState.status,
      mode: 'boss',
      players: [{ userId: '1', nickname: '小明', isReady: false }],
      stressSources: {},
      error: storeState.error,
      reset: vi.fn(),
    }),
}));

vi.mock('@/websocket/index', () => ({
  roomActions: {
    ready: vi.fn(),
    unready: vi.fn(),
    submitStress: vi.fn(),
    setMode: vi.fn(),
    startGame: vi.fn(),
    leaveRoom: vi.fn(),
  },
}));

vi.mock('@/utils/confirm', () => ({ showConfirm: confirmMock.showConfirm }));

import { roomActions } from '@/websocket/index';
import RoomPage from '@/pages/room';

describe('RoomPage 房间页无障碍', () => {
  beforeEach(() => {
    setError(null);
    setStatus('waiting');
    confirmMock.showConfirm.mockReset();
    confirmMock.showConfirm.mockResolvedValue(true);
  });

  it('压力源输入框有 aria-label="压力来源描述"（仅有 placeholder 屏幕阅读器无法识别字段含义）', () => {
    render(<RoomPage onBack={vi.fn()} />);
    expect(screen.getByLabelText('压力来源描述')).toBeInTheDocument();
  });

  it('error 出现时渲染 role=alert 强制屏幕阅读器立即朗读', () => {
    setError('房间已解散');
    render(<RoomPage onBack={vi.fn()} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('房间已解散');
  });

  it('无 error 时不渲染 role=alert 元素，避免屏幕阅读器误读空白错误', () => {
    render(<RoomPage onBack={vi.fn()} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('RoomPage 房主开始游戏确认弹窗', () => {
  beforeEach(() => {
    confirmMock.showConfirm.mockReset();
    confirmMock.showConfirm.mockResolvedValue(true);
    // roomActions.startGame 是 vi.mock 模块级单例，跨用例共享需手动清理调用记录
    vi.mocked(roomActions.startGame).mockClear();
    // 开始游戏按钮仅在 status==='ready' 时显示（与 room.tsx 条件渲染对齐）
    setStatus('ready');
  });

  it('房主点击开始游戏弹出二次确认，确认后触发 startGame', async () => {
    render(<RoomPage onBack={vi.fn()} />);
    const startBtn = screen.getByText('开始游戏');
    fireEvent.click(startBtn);
    await waitFor(() => {
      expect(confirmMock.showConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ title: '开始游戏', confirmText: '开始' })
      );
    });
    expect(roomActions.startGame).toHaveBeenCalledWith('ROOM1');
  });

  it('用户取消确认时不触发 startGame', async () => {
    confirmMock.showConfirm.mockResolvedValue(false);
    render(<RoomPage onBack={vi.fn()} />);
    fireEvent.click(screen.getByText('开始游戏'));
    await waitFor(() => expect(confirmMock.showConfirm).toHaveBeenCalled());
    expect(roomActions.startGame).not.toHaveBeenCalled();
  });
});
