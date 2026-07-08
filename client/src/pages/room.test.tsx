import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// vi.hoisted 让 mock 工厂引用的运行时可变状态在 vi.mock 提升后仍可访问。
// error/roomState 在不同用例中动态调整，setter 写入后下次渲染读取最新值。
const { storeState, setError } = vi.hoisted(() => {
  const state: { error: string | null } = { error: null };
  return {
    storeState: state,
    setError: (e: string | null) => {
      state.error = e;
    },
  };
});

vi.mock('@/stores/user-store', () => ({
  useUserStore: () => ({ id: 1, nickname: '小明' }),
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
      status: 'waiting',
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

import RoomPage from '@/pages/room';

describe('RoomPage 房间页无障碍', () => {
  beforeEach(() => {
    setError(null);
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
