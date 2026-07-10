// server/src/websocket/index.ts
// Socket.IO 初始化与事件处理
// - JWT 握手鉴权
// - 房间事件监听（handler 实现移至 handlers.ts 便于单元测试）
//
// 设计原因：原版本在模块顶层 createServer() 创建独立 HTTP 服务器且未传入 express app，
// 导致生产环境所有 HTTP API 请求无 handler 处理（测试用 app.listen(0) 绕过未暴露该问题）。
// 现重构为 initWebSocket(server) 函数，由 app.ts 创建 httpServer 并传入 app 后调用，
// 保证 Socket.IO 与 Express 共享同一 HTTP 服务器，WebSocket 升级与普通 HTTP 请求均能正确处理。

import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import redis from '../config/redis.js';
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

// 模块级 io 实例：initWebSocket 调用后赋值，room-manager 通过 live binding 获取
let io: Server;

/**
 * 初始化 WebSocket 服务器
 * 设计原因：由 app.ts 创建 httpServer（已挂载 express app）后传入，Socket.IO 附加到同一服务器，
 * 实现 HTTP API 与 WebSocket 共享端口。io 实例在函数内创建并赋值给模块级变量，
 * room-manager.ts 通过 `import { io } from './index.js'` 的 live binding 获取。
 * @param server 已挂载 express app 的 HTTP 服务器
 */
export function initWebSocket(server: HttpServer): void {
  io = new Server(server, {
    // CORS 来源由 CORS_ORIGIN 环境变量控制，生产环境应收紧为具体域名避免跨域滥用
    cors: { origin: config.corsOrigin, methods: ['GET', 'POST'] },
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
}

export { io };
