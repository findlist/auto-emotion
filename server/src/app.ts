import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
// 引入 config：import 即执行启动校验（缺失必填环境变量时进程退出）
import config from './config/index.js';
void config; // 仅用于启动校验
import { testConnection } from './config/database.js';
import redis from './config/redis.js';
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

// 武器路由
app.use('/api/weapons', weaponRouter);

// 技能路由
app.use('/api/skills', skillRouter);

// 宠物路由
app.use('/api/pets', petRouter);

// 结算路由
app.use('/api/settle', settleRouter);

// 好友路由
app.use('/api/friends', friendRouter);

// 排行榜路由
app.use('/api/leaderboard', leaderboardRouter);

// 任务路由
app.use('/api/tasks', taskRouter);

// 成就路由
app.use('/api/achievements', achievementRouter);

// 赛季通行证路由
app.use('/api/season-pass', seasonPassRouter);

// 商城路由
app.use('/api/shop', shopRouter);

// 匹配路由
app.use('/api/match', matchRouter);

// 房间路由
app.use('/api/room', roomRouter);

// 全局错误捕获中间件
// 注意：必须声明 4 个参数（err, req, res, next）才能被 Express 识别为错误处理中间件
// _next 前缀下划线以规避 noUnusedParameters 检查
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error(
    JSON.stringify({
      level: 'error',
      message: err.message,
      path: req.path,
      timestamp: new Date().toISOString(),
    }),
  );
  res.status(500).json({
    code: 500,
    message: 'Internal Server Error',
    data: null,
  });
});

// 注意：HTTP 服务器已在 websocket/index.ts 中启动（通过 httpServer.listen）
// 此处不再调用 app.listen，避免端口冲突
