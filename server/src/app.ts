import express from 'express';
import type { Request, Response } from 'express';
import { createServer } from 'http';
import cors from 'cors';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
// 引入 config：import 即执行启动校验（缺失必填环境变量时进程退出）
import config from './config/index.js';
void config; // 仅用于启动校验
import { testConnection } from './config/database.js';
import redis from './config/redis.js';
// 引入鉴权中间件（用于在 app.ts 统一挂载到受保护路由前缀）
import { authMiddleware } from './middleware/auth.js';
// 引入全局错误处理中间件（按 AppError 的 ErrorCode 映射 HTTP 状态码，替代原统一降级 500）
import { errorHandler } from './middleware/error-handler.js';
// 引入 WebSocket 初始化函数（io 实例在 initWebSocket 内创建，gracefulShutdown 通过 live binding 获取）
import { initWebSocket, io } from './websocket/index.js';
// 引入数据库连接池（gracefulShutdown 释放资源时使用）
import pool from './config/database.js';
// 引入挂机路由
import idleRouter from './routes/idle.js';
// 引入 AI 路由
import aiRouter from './routes/ai.js';
// 引入匹配路由
import matchRouter from './routes/match.js';
// 引入房间路由
import roomRouter from './routes/room.js';
// 引入认证路由
import authRouter from './routes/auth.js';
// 引入用户路由
import userRouter from './routes/user.js';
// 引入战绩路由
import gameRecordRouter from './routes/game-record.js';
// 引入武器路由
import weaponRouter from './routes/weapons.js';
// 引入技能路由
import skillRouter from './routes/skills.js';
// 引入宠物路由
import petRouter from './routes/pets.js';
// 引入结算路由
import settleRouter from './routes/settle.js';
// 引入好友路由
import friendRouter from './routes/friends.js';
// 引入排行榜路由
import leaderboardRouter from './routes/leaderboard.js';
// 引入任务路由
import taskRouter from './routes/tasks.js';
// 引入成就路由
import achievementRouter from './routes/achievements.js';
// 引入赛季通行证路由
import seasonPassRouter from './routes/season-pass.js';
// 引入商城路由
import shopRouter from './routes/shop.js';

const app = express();
// 端口从 config 读取（已在 config 中完成解析与默认值处理）

// trust proxy：生产环境通常位于 Nginx/CDN 后，未设置时 req.ip 会取代理 IP 而非真实客户端 IP
// 设计原因：限流中间件依赖 req.ip 区分用户，未启用 trust proxy 时所有请求 IP 都显示为代理服务器
// 导致限流把所有用户当作同一 IP，单用户限流失效或全员被误限；'loopback, linklocal, uniquelocal'
// 信任本机/内网代理（生产 Nginx 在同 K8s 集群内），公网 IP 不被自动信任避免伪造
app.set('trust proxy', 'loopback, linklocal, uniquelocal');

// JSON 解析中间件
app.use(express.json());

// CORS - 来源由 CORS_ORIGIN 环境变量控制，与 WebSocket 侧 config.corsOrigin 保持一致
// 设计原因：原 cors() 无参数允许所有来源，与 WebSocket 配置不一致；
// 生产环境收紧 CORS_ORIGIN 后 WebSocket 已限制但 HTTP 仍允许任意来源，形成安全绕过
app.use(cors({ origin: config.corsOrigin }));

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: '情绪爆破局 API',
      version: '1.0.0',
      description: '放置挂机养成 + 多人乱斗解压网游 API 文档',
    },
    servers: [{ url: '/api' }],
  },
  apis: ['./src/routes/*.ts'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// 健康检查路由
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    code: 200,
    message: 'ok',
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
    },
  });
});

// 挂机路由
app.use('/api/idle', idleRouter);

// AI 路由
app.use('/api/ai', aiRouter);

// 认证路由
app.use('/api/auth', authRouter);

// 用户路由
app.use('/api/users', userRouter);

// 战绩路由
app.use('/api/game-records', gameRecordRouter);

// 以下业务路由均需登录鉴权：在路由前缀统一挂载 authMiddleware，由其校验 JWT 并注入 req.user，
// 供 handler 内部读取 userId。idle/users/game-records 已在路由文件内逐路由挂载，此处不重复挂载避免双重校验。
// auth（注册/登录/刷新）、ai（怪兽生成）为公开路由，不挂载鉴权。
// 武器路由
app.use('/api/weapons', authMiddleware, weaponRouter);

// 技能路由
app.use('/api/skills', authMiddleware, skillRouter);

// 宠物路由
app.use('/api/pets', authMiddleware, petRouter);

// 结算路由
app.use('/api/settle', authMiddleware, settleRouter);

// 好友路由
app.use('/api/friends', authMiddleware, friendRouter);

// 排行榜路由（/power /battle /speed 公开，/friends /:type/me 在路由内逐路由挂载鉴权）
app.use('/api/leaderboard', leaderboardRouter);

// 任务路由
app.use('/api/tasks', authMiddleware, taskRouter);

// 成就路由
app.use('/api/achievements', authMiddleware, achievementRouter);

// 赛季通行证路由
app.use('/api/season-pass', authMiddleware, seasonPassRouter);

// 商城路由
app.use('/api/shop', authMiddleware, shopRouter);

