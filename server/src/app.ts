import express from 'express';
import type { Request, Response } from 'express';
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
// 引入挂机路由
import idleRouter from './routes/idle.js';
// 引入 AI 路由
import aiRouter from './routes/ai.js';
// 引入匹配路由
import matchRouter from './routes/match.js';
// 引入房间路由
import roomRouter from './routes/room.js';
// 引入 WebSocket（启动 HTTP + WS 服务器）
import './websocket/index.js';
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

// 启动时验证数据库连接
testConnection();
// 启动时连接 Redis
redis.connect();

const app = express();
// 端口从 config 读取（已在 config 中完成解析与默认值处理）

// JSON 解析中间件
app.use(express.json());

// CORS - 开发期允许所有来源
app.use(cors());

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

// 注意：HTTP 服务器已在 websocket/index.ts 中启动（通过 httpServer.listen）
// 此处不再调用 app.listen，避免端口冲突
