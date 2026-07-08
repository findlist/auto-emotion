import { describe, it, expect, beforeEach } from 'vitest';
import { useRoomStore, type Player } from '@/stores/room-store';

describe('room-store 房间状态管理', () => {
  beforeEach(() => {
    // zustand store 是单例，每个用例前重置状态避免相互污染
    useRoomStore.getState().reset();
  });

  it('初始状态：roomId=null, status=waiting, mode=boss, players=[], loading=false, error=null', () => {
    const s = useRoomStore.getState();
    expect(s.roomId).toBeNull();
    expect(s.hostId).toBe('');
    expect(s.status).toBe('waiting');
    expect(s.mode).toBe('boss');
    expect(s.players).toEqual([]);
    expect(s.stressSources).toEqual({});
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
  });

  it('setRoom 设置完整房间数据并同时清空 loading 与 error', () => {
    const store = useRoomStore.getState();
    store.setLoading(true);
    store.setError('上次错误');
    const players: Player[] = [
      { userId: 'u1', nickname: '玩家1', isReady: true },
      { userId: 'u2', nickname: '玩家2', isReady: false },
    ];
    store.setRoom({
      roomId: 'ROOM01',
      hostId: 'u1',
      status: 'ready',
      mode: 'brawl',
      players,
      stressSources: { u1: '加班', u2: '堵车' },
    });
    const s = useRoomStore.getState();
    expect(s.roomId).toBe('ROOM01');
    expect(s.hostId).toBe('u1');
    expect(s.status).toBe('ready');
    expect(s.mode).toBe('brawl');
    expect(s.players).toEqual(players);
    expect(s.stressSources).toEqual({ u1: '加班', u2: '堵车' });
    // setRoom 自动清空 loading 与 error，避免旧状态残留
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
  });

  it('setLoading 切换加载状态', () => {
    useRoomStore.getState().setLoading(true);
    expect(useRoomStore.getState().loading).toBe(true);
    useRoomStore.getState().setLoading(false);
    expect(useRoomStore.getState().loading).toBe(false);
  });

  it('setError 设置错误信息，传入 null 清空', () => {
    useRoomStore.getState().setError('房间不存在');
    expect(useRoomStore.getState().error).toBe('房间不存在');
    useRoomStore.getState().setError(null);
    expect(useRoomStore.getState().error).toBeNull();
  });

  it('reset 将所有字段重置为初始值', () => {
    const store = useRoomStore.getState();
    store.setRoom({
      roomId: 'ROOM99',
      hostId: 'host',
      status: 'playing',
      mode: 'speed',
      players: [{ userId: 'u1', nickname: '玩家1', isReady: true }],
      stressSources: { u1: '考试' },
    });
    store.setLoading(true);
    store.setError('测试错误');
    useRoomStore.getState().reset();
    const s = useRoomStore.getState();
    expect(s.roomId).toBeNull();
    expect(s.hostId).toBe('');
    expect(s.status).toBe('waiting');
    expect(s.mode).toBe('boss');
    expect(s.players).toEqual([]);
    expect(s.stressSources).toEqual({});
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
  });

  it('多次 setRoom 后者覆盖前者', () => {
    const store = useRoomStore.getState();
    store.setRoom({
      roomId: 'A',
      hostId: 'h1',
      status: 'waiting',
      mode: 'boss',
      players: [],
      stressSources: {},
    });
    store.setRoom({
      roomId: 'B',
      hostId: 'h2',
      status: 'playing',
      mode: 'brawl',
      players: [{ userId: 'u1', nickname: '玩家1', isReady: true }],
      stressSources: { u1: 'KPI' },
    });
    const s = useRoomStore.getState();
    expect(s.roomId).toBe('B');
    expect(s.hostId).toBe('h2');
    expect(s.status).toBe('playing');
    expect(s.mode).toBe('brawl');
    expect(s.players).toHaveLength(1);
    expect(s.stressSources).toEqual({ u1: 'KPI' });
  });
});
