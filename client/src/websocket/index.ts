// client/src/websocket/index.ts
// Socket.IO 客户端封装
// - 自动重连（指数退避，最多 10 次）
// - 断线/重连状态 Toast 提示
// - 重连后自动恢复房间状态

import { io, Socket } from 'socket.io-client';
import { useRoomStore } from '../stores/room-store';
import type { Player, RoomStatus } from '../stores/room-store';
import type { GameMode } from '../types/game';
import { logger } from '../utils/logger';
import { showToast } from '../utils/toast';

/** 房间数据结构（与 server/src/websocket/room-manager.ts 保持一致） */
// 设计原因:mode 收敛为 GameMode,与 room-store/GameMode 类型链路统一,
// 避免 setRoom 调用时 string → GameMode 类型不匹配。
// 后端 room.mode 实际仅赋值 'boss'|'brawl'|'speed'(见 settle-service.ts 第 49 行分支),
// 收敛为 GameMode 符合实际语义。
interface Room {
  id: string;
  hostId: string;
  status: RoomStatus;
  mode: GameMode;
  players: Player[];
  stressSources: Record<string, string>;
}

let socket: Socket | null = null;
// 记录最近加入的房间信息，用于断线重连后恢复房间状态
let lastRoomId: string | null = null;
let lastNickname: string | null = null;

