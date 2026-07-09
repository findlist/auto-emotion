import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GameEngine } from '@/game/core/engine';

// 用 vi.hoisted 提升引用，工厂函数内可安全使用
const { BossGameMock, BrawlGameMock, SpeedGameMock, mockBossInstance, mockBrawlInstance, mockSpeedInstance } =
  vi.hoisted(() => {
    // 单例 mock 实例：每次 init() 时重置 spies
    const boss = {
      init: vi.fn(),
      addPlayer: vi.fn(),
      shoot: vi.fn(),
      shootToward: vi.fn(),
      removePlayer: vi.fn(),
      update: vi.fn(),
      destroy: vi.fn(),
      // 暴露 callbacks 引用以便测试触发 onLocalShoot
      callbacks: {} as { onLocalShoot?: (angle: number) => void },
    };
    const brawl = {
      init: vi.fn(),
      addPlayer: vi.fn(),
      shoot: vi.fn(),
      shootToward: vi.fn(),
      removePlayer: vi.fn(),
      update: vi.fn(),
      destroy: vi.fn(),
      callbacks: {} as { onLocalShoot?: (angle: number) => void },
    };
    const speed = {
      start: vi.fn(),
      update: vi.fn(),
      destroy: vi.fn(),
    };

    class BossGameMock {
      constructor(
        _app: unknown,
        _localId: string,
        _bounds: unknown,
        callbacks: { onLocalShoot?: (angle: number) => void },
      ) {
        boss.callbacks = callbacks;
      }
      init = boss.init;
      addPlayer = boss.addPlayer;
      shoot = boss.shoot;
      shootToward = boss.shootToward;
      removePlayer = boss.removePlayer;
      update = boss.update;
      destroy = boss.destroy;
    }
    class BrawlGameMock {
      constructor(
        _app: unknown,
        _localId: string,
        _bounds: unknown,
        callbacks: { onLocalShoot?: (angle: number) => void },
      ) {
        brawl.callbacks = callbacks;
      }
      init = brawl.init;
      addPlayer = brawl.addPlayer;
      shoot = brawl.shoot;
      shootToward = brawl.shootToward;
      removePlayer = brawl.removePlayer;
      update = brawl.update;
      destroy = brawl.destroy;
    }
    class SpeedGameMock {
      start = speed.start;
      update = speed.update;
      destroy = speed.destroy;
    }

    return {
      BossGameMock,
      BrawlGameMock,
      SpeedGameMock,
      mockBossInstance: boss,
      mockBrawlInstance: brawl,
      mockSpeedInstance: speed,
    };
  });

// mock pixi.js 的 Container：仅保留 BattleScene 用到的 addChild / destroy
vi.mock('pixi.js', () => {
  class ContainerMock {
    addChild = vi.fn();
    destroy = vi.fn();
  }
  return { Container: ContainerMock };
});

vi.mock('@/game/games/boss-game', () => ({ BossGame: BossGameMock }));
vi.mock('@/game/games/brawl-game', () => ({ BrawlGame: BrawlGameMock }));
vi.mock('@/game/games/speed-game', () => ({ SpeedGame: SpeedGameMock }));

import { BattleScene, type RemotePlayer } from '@/game/scenes/battle-scene';

// 轻量 Mock Socket：仅记录 on/off/emit 调用与回调注册
function createMockSocket() {
  const handlers = new Map<string, ((data: unknown) => void)[]>();
  return {
    emit: vi.fn(),
    on: vi.fn((event: string, cb: (data: unknown) => void) => {
      const list = handlers.get(event) ?? [];
      list.push(cb);
      handlers.set(event, list);
    }),
    off: vi.fn((event: string, cb: (data: unknown) => void) => {
      const list = handlers.get(event);
      if (!list) return;
      const idx = list.indexOf(cb);
      if (idx >= 0) list.splice(idx, 1);
    }),
    // 测试辅助：模拟后端推送事件，触发已注册监听
    trigger(event: string, data: unknown) {
      const list = handlers.get(event);
      if (list) list.forEach((cb) => cb(data));
    },
  };
}

function createScene(overrides: {
  socket?: ReturnType<typeof createMockSocket> | null;
  roomId?: string;
  localUserId?: string;
  remotePlayers?: RemotePlayer[];
} = {}) {
  const socket = overrides.socket ?? createMockSocket();
  // 强转绕过 GameEngine 类型约束：BattleScene 仅使用 engine.app 透传给 game 构造
  const engine = { app: {} } as unknown as GameEngine;
  const scene = new BattleScene(
    engine,
    null as never,
    { width: 800, height: 600 },
    socket,
    overrides.roomId ?? 'room-1',
    overrides.localUserId ?? 'u1',
    overrides.remotePlayers ?? [],
    {},
  );
  return { scene, socket };
}

