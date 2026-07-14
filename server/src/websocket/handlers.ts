// server/src/websocket/handlers.ts
// Socket.IO 事件处理器纯函数集合
// 设计原因：原 index.ts 将所有 handler 写在 io.on('connection') 闭包内，
// 无法独立测试（import index.ts 会触发 httpServer.listen 副作用）。
// 此处将每个 handler 拆分为接受依赖参数的纯函数，便于单元测试覆盖。
// index.ts 仅负责组装：从 socket.data 取 user，构造 deps，注册 handler。

import { RoomEvents, GameEvents } from './events.js';
import type {
  JoinInput,
  LeaveInput,
  ReadyInput,
  SetModeInput,
  SubmitStressInput,
  StartInput,
  ActionInput,
  ScoreUpdateInput,
  FinishInput,
} from './events.js';
import type { roomManager } from './room-manager.js';
import { AppError, ErrorCode } from '../utils/error.js';
import { logger } from '../utils/logger.js';

/** Socket 最小接口：仅声明 handler 用到的方法，便于测试 mock，避免依赖 socket.io 类型 */
export interface SocketLike {
  id: string;
  rooms: Set<string>;
  join(roomId: string): Promise<void> | void;
  leave(roomId: string): Promise<void> | void;
  emit(event: string, data: unknown): void;
  to(roomId: string): { emit(event: string, data: unknown): void };
  on(event: string, handler: (...args: never[]) => void): void;
}

/** JWT 解码后的用户身份 */
export interface SocketUser {
  userId: string;
  phone: string;
}

/** 房间广播接口：与 io.to().emit() 链式调用形态一致 */
export interface Broadcaster {
  to(roomId: string): { emit(event: string, data: unknown): void };
}

/** handler 依赖：注入 socket/user/roomManager/io 便于测试替换 */
export interface HandlerDeps {
  socket: SocketLike;
  user: SocketUser;
  roomManager: typeof roomManager;
  io: Broadcaster;
}

/**
 * 统一异常兜底：执行业务逻辑，捕获异常后通过 socket.emit 反馈错误
 * 设计原因：每个 handler 都需 try/catch + err instanceof Error 三元判断，
 * 提取为高阶函数消除重复，保证错误兜底文案逻辑一致。
 * AppError 额外透传 code 字段，使前端可按错误码差异化处理（与 HTTP 错误响应对齐）；
 * 普通 Error 无 code 字段，仅传 message，前端兼容 code 可选。
 */
async function withErrorHandling<T>(
  fn: () => Promise<T>,
  socket: SocketLike,
  fallbackMsg: string
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof AppError) {
      socket.emit(RoomEvents.ERROR, { code: err.code, message: err.message });
    } else {
      const msg = err instanceof Error ? err.message : fallbackMsg;
      socket.emit(RoomEvents.ERROR, { message: msg });
    }
  }
}

/** 加入房间：刷新 socketId 后加入 Socket.IO 房间并广播全量状态
 *  重连场景（房间处于 playing 且已有 levelData）下，单独向重连玩家补发 game:level-ready，
 *  使其能重建游戏场景。用 socket.emit 而非 io.to().emit，避免其他在线玩家重复收到并重建画面
 */
export async function handleJoin(
  data: JoinInput,
  deps: HandlerDeps
): Promise<void> {
  await withErrorHandling(async () => {
    const room = await deps.roomManager.joinRoom(data.roomId, deps.user.userId, deps.socket.id, data.nickname);
    await deps.socket.join(room.id);
    deps.io.to(room.id).emit(RoomEvents.STATE, { room });
    // 重连恢复：playing 状态下能成功 joinRoom 的必为断线重连玩家（新玩家会被 joinRoom 拒绝）
    // 此时 room.levelData 已由 generateLevelAndEvents 生成，补发给重连玩家以重建场景
    if (room.status === 'playing' && room.levelData) {
      deps.socket.emit(GameEvents.LEVEL_READY, room.levelData);
    }
  }, deps.socket, '加入房间失败');
}

/** 离开房间：从房间管理器移除并退出 Socket.IO 房间，房间仍存在则广播新状态 */
export async function handleLeave(
  data: LeaveInput,
  deps: HandlerDeps
): Promise<void> {
  await withErrorHandling(async () => {
    const room = await deps.roomManager.leaveRoom(data.roomId, deps.user.userId);
    await deps.socket.leave(data.roomId);
    if (room) {
      deps.io.to(room.id).emit(RoomEvents.STATE, { room });
    }
  }, deps.socket, '离开房间失败');
}

/** 准备：标记玩家就绪状态并广播 */
export async function handleReady(data: ReadyInput, deps: HandlerDeps): Promise<void> {
  await withErrorHandling(async () => {
    const room = await deps.roomManager.setReady(data.roomId, deps.user.userId, true);
    deps.io.to(room.id).emit(RoomEvents.STATE, { room });
  }, deps.socket, '准备失败');
}

/** 取消准备：取消玩家就绪状态并广播 */
export async function handleUnready(data: ReadyInput, deps: HandlerDeps): Promise<void> {
  await withErrorHandling(async () => {
    const room = await deps.roomManager.setReady(data.roomId, deps.user.userId, false);
    deps.io.to(room.id).emit(RoomEvents.STATE, { room });
  }, deps.socket, '取消准备失败');
}

