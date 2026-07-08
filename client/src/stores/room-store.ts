// client/src/stores/room-store.ts
// 房间状态管理（Zustand）

import { create } from 'zustand';
import type { GameMode } from '@/types/game';

export interface Player {
  userId: string;
  nickname: string;
  isReady: boolean;
}

export type RoomStatus = 'waiting' | 'ready' | 'generating' | 'playing' | 'settling' | 'closed';

interface RoomState {
  roomId: string | null;
  hostId: string;
  status: RoomStatus;
  // 设计原因:原 mode: string 是技术债,实际仅允许 'boss'|'brawl'|'speed'。
  // 收敛为 GameMode 后,App.tsx 传给 BattlePage 的 mode prop 无需 as any 断言,
  // 且 setRoom 调用方传入非法值时编译期即可拦截。
  mode: GameMode;
  players: Player[];
  stressSources: Record<string, string>;
  loading: boolean;
  error: string | null;
  /** 重置房间状态 */
  reset: () => void;
  /** 设置房间数据 */
  setRoom: (data: {
    roomId: string;
    hostId: string;
    status: RoomStatus;
    mode: GameMode;
    players: Player[];
    stressSources: Record<string, string>;
  }) => void;
  /** 设置加载状态 */
  setLoading: (loading: boolean) => void;
  /** 设置错误信息 */
  setError: (error: string | null) => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  roomId: null,
  hostId: '',
  status: 'waiting',
  mode: 'boss',
  players: [],
  stressSources: {},
  loading: false,
  error: null,

  reset: () =>
    set({
      roomId: null,
      hostId: '',
      status: 'waiting',
      mode: 'boss',
      players: [],
      stressSources: {},
      loading: false,
      error: null,
    }),

  setRoom: (data) =>
    set({
      roomId: data.roomId,
      hostId: data.hostId,
      status: data.status,
      mode: data.mode,
      players: data.players,
      stressSources: data.stressSources,
      loading: false,
      error: null,
    }),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error }),
}));