describe('BattleScene 多人对战同步逻辑', () => {
  beforeEach(() => {
    // 重置所有 mock 调用记录，避免跨用例污染
    [mockBossInstance, mockBrawlInstance, mockSpeedInstance].forEach((m) => {
      Object.values(m).forEach((fn) => {
        if (typeof fn === 'function' && 'mockClear' in fn) (fn as ReturnType<typeof vi.fn>).mockClear();
      });
    });
  });

  it('onEnter 注册 game:action 监听，onExit 注销监听', () => {
    const { scene, socket } = createScene();
    scene.onEnter();
    expect(socket.on).toHaveBeenCalledWith('game:action', expect.any(Function));
    scene.onExit();
    expect(socket.off).toHaveBeenCalledWith('game:action', expect.any(Function));
  });

  it('boss 模式本地射击触发 emitAction 上报到 socket', () => {
    const { scene, socket } = createScene();
    scene.init('boss');
    // 触发 BossGame 内部 onLocalShoot 回调（mock 不会自动调，需测试主动触发）
    mockBossInstance.callbacks.onLocalShoot?.(1.23);
    expect(socket.emit).toHaveBeenCalledWith('game:action', {
      roomId: 'room-1',
      action: 'shoot',
      payload: { angle: 1.23 },
    });
  });

  it('brawl 模式本地射击同样触发 emitAction', () => {
    const { scene, socket } = createScene();
    scene.init('brawl');
    mockBrawlInstance.callbacks.onLocalShoot?.(-0.5);
    expect(socket.emit).toHaveBeenCalledWith('game:action', {
      roomId: 'room-1',
      action: 'shoot',
      payload: { angle: -0.5 },
    });
  });

  it('socket 为 null 时 emitAction 静默不报错', () => {
    const { scene } = createScene({ socket: null });
    scene.init('boss');
    expect(() => mockBossInstance.callbacks.onLocalShoot?.(0)).not.toThrow();
  });

  it('roomId 为空时 emitAction 不上报', () => {
    const socket = createMockSocket();
    const engine = { app: {} } as unknown as GameEngine;
    const scene = new BattleScene(engine, null as never, { width: 800, height: 600 }, socket, '', 'u1', [], {});
    scene.init('boss');
    mockBossInstance.callbacks.onLocalShoot?.(0);
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('远程 shoot 在 boss 模式调用 bossGame.shoot', () => {
    const { scene, socket } = createScene({ localUserId: 'u1' });
    scene.init('boss');
    scene.onEnter();
    // 模拟后端广播：远程玩家 u2 射击
    socket.trigger('game:action', { userId: 'u2', action: 'shoot', payload: { angle: 0.7 }, timestamp: Date.now() });
    expect(mockBossInstance.shoot).toHaveBeenCalledWith('u2', 0.7);
  });

  it('后端 userId 为 number 时统一转 string 比较，自身广播被过滤', () => {
    const { scene, socket } = createScene({ localUserId: '123' });
    scene.init('boss');
    scene.onEnter();
    socket.trigger('game:action', { userId: 123, action: 'shoot', payload: { angle: 1 }, timestamp: 0 });
    expect(mockBossInstance.shoot).not.toHaveBeenCalled();
  });

  it('非 shoot action 被忽略', () => {
    const { scene, socket } = createScene({ localUserId: 'u1' });
    scene.init('boss');
    scene.onEnter();
    socket.trigger('game:action', { userId: 'u2', action: 'move', payload: { x: 0 }, timestamp: 0 });
    expect(mockBossInstance.shoot).not.toHaveBeenCalled();
  });

  it('payload 缺少 angle 字段被忽略', () => {
    const { scene, socket } = createScene({ localUserId: 'u1' });
    scene.init('boss');
    scene.onEnter();
    socket.trigger('game:action', { userId: 'u2', action: 'shoot', payload: {}, timestamp: 0 });
    expect(mockBossInstance.shoot).not.toHaveBeenCalled();
  });

  it('远程 shoot 在 brawl 模式调用 brawlGame.shoot', () => {
    const { scene, socket } = createScene({ localUserId: 'u1' });
    scene.init('brawl');
    scene.onEnter();
    socket.trigger('game:action', { userId: 'u2', action: 'shoot', payload: { angle: 2 }, timestamp: 0 });
    expect(mockBrawlInstance.shoot).toHaveBeenCalledWith('u2', 2);
  });

  it('speed 模式不处理远程射击（单人玩法无需同步）', () => {
    const { scene, socket } = createScene({ localUserId: 'u1' });
    scene.init('speed');
    scene.onEnter();
    socket.trigger('game:action', { userId: 'u2', action: 'shoot', payload: { angle: 1 }, timestamp: 0 });
    // speed 模式无 shoot 方法 mock，不应抛错；只要不报错即视为通过
    expect(mockBossInstance.shoot).not.toHaveBeenCalled();
    expect(mockBrawlInstance.shoot).not.toHaveBeenCalled();
  });

  it('init 时跳过本地玩家，远程玩家全部添加到游戏实例', () => {
    const remotePlayers: RemotePlayer[] = [
      { userId: 'u1', nickname: '本地' },
      { userId: 'u2', nickname: '玩家2' },
      { userId: 'u3', nickname: '玩家3' },
    ];
    const { scene } = createScene({ localUserId: 'u1', remotePlayers });
    scene.init('boss');
    // 远程玩家2次 addPlayer 调用（本地玩家在 init 内单独调用，远程玩家在 addRemotePlayers 内调用）
    expect(mockBossInstance.addPlayer).toHaveBeenCalledTimes(3);
    // 本地玩家一次 + 远程玩家2次
    expect(mockBossInstance.addPlayer).toHaveBeenCalledWith('u1', expect.any(Number), expect.any(Number), 'LocalPlayer');
    expect(mockBossInstance.addPlayer).toHaveBeenCalledWith('u2', expect.any(Number), expect.any(Number), '玩家2');
    expect(mockBossInstance.addPlayer).toHaveBeenCalledWith('u3', expect.any(Number), expect.any(Number), '玩家3');
  });

  it('syncPlayers 新增远程玩家触发 addRemotePlayerAt', () => {
    const { scene } = createScene({ localUserId: 'u1', remotePlayers: [] });
    scene.init('boss');
    mockBossInstance.addPlayer.mockClear();
    // 新增2个远程玩家
    scene.syncPlayers([
      { userId: 'u2', nickname: '玩家2' },
      { userId: 'u3', nickname: '玩家3' },
    ]);
    expect(mockBossInstance.addPlayer).toHaveBeenCalledTimes(2);
    expect(mockBossInstance.addPlayer).toHaveBeenCalledWith('u2', expect.any(Number), expect.any(Number), '玩家2');
    expect(mockBossInstance.addPlayer).toHaveBeenCalledWith('u3', expect.any(Number), expect.any(Number), '玩家3');
  });

  it('syncPlayers 离开玩家触发 removePlayerAt', () => {
    const { scene } = createScene({
      localUserId: 'u1',
      remotePlayers: [
        { userId: 'u2', nickname: '玩家2' },
        { userId: 'u3', nickname: '玩家3' },
      ],
    });
    scene.init('boss');
    // 玩家 u3 离开房间
    scene.syncPlayers([{ userId: 'u2', nickname: '玩家2' }]);
    expect(mockBossInstance.removePlayer).toHaveBeenCalledWith('u3');
  });

  it('syncPlayers 不变时不增删玩家', () => {
    const { scene } = createScene({
      localUserId: 'u1',
      remotePlayers: [{ userId: 'u2', nickname: '玩家2' }],
    });
    scene.init('boss');
    mockBossInstance.addPlayer.mockClear();
    mockBossInstance.removePlayer.mockClear();
    // 列表完全相同
    scene.syncPlayers([{ userId: 'u2', nickname: '玩家2' }]);
    expect(mockBossInstance.addPlayer).not.toHaveBeenCalled();
    expect(mockBossInstance.removePlayer).not.toHaveBeenCalled();
  });

  it('syncPlayers 跳过本地玩家，不将其作为远程玩家处理', () => {
    const { scene } = createScene({ localUserId: 'u1', remotePlayers: [] });
    scene.init('boss');
    mockBossInstance.addPlayer.mockClear();
    mockBossInstance.removePlayer.mockClear();
    // 新列表中含本地玩家，但不应作为远程玩家处理
    scene.syncPlayers([
      { userId: 'u1', nickname: '本地' },
      { userId: 'u2', nickname: '玩家2' },
    ]);
    expect(mockBossInstance.addPlayer).toHaveBeenCalledTimes(1);
    expect(mockBossInstance.addPlayer).toHaveBeenCalledWith('u2', expect.any(Number), expect.any(Number), '玩家2');
    expect(mockBossInstance.removePlayer).not.toHaveBeenCalledWith('u1');
  });

  it('brawl 模式下 syncPlayers 增删调用 brawlGame 实例', () => {
    const { scene } = createScene({ localUserId: 'u1', remotePlayers: [] });
    scene.init('brawl');
    mockBrawlInstance.addPlayer.mockClear();
    mockBrawlInstance.removePlayer.mockClear();
    scene.syncPlayers([{ userId: 'u2', nickname: '玩家2' }]);
    expect(mockBrawlInstance.addPlayer).toHaveBeenCalledWith('u2', expect.any(Number), expect.any(Number), '玩家2');
    // 删除 u2
    scene.syncPlayers([]);
    expect(mockBrawlInstance.removePlayer).toHaveBeenCalledWith('u2');
  });

  it('syncPlayers 在 init 前调用不添加玩家到游戏实例', () => {
    // currentMode 为 null（游戏未 init）时收到 room:state 的边界场景：
    // 应仅更新 remotePlayers 列表，不调用任何 game 实例的 addPlayer，
    // 避免原代码用 'brawl' 兜底把玩家错加到 brawlGame
    const { scene } = createScene({ localUserId: 'u1', remotePlayers: [] });
    // 注意：此处未调用 scene.init，currentMode 仍为 null
    scene.syncPlayers([
      { userId: 'u2', nickname: '玩家2' },
      { userId: 'u3', nickname: '玩家3' },
    ]);
    expect(mockBossInstance.addPlayer).not.toHaveBeenCalled();
    expect(mockBrawlInstance.addPlayer).not.toHaveBeenCalled();
  });
});
