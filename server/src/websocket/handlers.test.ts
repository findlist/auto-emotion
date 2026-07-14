// server/src/websocket/handlers.test.ts
// Socket.IO 事件处理器单元测试
// 设计原因：handlers.ts 已将 io.on('connection') 内的闭包逻辑提取为接受依赖参数的纯函数，
// 测试时只需提供符合 SocketLike/Broadcaster 接口的 mock 对象，无需启动真实 HTTP 服务器。
// 重点覆盖：成功路径的 roomManager 调用参数与广播事件、失败路径的错误兜底文案、
// 边界场景（房间不存在、状态不合法、主动 vs 异常断线）。

import { describe, it, expect, vi } from 'vitest';
import {
  handleJoin,
  handleLeave,
  handleReady,
  handleUnready,
  handleSetMode,
  handleSubmitStress,
  handleStart,
  handleAction,
  handleScoreUpdate,
  handleFinish,
  handleDisconnect,
  type HandlerDeps,
  type SocketLike,
  type Broadcaster,
} from './handlers.js';
import { RoomEvents, GameEvents } from './events.js';
import type { Room, roomManager } from './room-manager.js';
import { AppError, ErrorCode } from '../utils/error.js';

/** 创建 mock socket：用 Map 记录 emit 调用，rooms 为可配置的 Set */
function createMockSocket(id = 'sock-1', rooms: string[] = []): SocketLike & { emits: Array<{ event: string; data: unknown }>; toEmits: Record<string, Array<{ event: string; data: unknown }>> } {
  const emits: Array<{ event: string; data: unknown }> = [];
  const toEmits: Record<string, Array<{ event: string; data: unknown }>> = {};
  // 对象字面量含 emits/toEmits 字段，用 as unknown as 强转绕过 SocketLike 接口与额外字段的冲突
  const socket = {
    id,
    rooms: new Set(rooms),
    join: vi.fn(async () => {}),
    leave: vi.fn(async () => {}),
    emit: vi.fn((event: string, data: unknown) => emits.push({ event, data })),
    to: vi.fn((roomId: string) => ({
      emit: (event: string, data: unknown) => {
        (toEmits[roomId] ||= []).push({ event, data });
      },
    })),
    on: vi.fn(),
    // 附加测试断言用的记录器（仅供测试读取，SocketLike 接口未声明）
    emits,
    toEmits,
  };
  return socket as unknown as SocketLike & { emits: typeof emits; toEmits: typeof toEmits };
}

/** 创建 mock io：实现 Broadcaster 接口，记录 to(roomId).emit 调用 */
function createMockIO(): Broadcaster & { toEmits: Record<string, Array<{ event: string; data: unknown }>> } {
  const toEmits: Record<string, Array<{ event: string; data: unknown }>> = {};
  return {
    to: vi.fn((roomId: string) => ({
      emit: (event: string, data: unknown) => {
        (toEmits[roomId] ||= []).push({ event, data });
      },
    })),
    toEmits,
  } as Broadcaster & { toEmits: typeof toEmits };
}

/** 创建 mock roomManager：所有方法返回 vi.fn，可按用例配置返回值或抛错 */
function createMockRoomManager(): typeof roomManager {
  return {
    createRoom: vi.fn(),
    getRoom: vi.fn(),
    joinRoom: vi.fn(),
    leaveRoom: vi.fn(),
    setReady: vi.fn(),
    setMode: vi.fn(),
    submitStress: vi.fn(),
    startGame: vi.fn(),
    updateRoomStatus: vi.fn(),
    broadcast: vi.fn(),
    generateLevelAndEvents: vi.fn(),
  } as unknown as typeof roomManager;
}

/** 构造完整 Room 对象，供 mock 返回值使用 */
function createMockRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: 'ROOM01',
    hostId: 'u1',
    status: 'waiting',
    mode: 'boss',
    players: [],
    stressSources: {},
    ...overrides,
  };
}

/** 组装 deps：复用 socket/io/roomManager 与默认 user */
function createDeps(overrides: Partial<HandlerDeps> = {}): HandlerDeps {
  return {
    socket: createMockSocket(),
    user: { userId: 'u1', phone: '13800000000' },
    roomManager: createMockRoomManager(),
    io: createMockIO(),
    ...overrides,
  };
}

