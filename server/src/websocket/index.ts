// server/src/websocket/index.ts
// Socket.IO 初始化与事件处理
// - JWT 握手鉴权
// - 房间事件监听（handler 实现移至 handlers.ts 便于单元测试）

import { Server } from 'socket.io';
import { createServer } from 'http';
import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import { RoomEvents, GameEvents } from './events.js';
import { roomManager } from './room-manager.js';
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
  type SocketUser,
} from './handlers.js';

// 创建独立的 HTTP 服务器
const httpServer = createServer();

const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

/** JWT 握手鉴权中间件 */
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('未提供认证令牌'));

  try {
    const payload = jwt.verify(token, config.jwtSecret) as SocketUser;
    socket.data.user = payload;
    next();
  } catch {
    next(new Error('无效的认证令牌'));
  }
});

/** 连接处理器：组装依赖并注册各事件 handler */
io.on('connection', (socket) => {
  const user = socket.data.user as SocketUser;
  console.log(`Socket connected: ${user.userId}`);

  // 构造依赖注入对象，handler 内部通过 deps 访问 socket/user/roomManager/io
  const deps: HandlerDeps = {
    socket: socket as unknown as HandlerDeps['socket'],
    user,
    roomManager,
    io,
  };

  socket.on(RoomEvents.JOIN, (data) => handleJoin(data, deps));
  socket.on(RoomEvents.LEAVE, (data) => handleLeave(data, deps));
  socket.on(RoomEvents.READY, (data) => handleReady(data, deps));
  socket.on(RoomEvents.UNREADY, (data) => handleUnready(data, deps));
  socket.on(RoomEvents.SET_MODE, (data) => handleSetMode(data, deps));
  socket.on(RoomEvents.SUBMIT_STRESS, (data) => handleSubmitStress(data, deps));
  socket.on(RoomEvents.START, (data) => handleStart(data, deps));
  socket.on(GameEvents.ACTION, (data) => handleAction(data, deps));
  socket.on(GameEvents.SCORE_UPDATE, (data) => handleScoreUpdate(data, deps));
  socket.on(GameEvents.FINISH, (data) => handleFinish(data, deps));
  socket.on('disconnect', (reason) => handleDisconnect(reason, deps));
});

export { io, httpServer };

// 启动 HTTP + WebSocket 服务器
httpServer.listen(config.port, () => {
  console.log(
    JSON.stringify({
      level: 'info',
      message: 'Server started',
      timestamp: new Date().toISOString(),
      port: config.port,
    }),
  );
});
