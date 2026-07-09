// server/src/websocket/index.ts
// Socket.IO 初始化与事件处理
// - JWT 握手鉴权
// - 房间事件监听（handler 实现移至 handlers.ts 便于单元测试）

import { Server } from 'socket.io';
import { createServer } from 'http';
import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import redis from '../config/redis.js';
import pool from '../config/database.js';
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

/**
 * JWT 握手鉴权中间件 + Redis 黑名单校验
 * 设计原因：HTTP 侧 authMiddleware 已校验 blacklist（登出/封禁用户令牌即时失效），
 * 若 WebSocket 握手不校验，登出后旧 token 仍可建立对战连接，形成安全绕过。
 * Redis 异常时降级放行，避免缓存故障导致所有对战连接不可用（遵循游戏降级规则）。
 */
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('未提供认证令牌'));

  try {
    const payload = jwt.verify(token, config.jwtSecret) as SocketUser;
    // 黑名单检查：登出/封禁时 token 会被写入 blacklist:<token>
    try {
      const blacklisted = await redis.get(`blacklist:${token}`);
      if (blacklisted) return next(new Error('令牌已失效'));
    } catch (err) {
      // Redis 不可用时降级放行，仅记录警告，不阻塞对战核心连接
      console.warn('WebSocket 握手黑名单检查失败，降级放行:', (err as Error).message);
    }
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

/**
 * 优雅关闭：收到终止信号时按序释放资源
 * 设计原因：生产环境容器编排（Docker/K8s）发送 SIGTERM 后会有宽限期，
 * 顺序关闭 io → httpServer → pool → redis，可让房间内玩家收到 disconnect 通知，
 * 未完成请求正常响应，避免连接粗暴断开导致脏数据。
 */
async function gracefulShutdown(signal: NodeJS.Signals): Promise<void> {
  console.log(`收到 ${signal}，开始优雅关闭...`);
  // 1. 关闭 Socket.IO：停止接受新连接并断开现有（触发客户端 reconnect 逻辑）
  io.close();
  // 2. 关闭 HTTP 服务器：停止监听端口
  httpServer.close();
  try {
    // 3. 释放数据库连接池
    await pool.end();
    // 4. 断开 Redis
    await redis.quit();
  } catch (err) {
    // 资源关闭异常不阻塞退出流程（部分资源可能已关闭）
    console.error('优雅关闭资源释放异常:', (err as Error).message);
  }
  console.log('服务已关闭');
  process.exit(0);
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
