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
  const blacklisted = await redis.get(`blacklist:${token}`);
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