/** 连接 WebSocket */
export function connect(): Socket {
  // 仅当 socket 不存在时才创建新连接；socket 存在但处于断线重连 backoff 中时直接复用
  // 设计原因：socket?.connected 在重连间隔期为 false，若此时创建新 socket，旧 socket 的
  // 事件监听器仍有效，两个 socket 同时触发 room:state 等回调导致状态重复写入/覆盖。
  // socket.io 客户端内部已管理重连，无需重建。disconnect() 会置 socket=null，重连失败后
  // 用户刷新页面也会重建。复用已有 socket 是 socket.io v4 标准模式
  if (socket) return socket;

  const token = localStorage.getItem('token');
  if (!token) throw new Error('未登录');

  socket = io('/', {
    auth: { token },
    transports: ['websocket'],
    // 重连配置：指数退避，1s 起步，最大 5s，最多 10 次
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  socket.on('connect', () => {
    logger.info('WebSocket connected');
  });

  socket.on('disconnect', (reason) => {
    logger.info(`WebSocket disconnected: ${reason}`);
    // 非主动断开时提示用户正在重连
    if (reason !== 'io client disconnect') {
      showToast('warning', '连接已断开，正在尝试重连...');
    }
  });

  socket.on('connect_error', (err) => {
    // 传入 err 对象便于 dev 环境打印完整堆栈，logger 生产环境静默避免噪音
    logger.error(`WebSocket error: ${err.message}`, err);
  });

  // 重连成功：恢复房间状态并提示用户
  socket.io.on('reconnect', (attempt) => {
    logger.info(`Reconnected after ${attempt} attempts`);
    showToast('success', '已重新连接');
    // 若断线前在房间内，主动 rejoin 触发后端刷新 socketId 并下发最新房间状态
    if (lastRoomId && lastNickname) {
      socket?.emit('room:join', { roomId: lastRoomId, nickname: lastNickname });
    }
  });

  // 重连彻底失败（达到最大次数）
  socket.io.on('reconnect_failed', () => {
    showToast('error', '重连失败，请检查网络后刷新页面');
  });

  // 房间状态同步
  socket.on('room:state', (data: { room: Room }) => {
    const roomStore = useRoomStore.getState();
    const { room } = data;
    roomStore.setRoom({
      roomId: room.id,
      hostId: room.hostId,
      status: room.status,
      mode: room.mode,
      players: room.players,
      stressSources: room.stressSources ?? {},
    });
  });

  // 房间错误：code 可选，与后端 ErrorPayload 对齐，前端可基于 code 做差异化提示
  socket.on('room:error', (data: { code?: number; message: string }) => {
    const roomStore = useRoomStore.getState();
    roomStore.setError(data.message);
  });

  // 玩家异常断线提示：其他玩家收到，提示等待重连（断线玩家自身由 disconnect 事件单独提示）
  socket.on('room:player-offline', (data: { userId: string }) => {
    const roomStore = useRoomStore.getState();
    const player = roomStore.players.find((p) => p.userId === data.userId);
    const name = player?.nickname ?? '有玩家';
    showToast('warning', `${name} 已断线，等待重连...`);
  });

  // 游戏开始
  socket.on('game:start', () => {
    const roomStore = useRoomStore.getState();
    const { roomId, hostId, mode, players, stressSources } = roomStore;
    roomStore.setRoom({
      roomId: roomId ?? '',
      hostId,
      status: 'playing',
      mode,
      players,
      stressSources,
    });
  });

  return socket;
}

/** 断开连接 */
export function disconnect(): void {
  socket?.disconnect();
  socket = null;
  // 清除重连房间记录，避免用户登出后重新登录时，新 socket 的 reconnect 事件
  // 使用旧值尝试 rejoin 已不存在的房间（与 leaveRoom 的清理逻辑保持一致）
  lastRoomId = null;
  lastNickname = null;
}

/** 获取当前 socket 实例 */
export function getSocket(): Socket {
  if (!socket) throw new Error('Socket not connected');
  return socket;
}

/**
 * 等待 socket 完成连接握手并返回 socket 实例
 * 设计原因：connect() 同步返回 socket，但 socket.io 连接是异步握手，
 * socket.id 在 connect 事件触发后才可用。快速匹配等需要 socketId 的 HTTP
 * 调用必须等待连接完成，否则传空字符串会被后端 400 拒绝（match.ts 参数校验）。
 * 不改动 connect() 同步签名以避免影响 battle.tsx 等既有调用方。
 */
export function waitForConnection(timeoutMs = 5000): Promise<Socket> {
  const sock = getSocket();
  // 已连接直接返回，避免不必要的监听开销
  if (sock.connected) return Promise.resolve(sock);

  return new Promise((resolve, reject) => {
    // 统一清理：移除所有临时监听与超时定时器，防止内存泄漏与重复回调
    const cleanup = (): void => {
      clearTimeout(timer);
      sock.off('connect', onConnect);
      sock.off('connect_error', onError);
      sock.io.off('reconnect_failed', onFail);
    };
    const onConnect = (): void => {
      cleanup();
      resolve(sock);
    };
    const onError = (err: Error): void => {
      cleanup();
      reject(new Error(`WebSocket 连接失败: ${err.message}`));
    };
    const onFail = (): void => {
      cleanup();
      reject(new Error('WebSocket 重连失败，请检查网络后刷新页面'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('WebSocket 连接超时'));
    }, timeoutMs);

    sock.on('connect', onConnect);
    sock.on('connect_error', onError);
    sock.io.on('reconnect_failed', onFail);
  });
}

/** 暴露房间事件发送函数 */
export const roomActions = {
  /** 加入房间 */
  joinRoom(roomId: string, nickname: string): void {
    // 记录房间信息，用于断线重连后自动恢复
    lastRoomId = roomId;
    lastNickname = nickname;
    getSocket().emit('room:join', { roomId, nickname });
  },

  /** 离开房间 */
  leaveRoom(roomId: string): void {
    // 主动离开时清除重连记录，避免重连后误回房间
    lastRoomId = null;
    lastNickname = null;
    getSocket().emit('room:leave', { roomId });
  },

  /** 准备 */
  ready(roomId: string): void {
    getSocket().emit('room:ready', { roomId });
  },

  /** 取消准备 */
  unready(roomId: string): void {
    getSocket().emit('room:unready', { roomId });
  },

  /** 设置模式 */
  setMode(roomId: string, mode: GameMode): void {
    getSocket().emit('room:set-mode', { roomId, mode });
  },

  /** 提交压力源 */
  submitStress(roomId: string, stressSource: string): void {
    getSocket().emit('room:submit-stress', { roomId, stressSource });
  },

  /** 开始游戏 */
  startGame(roomId: string): void {
    getSocket().emit('room:start', { roomId });
  },
};