/** 设置对战模式：仅房主可调用，权限由 roomManager.setMode 内部校验 */
export async function handleSetMode(
  data: SetModeInput,
  deps: HandlerDeps
): Promise<void> {
  await withErrorHandling(async () => {
    const room = await deps.roomManager.setMode(data.roomId, deps.user.userId, data.mode);
    deps.io.to(room.id).emit(RoomEvents.STATE, { room });
  }, deps.socket, '设置模式失败');
}

/** 提交压力源：玩家为本局选择压力关键词，供 AI 生成情绪怪兽 */
export async function handleSubmitStress(
  data: SubmitStressInput,
  deps: HandlerDeps
): Promise<void> {
  await withErrorHandling(async () => {
    const room = await deps.roomManager.submitStress(data.roomId, deps.user.userId, data.stressSource);
    deps.io.to(room.id).emit(RoomEvents.STATE, { room });
  }, deps.socket, '提交压力源失败');
}

/** 开始游戏：房主触发，广播 generating 状态与 game:start 通知前端进入加载
 *  设计原因：playing 状态转换由 generateLevelAndEvents 内部统一管理（设置 levelData 后才置 playing），
 *  此处不再额外调用 updateRoomStatus('playing')，避免与异步关卡生成产生读-改-写竞态，
 *  导致状态闪烁或 levelData 被覆盖（H-03 修复）
 */
export async function handleStart(data: StartInput, deps: HandlerDeps): Promise<void> {
  await withErrorHandling(async () => {
    const room = await deps.roomManager.startGame(data.roomId, deps.user.userId);
    deps.io.to(room.id).emit(RoomEvents.STATE, { room });
    deps.io.to(room.id).emit(GameEvents.START, { roomId: room.id });
  }, deps.socket, '开始游戏失败');
}

/** 游戏操作：仅 playing 状态允许，广播操作给房间所有人（含发送者，前端过滤自身） */
export async function handleAction(
  data: ActionInput,
  deps: HandlerDeps
): Promise<void> {
  await withErrorHandling(async () => {
    const room = await deps.roomManager.getRoom(data.roomId);
    if (!room || room.status !== 'playing') {
      throw new AppError(ErrorCode.BAD_REQUEST, '游戏未在进行中');
    }
    deps.io.to(data.roomId).emit(GameEvents.ACTION, {
      userId: deps.user.userId,
      action: data.action,
      payload: data.payload,
      timestamp: Date.now(),
    });
  }, deps.socket, '操作失败');
}

/** 分数上报：仅 playing 状态允许，广播分数与连击给房间所有人 */
export async function handleScoreUpdate(
  data: ScoreUpdateInput,
  deps: HandlerDeps
): Promise<void> {
  await withErrorHandling(async () => {
    const room = await deps.roomManager.getRoom(data.roomId);
    if (!room || room.status !== 'playing') {
      throw new AppError(ErrorCode.BAD_REQUEST, '游戏未在进行中');
    }
    deps.io.to(data.roomId).emit(GameEvents.SCORE_UPDATE, {
      userId: deps.user.userId,
      score: data.score,
      combo: data.combo || 0,
      timestamp: Date.now(),
    });
  }, deps.socket, '分数上报失败');
}

/** 游戏结束：切换房间到 settling 状态并广播结束信息 */
export async function handleFinish(
  data: FinishInput,
  deps: HandlerDeps
): Promise<void> {
  await withErrorHandling(async () => {
    const room = await deps.roomManager.getRoom(data.roomId);
    if (!room) throw new AppError(ErrorCode.NOT_FOUND, '房间不存在');
    // 状态守卫：仅 playing 状态可触发结算，防止非游戏中状态被错误改为 settling
    if (room.status !== 'playing') {
      throw new AppError(ErrorCode.CONFLICT, '游戏未在进行中');
    }
    await deps.roomManager.updateRoomStatus(data.roomId, 'settling');
    deps.io.to(data.roomId).emit(GameEvents.FINISH, {
      userId: deps.user.userId,
      finalScore: data.finalScore,
      result: data.result,
      timestamp: Date.now(),
    });
  }, deps.socket, '游戏结束处理失败');
}

/**
 * 断开连接处理：主动断开（玩家离开页面）不广播；
 * 异常断线（网络掉线）遍历 socket 加入的房间，通知其他玩家等待重连
 * 设计原因：不移除房间数据，给断线玩家保留 5 分钟重连窗口（房间 TTL 自然清理）
 */
export function handleDisconnect(reason: string, deps: HandlerDeps): void {
  // 主动断开（如玩家离开页面）不广播，避免对其他玩家造成干扰
  if (reason === 'client namespace disconnect') return;
  // 遍历该 socket 加入的房间（排除自身 socket.id），广播玩家断线提示
  // try/catch 保护：emit 可能因底层传输已关闭而抛错，不应影响其他房间的广播
  for (const roomId of deps.socket.rooms) {
    if (roomId === deps.socket.id) continue;
    try {
      deps.socket.to(roomId).emit(RoomEvents.PLAYER_OFFLINE, { userId: deps.user.userId });
    } catch (err) {
      // 设计原因：使用结构化 logger 替代 raw console.error，与前序 websocket/index.ts 修复一致，
      // 保证 per-connection 断线广播失败日志与全项目 JSON 格式统一，便于生产环境日志聚合
      logger.error('PLAYER_OFFLINE 广播失败', { error: (err as Error).message, roomId });
    }
  }
}
