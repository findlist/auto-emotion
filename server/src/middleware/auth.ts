// server/src/middleware/auth.ts
// JWT 验证 + Redis 黑名单校验

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import redis from '../config/redis.js';
import { ErrorCode, AppError } from '../utils/error.js';

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
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthPayload;
    req.user = payload;
    next();
  } catch {
    throw new AppError(ErrorCode.UNAUTHORIZED, '无效的认证令牌');
  }
}