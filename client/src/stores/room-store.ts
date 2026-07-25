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

/**
 * 房间初始状态契约
 * 设计原因：create 初始化与 reset 重置原本各持一份字面量，新增字段需同步修改两处，
 * 易遗漏导致 reset 后状态与初始状态漂移。抽取为单一源后，初始状态变更单点维护。
 * Pick 类型注解保证 status: 'waiting' 不被推断为 string，保留字面量类型守卫。
 */
const INITIAL_ROOM_STATE: Pick<RoomState, 'roomId' | 'hostId' | 'status' | 'mode' | 'players' | 'stressSources' | 'loading' | 'error'> = {
  roomId: null,
  hostId: '',
  status: 'waiting',
  mode: 'boss',
  players: [],
  stressSources: {},
  loading: false,
  error: null,
};

export const useRoomStore = create<RoomState>((set) => ({
  ...INITIAL_ROOM_STATE,

  reset: () => set(INITIAL_ROOM_STATE),

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
