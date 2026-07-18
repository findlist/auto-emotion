// server/src/middleware/auth.ts
// JWT 验证 + Redis 黑名单校验

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import redis from '../config/redis.js';
import { ErrorCode, AppError } from '../utils/error.js';
// 引入 config：复用启动校验后的 jwtSecret，避免散落 process.env.JWT_SECRET 读取
// 设计原因：config 在启动时已 assertRequired 校验过 JWT_SECRET 非空，运行时直接读取
// 减少对 process.env 的散点访问，便于后续替换为密钥管理服务
import { config } from '../config/index.js';

export interface AuthPayload {
  userId: string;
  phone: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export async function authMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError(ErrorCode.UNAUTHORIZED, '未提供认证令牌');
  }

  const token = authHeader.slice(7);

  // 检查 Redis 黑名单
  // 设计原因：Redis 故障时保持 fail-closed（拒绝请求以防已登出 token 被错误放行），
  // 但用 try/catch 包装为 AppError 使错误响应符合统一格式，避免原生 Error 泄露连接细节
  let blacklisted: string | null;
  try {
    blacklisted = await redis.get(`blacklist:${token}`);
  } catch {
    throw new AppError(ErrorCode.INTERNAL_ERROR, '认证服务暂时不可用');
  }
  if (blacklisted) {
    throw new AppError(ErrorCode.UNAUTHORIZED, '令牌已失效');
  }

  try {
    // 复用 config.jwtSecret：启动时已校验非空，避免运行时 process.env 读取散点
    const payload = jwt.verify(token, config.jwtSecret) as AuthPayload;
    req.user = payload;
    next();
  } catch {
    throw new AppError(ErrorCode.UNAUTHORIZED, '无效的认证令牌');
  }
}