// 匹配路由
app.use('/api/match', authMiddleware, matchRouter);

// 房间路由
app.use('/api/room', authMiddleware, roomRouter);

// 全局错误处理中间件：按 AppError 的 ErrorCode 映射 HTTP 状态码（401/403/404/409/429 等），
// 替代原统一降级 500 的内联处理。Express 5 会将 async 中间件抛出的错误自动传递至此，
// 故 authMiddleware/rateLimit 抛出的 AppError 可被正确映射（如 UNAUTHORIZED → 401）。
app.use(errorHandler);

// 创建 HTTP 服务器并传入 express app 作为请求处理器
// 设计原因：原 websocket/index.ts 独立 createServer() 未传 app，生产环境 HTTP API 请求无 handler。
// 此处 createServer(app) 确保 Express 路由处理普通 HTTP 请求，Socket.IO 附加到同一服务器处理 WebSocket 升级。
const httpServer = createServer(app);

// 初始化 WebSocket 服务器：附加到 httpServer，与 Express 共享端口
initWebSocket(httpServer);

/**
 * 启动 HTTP + WebSocket 服务器
 * 设计原因：生产环境需等待 DB/Redis 就绪后再 listen，避免首请求因依赖未就绪失败；
 * 测试环境（VITEST=true）直接 listen，避免 await 真实 DB/Redis 连接超时拖慢测试。
 */
async function startServer(): Promise<void> {
  // VITEST 由 vitest 运行时自动设置，测试环境跳过依赖连接
  if (process.env.VITEST !== 'true') {
    try {
      await Promise.all([testConnection(), redis.connect()]);
    } catch (err) {
      console.error('依赖服务启动失败:', (err as Error).message);
      process.exit(1);
    }
  }
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
}

void startServer();

/**
 * 优雅关闭：收到终止信号时按序释放资源
 * 设计原因：生产环境容器编排（Docker/K8s）发送 SIGTERM 后会有宽限期，
 * 顺序关闭 io → httpServer → pool → redis，可让房间内玩家收到 disconnect 通知，
 * 未完成请求正常响应，避免连接粗暴断开导致脏数据。
 */
// shuttingDown 标记：收到 SIGTERM/SIGINT 后置 true，中间件据此拒绝新请求快速失败
// 设计原因：未标记时优雅关闭期间仍接收新请求，httpServer.close 会等待所有 keep-alive
// 连接释放后才退出，可能导致进程长时间卡在退出阶段超出 K8s 宽限期被 SIGKILL 强杀
let shuttingDown = false;
export function isShuttingDown(): boolean {
  return shuttingDown;
}

async function gracefulShutdown(signal: NodeJS.Signals): Promise<void> {
  // 防止重复触发：SIGTERM 后 K8s 可能再发 SIGINT，第二次进入会重复执行 io.close 等
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`收到 ${signal}，开始优雅关闭...`);
  // 1. 关闭 Socket.IO：停止接受新连接并断开现有（触发客户端 reconnect 逻辑）
  // 设计原因：io.close 是异步操作（需断开所有客户端连接），原实现未 await 直接调用 httpServer.close，
  // 可能导致 WebSocket 连接占用端口引发 httpServer.close 卡住；用 Promise 包装确保完全关闭后再继续
  if (io) {
    await new Promise<void>((resolve) => {
      io.close(() => resolve());
    });
  }
  // 2. 关闭 HTTP 服务器：停止监听端口
  // 设计原因：httpServer.close 是回调 API，未 await 会在端口未释放时就执行 pool.end/redis.quit，
  // 新进程启动时可能因端口仍被占用而 listen 失败；用 Promise 包装确保端口释放完成
  // 加超时兜底：连接保持 keep-alive 时 close 会等到所有连接释放，超时后强制退出避免进程卡死
  await new Promise<void>((resolve) => {
    const forceExitTimer = setTimeout(() => {
      console.warn('httpServer.close 超时 10s，强制继续关闭流程');
      resolve();
    }, 10000);
    httpServer.close(() => {
      clearTimeout(forceExitTimer);
      resolve();
    });
  });
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

// httpServer 错误处理：未监听时 EADDRINUSE 等错误会冒泡到进程导致 uncaughtException
// 设计原因：listen 后端口冲突、连接重置等错误需结构化日志便于排查；
// 注册 listener 防止进程因未处理 error 事件崩溃
httpServer.on('error', (err: NodeJS.ErrnoException) => {
  console.error(
    JSON.stringify({
      level: 'error',
      message: 'HTTP 服务器错误',
      error: err.message,
      code: err.code,
      timestamp: new Date().toISOString(),
    }),
  );
});

// 未捕获的 Promise rejection 兜底：避免 Node 默认行为（打印后继续）掩盖致命错误
// 设计原因：原实现依赖 defaultUnhandledRejection 行为，生产环境 async 路由抛错若无 catch 会变 unhandledRejection，
// 注册 listener 让错误显式记录便于监控告警；不在生产环境 process.exit(1) 避免单请求异常拖垮整个进程
process.on('unhandledRejection', (reason: unknown) => {
  console.error(
    JSON.stringify({
      level: 'error',
      message: '未处理的 Promise 拒绝',
      error: reason instanceof Error ? reason.message : String(reason),
      timestamp: new Date().toISOString(),
    }),
  );
});