describe('websocket/handlers 事件处理器', () => {
  describe('handleJoin 加入房间', () => {
    it('成功：调用 joinRoom 透传四参数，加入 Socket.IO 房间并广播 STATE', async () => {
      const room = createMockRoom({ id: 'ROOM01' });
      const deps = createDeps();
      (deps.roomManager.joinRoom as ReturnType<typeof vi.fn>).mockResolvedValue(room);

      await handleJoin({ roomId: 'ROOM01', nickname: '玩家1' }, deps);

      expect(deps.roomManager.joinRoom).toHaveBeenCalledWith('ROOM01', 'u1', 'sock-1', '玩家1');
      expect(deps.socket.join).toHaveBeenCalledWith('ROOM01');
      const toEmits = (deps.io as unknown as { toEmits: Record<string, Array<{ event: string; data: unknown }>> }).toEmits;
      expect(toEmits.ROOM01).toEqual([{ event: RoomEvents.STATE, data: { room } }]);
    });

    it('失败：roomManager 抛 Error 时透传 err.message 到 ERROR 事件', async () => {
      const deps = createDeps();
      (deps.roomManager.joinRoom as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('房间不存在'));

      await handleJoin({ roomId: 'NOPE', nickname: '玩家1' }, deps);

      expect((deps.socket as unknown as { emits: Array<{ event: string; data: unknown }> }).emits).toEqual([
        { event: RoomEvents.ERROR, data: { message: '房间不存在' } },
      ]);
    });

    it('失败：roomManager 抛非 Error 值时使用兜底文案', async () => {
      const deps = createDeps();
      // 模拟 service reject 字符串而非 Error 实例，覆盖三元 false 分支
      (deps.roomManager.joinRoom as ReturnType<typeof vi.fn>).mockRejectedValue('Redis 连接丢失');

      await handleJoin({ roomId: 'ROOM01', nickname: '玩家1' }, deps);

      expect((deps.socket as unknown as { emits: Array<{ event: string; data: unknown }> }).emits).toEqual([
        { event: RoomEvents.ERROR, data: { message: '加入房间失败' } },
      ]);
    });

    it('重连恢复：playing 状态且 levelData 已生成时，单独补发 LEVEL_READY 给重连玩家', async () => {
      // 断线重连场景：玩家已在房间内，joinRoom 刷新 socketId 并返回 playing 状态的 room
      // 后端应通过 socket.emit（非广播）补发 levelData，使前端重建游戏场景
      // levelData 需符合 LevelReadyPayload 完整结构（Room.levelData 类型收敛后 mock 数据需补全字段）
      const levelData = {
        monster: { name: '压力怪兽', hp: 1000, attack: 60, skills: ['压力冲击'], emotion: 'stress' },
        level: { destructibles: [], spawnPoints: [{ x: 400, y: 500 }], bossPoint: { x: 400, y: 150 } },
        events: [],
      };
      const room = createMockRoom({ id: 'ROOM01', status: 'playing', levelData });
      const deps = createDeps();
      (deps.roomManager.joinRoom as ReturnType<typeof vi.fn>).mockResolvedValue(room);

      await handleJoin({ roomId: 'ROOM01', nickname: '玩家1' }, deps);

      // 广播 STATE 给全房间
      const toEmits = (deps.io as unknown as { toEmits: Record<string, Array<{ event: string; data: unknown }>> }).toEmits;
      expect(toEmits.ROOM01).toEqual([{ event: RoomEvents.STATE, data: { room } }]);
      // 单独补发 LEVEL_READY 给重连玩家（socket.emit 而非 io.to().emit）
      const socketEmits = (deps.socket as unknown as { emits: Array<{ event: string; data: unknown }> }).emits;
      expect(socketEmits).toEqual([{ event: GameEvents.LEVEL_READY, data: levelData }]);
    });

    it('非重连场景：waiting 状态不补发 LEVEL_READY', async () => {
      // 新玩家加入 waiting 房间，无需补发 levelData（游戏未开始）
      const room = createMockRoom({ id: 'ROOM01', status: 'waiting' });
      const deps = createDeps();
      (deps.roomManager.joinRoom as ReturnType<typeof vi.fn>).mockResolvedValue(room);

      await handleJoin({ roomId: 'ROOM01', nickname: '玩家1' }, deps);

      const socketEmits = (deps.socket as unknown as { emits: Array<{ event: string; data: unknown }> }).emits;
      // 仅广播 STATE，无 LEVEL_READY 补发
      expect(socketEmits).toEqual([]);
    });

    it('重连但无 levelData：playing 状态但 levelData 未生成时不补发', async () => {
      // 边界场景：playing 状态但 levelData 尚未生成完成（generateLevelAndEvents 异步未结束）
      const room = createMockRoom({ id: 'ROOM01', status: 'playing', levelData: undefined });
      const deps = createDeps();
      (deps.roomManager.joinRoom as ReturnType<typeof vi.fn>).mockResolvedValue(room);

      await handleJoin({ roomId: 'ROOM01', nickname: '玩家1' }, deps);

      const socketEmits = (deps.socket as unknown as { emits: Array<{ event: string; data: unknown }> }).emits;
      expect(socketEmits).toEqual([]);
    });
  });

  describe('handleLeave 离开房间', () => {
    it('成功（房间仍存在）：调用 leaveRoom + socket.leave + 广播 STATE', async () => {
      const room = createMockRoom({ id: 'ROOM01' });
      const deps = createDeps();
      (deps.roomManager.leaveRoom as ReturnType<typeof vi.fn>).mockResolvedValue(room);

      await handleLeave({ roomId: 'ROOM01' }, deps);

      expect(deps.roomManager.leaveRoom).toHaveBeenCalledWith('ROOM01', 'u1');
      expect(deps.socket.leave).toHaveBeenCalledWith('ROOM01');
      const toEmits = (deps.io as unknown as { toEmits: Record<string, Array<{ event: string; data: unknown }>> }).toEmits;
      expect(toEmits.ROOM01).toEqual([{ event: RoomEvents.STATE, data: { room } }]);
    });

    it('成功（房间已销毁，room 为 null）：不广播 STATE', async () => {
      const deps = createDeps();
      // 最后一个玩家离开时房间被删除，leaveRoom 返回 null
      (deps.roomManager.leaveRoom as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await handleLeave({ roomId: 'ROOM01' }, deps);

      expect(deps.socket.leave).toHaveBeenCalledWith('ROOM01');
      const toEmits = (deps.io as unknown as { toEmits: Record<string, Array<{ event: string; data: unknown }>> }).toEmits;
      expect(toEmits.ROOM01).toBeUndefined();
    });

    it('失败：leaveRoom 抛 Error 时透传错误', async () => {
      const deps = createDeps();
      (deps.roomManager.leaveRoom as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('房间不存在'));

      await handleLeave({ roomId: 'NOPE' }, deps);

      expect((deps.socket as unknown as { emits: Array<{ event: string; data: unknown }> }).emits).toEqual([
        { event: RoomEvents.ERROR, data: { message: '房间不存在' } },
      ]);
    });
  });

  describe('handleReady / handleUnready 准备状态', () => {
    it('handleReady 成功：setReady 第三参数为 true 并广播', async () => {
      const room = createMockRoom({ id: 'ROOM01' });
      const deps = createDeps();
      (deps.roomManager.setReady as ReturnType<typeof vi.fn>).mockResolvedValue(room);

      await handleReady({ roomId: 'ROOM01' }, deps);

      expect(deps.roomManager.setReady).toHaveBeenCalledWith('ROOM01', 'u1', true);
      const toEmits = (deps.io as unknown as { toEmits: Record<string, Array<{ event: string; data: unknown }>> }).toEmits;
      expect(toEmits.ROOM01[0]).toEqual({ event: RoomEvents.STATE, data: { room } });
    });

    it('handleUnready 成功：setReady 第三参数为 false 并广播', async () => {
      const room = createMockRoom({ id: 'ROOM01' });
      const deps = createDeps();
      (deps.roomManager.setReady as ReturnType<typeof vi.fn>).mockResolvedValue(room);

      await handleUnready({ roomId: 'ROOM01' }, deps);

      expect(deps.roomManager.setReady).toHaveBeenCalledWith('ROOM01', 'u1', false);
      expect((deps.io as unknown as { toEmits: Record<string, Array<{ event: string; data: unknown }>> }).toEmits.ROOM01[0]).toEqual({
        event: RoomEvents.STATE,
        data: { room },
      });
    });

    it('handleReady 失败：使用兜底文案"准备失败"', async () => {
      const deps = createDeps();
      (deps.roomManager.setReady as ReturnType<typeof vi.fn>).mockRejectedValue('Redis 超时');

      await handleReady({ roomId: 'ROOM01' }, deps);

      expect((deps.socket as unknown as { emits: Array<{ event: string; data: unknown }> }).emits).toEqual([
        { event: RoomEvents.ERROR, data: { message: '准备失败' } },
      ]);
    });
  });

  describe('handleSetMode 设置模式', () => {
    it('成功：透传 mode 参数并广播', async () => {
      const room = createMockRoom({ id: 'ROOM01', mode: 'brawl' });
      const deps = createDeps();
      (deps.roomManager.setMode as ReturnType<typeof vi.fn>).mockResolvedValue(room);

      await handleSetMode({ roomId: 'ROOM01', mode: 'brawl' }, deps);

      expect(deps.roomManager.setMode).toHaveBeenCalledWith('ROOM01', 'u1', 'brawl');
    });

    it('失败（非房主）：透传 roomManager 抛出的错误消息', async () => {
      const deps = createDeps();
      (deps.roomManager.setMode as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('仅房主可设置模式'));

      await handleSetMode({ roomId: 'ROOM01', mode: 'brawl' }, deps);

      expect((deps.socket as unknown as { emits: Array<{ event: string; data: unknown }> }).emits).toEqual([
        { event: RoomEvents.ERROR, data: { message: '仅房主可设置模式' } },
      ]);
    });
  });

  describe('handleSubmitStress 提交压力源', () => {
    it('成功：透传 stressSource 并广播', async () => {
      const room = createMockRoom({ id: 'ROOM01' });
      const deps = createDeps();
      (deps.roomManager.submitStress as ReturnType<typeof vi.fn>).mockResolvedValue(room);

      await handleSubmitStress({ roomId: 'ROOM01', stressSource: '加班' }, deps);

      expect(deps.roomManager.submitStress).toHaveBeenCalledWith('ROOM01', 'u1', '加班');
    });

    it('失败：使用兜底文案"提交压力源失败"', async () => {
      const deps = createDeps();
      (deps.roomManager.submitStress as ReturnType<typeof vi.fn>).mockRejectedValue('连接断开');

      await handleSubmitStress({ roomId: 'ROOM01', stressSource: '加班' }, deps);

      expect((deps.socket as unknown as { emits: Array<{ event: string; data: unknown }> }).emits).toEqual([
        { event: RoomEvents.ERROR, data: { message: '提交压力源失败' } },
      ]);
    });
  });

  describe('handleStart 开始游戏', () => {
    it('成功：调用 startGame + 广播 STATE 与 game:start，不调用 updateRoomStatus', async () => {
      // H-03 修复：playing 状态由 generateLevelAndEvents 内部统一管理，handleStart 不再调用 updateRoomStatus
      const room = createMockRoom({ id: 'ROOM01', status: 'generating' });
      const deps = createDeps();
      (deps.roomManager.startGame as ReturnType<typeof vi.fn>).mockResolvedValue(room);

      await handleStart({ roomId: 'ROOM01' }, deps);

      expect(deps.roomManager.startGame).toHaveBeenCalledWith('ROOM01', 'u1');
      // 状态转换已移交 generateLevelAndEvents，此处不应调用 updateRoomStatus
      expect(deps.roomManager.updateRoomStatus).not.toHaveBeenCalled();
      const toEmits = (deps.io as unknown as { toEmits: Record<string, Array<{ event: string; data: unknown }>> }).toEmits;
      // 先广播 STATE（generating），再广播 game:start 通知前端进入加载
      expect(toEmits.ROOM01).toEqual([
        { event: RoomEvents.STATE, data: { room } },
        { event: GameEvents.START, data: { roomId: 'ROOM01' } },
      ]);
    });

    it('失败：startGame 抛错时不调用 updateRoomStatus，仅透传错误', async () => {
      const deps = createDeps();
      (deps.roomManager.startGame as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('仅房主可开始游戏'));

      await handleStart({ roomId: 'ROOM01' }, deps);

      expect(deps.roomManager.updateRoomStatus).not.toHaveBeenCalled();
      expect((deps.socket as unknown as { emits: Array<{ event: string; data: unknown }> }).emits).toEqual([
        { event: RoomEvents.ERROR, data: { message: '仅房主可开始游戏' } },
      ]);
    });
  });

  describe('handleAction 游戏操作', () => {
    it('成功（playing 状态）：广播 ACTION 含 userId/action/payload/timestamp', async () => {
      const room = createMockRoom({ id: 'ROOM01', status: 'playing' });
      const deps = createDeps();
      (deps.roomManager.getRoom as ReturnType<typeof vi.fn>).mockResolvedValue(room);

      await handleAction({ roomId: 'ROOM01', action: 'shoot', payload: { angle: 90 } }, deps);

      expect(deps.roomManager.getRoom).toHaveBeenCalledWith('ROOM01');
      const toEmits = (deps.io as unknown as { toEmits: Record<string, Array<{ event: string; data: unknown }>> }).toEmits;
      expect(toEmits.ROOM01[0].event).toBe(GameEvents.ACTION);
      expect(toEmits.ROOM01[0].data).toMatchObject({
        userId: 'u1',
        action: 'shoot',
        payload: { angle: 90 },
      });
      expect(typeof (toEmits.ROOM01[0].data as { timestamp: number }).timestamp).toBe('number');
    });

    it('失败（房间不存在）：getRoom 返回 null 时抛"游戏未在进行中"', async () => {
      const deps = createDeps();
      (deps.roomManager.getRoom as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await handleAction({ roomId: 'NOPE', action: 'shoot' }, deps);

      expect((deps.socket as unknown as { emits: Array<{ event: string; data: unknown }> }).emits).toEqual([
        { event: RoomEvents.ERROR, data: { code: ErrorCode.BAD_REQUEST, message: '游戏未在进行中' } },
      ]);
    });

    it('失败（非 playing 状态）：status=waiting 时抛"游戏未在进行中"', async () => {
      const deps = createDeps();
      (deps.roomManager.getRoom as ReturnType<typeof vi.fn>).mockResolvedValue(createMockRoom({ status: 'waiting' }));

      await handleAction({ roomId: 'ROOM01', action: 'shoot' }, deps);

      expect((deps.socket as unknown as { emits: Array<{ event: string; data: unknown }> }).emits).toEqual([
        { event: RoomEvents.ERROR, data: { code: ErrorCode.BAD_REQUEST, message: '游戏未在进行中' } },
      ]);
    });
  });

  describe('handleScoreUpdate 分数上报', () => {
    it('成功：广播 SCORE_UPDATE 含 userId/score/combo/timestamp', async () => {
      const room = createMockRoom({ status: 'playing' });
      const deps = createDeps();
      (deps.roomManager.getRoom as ReturnType<typeof vi.fn>).mockResolvedValue(room);

      await handleScoreUpdate({ roomId: 'ROOM01', score: 100, combo: 5 }, deps);

      const toEmits = (deps.io as unknown as { toEmits: Record<string, Array<{ event: string; data: unknown }>> }).toEmits;
      expect(toEmits.ROOM01[0].event).toBe(GameEvents.SCORE_UPDATE);
      expect(toEmits.ROOM01[0].data).toMatchObject({ userId: 'u1', score: 100, combo: 5 });
    });

    it('combo 未传时默认为 0', async () => {
      const room = createMockRoom({ status: 'playing' });
      const deps = createDeps();
      (deps.roomManager.getRoom as ReturnType<typeof vi.fn>).mockResolvedValue(room);

      await handleScoreUpdate({ roomId: 'ROOM01', score: 50 }, deps);

      const toEmits = (deps.io as unknown as { toEmits: Record<string, Array<{ event: string; data: unknown }>> }).toEmits;
      expect((toEmits.ROOM01[0].data as { combo: number }).combo).toBe(0);
    });

    it('失败（非 playing 状态）：透传"游戏未在进行中"', async () => {
      const deps = createDeps();
      (deps.roomManager.getRoom as ReturnType<typeof vi.fn>).mockResolvedValue(createMockRoom({ status: 'settling' }));

      await handleScoreUpdate({ roomId: 'ROOM01', score: 50 }, deps);

      expect((deps.socket as unknown as { emits: Array<{ event: string; data: unknown }> }).emits).toEqual([
        { event: RoomEvents.ERROR, data: { code: ErrorCode.BAD_REQUEST, message: '游戏未在进行中' } },
      ]);
    });
  });

  describe('handleFinish 游戏结束', () => {
    it('成功：CAS 调用 updateRoomStatus(settling, playing) 并广播 FINISH', async () => {
      const room = createMockRoom({ status: 'playing' });
      const deps = createDeps();
      (deps.roomManager.updateRoomStatus as ReturnType<typeof vi.fn>).mockResolvedValue(room);

      await handleFinish({ roomId: 'ROOM01', finalScore: 200, result: 'win' }, deps);

      // 第三参数 'playing' 为 expectedFrom CAS 守卫，原子保证仅 playing 态可转 settling
      expect(deps.roomManager.updateRoomStatus).toHaveBeenCalledWith('ROOM01', 'settling', 'playing');
      const toEmits = (deps.io as unknown as { toEmits: Record<string, Array<{ event: string; data: unknown }>> }).toEmits;
      expect(toEmits.ROOM01[0].event).toBe(GameEvents.FINISH);
      expect(toEmits.ROOM01[0].data).toMatchObject({ userId: 'u1', finalScore: 200, result: 'win' });
    });

    it('失败（房间不存在）：updateRoomStatus 返回 null 时抛"房间不存在"', async () => {
      const deps = createDeps();
      (deps.roomManager.updateRoomStatus as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await handleFinish({ roomId: 'NOPE', finalScore: 0, result: 'lose' }, deps);

      expect((deps.socket as unknown as { emits: Array<{ event: string; data: unknown }> }).emits).toEqual([
        { event: RoomEvents.ERROR, data: { code: ErrorCode.NOT_FOUND, message: '房间不存在' } },
      ]);
    });

    it('失败（非 playing 状态）：updateRoomStatus 抛 CONFLICT 时透传"游戏未在进行中"', async () => {
      // CAS 守卫：room-manager 内部检测到状态不匹配抛 CONFLICT，withErrorHandling 透传给客户端
      const deps = createDeps();
      (deps.roomManager.updateRoomStatus as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AppError(ErrorCode.CONFLICT, '游戏未在进行中'),
      );

      await handleFinish({ roomId: 'ROOM01', finalScore: 0, result: 'lose' }, deps);

      expect((deps.socket as unknown as { emits: Array<{ event: string; data: unknown }> }).emits).toEqual([
        { event: RoomEvents.ERROR, data: { code: ErrorCode.CONFLICT, message: '游戏未在进行中' } },
      ]);
    });
  });

  describe('handleDisconnect 断开连接', () => {
    it('主动断开（client namespace disconnect）：不广播任何事件', () => {
      const socket = createMockSocket('sock-1', ['ROOM01']);
      const deps = createDeps({ socket });

      handleDisconnect('client namespace disconnect', deps);

      const toEmits = (socket as unknown as { toEmits: Record<string, Array<unknown>> }).toEmits;
      expect(Object.keys(toEmits)).toHaveLength(0);
    });

    it('异常断线：遍历 rooms 广播 PLAYER_OFFLINE（排除自身 socket.id）', () => {
      // socket.rooms 包含自身 socket.id 与加入的房间 ID
      const socket = createMockSocket('sock-1', ['sock-1', 'ROOM01', 'ROOM02']);
      const deps = createDeps({ socket });

      handleDisconnect('transport close', deps);

      const toEmits = (socket as unknown as { toEmits: Record<string, Array<{ event: string; data: unknown }>> }).toEmits;
      // 自身 socket.id 不广播，仅房间 ID 广播
      expect(toEmits.ROOM01).toEqual([{ event: RoomEvents.PLAYER_OFFLINE, data: { userId: 'u1' } }]);
      expect(toEmits.ROOM02).toEqual([{ event: RoomEvents.PLAYER_OFFLINE, data: { userId: 'u1' } }]);
      expect(toEmits['sock-1']).toBeUndefined();
    });

    it('异常断线（仅自身 socket.id，未加入房间）：不广播', () => {
      const socket = createMockSocket('sock-1', ['sock-1']);
      const deps = createDeps({ socket });

      handleDisconnect('transport close', deps);

      const toEmits = (socket as unknown as { toEmits: Record<string, Array<unknown>> }).toEmits;
      expect(Object.keys(toEmits)).toHaveLength(0);
    });

    it('异常断线（rooms 为空）：不广播', () => {
      const socket = createMockSocket('sock-1', []);
      const deps = createDeps({ socket });

      handleDisconnect('ping timeout', deps);

      const toEmits = (socket as unknown as { toEmits: Record<string, Array<unknown>> }).toEmits;
      expect(Object.keys(toEmits)).toHaveLength(0);
    });
  });
});
