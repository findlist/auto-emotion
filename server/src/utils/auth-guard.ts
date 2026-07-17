// server/src/utils/auth-guard.ts
// 路由 handler 鉴权兜底工具：消除 12 个 routes 文件共 34 处重复的未授权检查模板

import type { Response } from 'express';
import { fail } from './response.js';
import type { AuthPayload } from '../middleware/auth.js';

/**
 * 路由 handler 鉴权兜底：检查 req.user 是否存在，不存在则响应 401 并返回 false。
 *
 * 设计原因：routes 层 12 个文件共 34 处重复以下模板：
 *   const user = req.user;
 *   if (!user) { fail(res, 401, '未授权'); return; }
 * 抽取消除重复并保证 401 响应一致性。返回 `user is AuthPayload` 类型守卫，
 * 调用方 `const user = req.user; if (!requireUser(res, user)) return;` 后
 * TypeScript 自动收窄 user 类型为 AuthPayload，避免后续 `user.userId` 访问报错。
 *
 * 边界：仅消除鉴权样板，不影响鉴权语义（响应码 401 + 文案"未授权"与原模板完全等价）。
 */
export function requireUser(res: Response, user: unknown): user is AuthPayload {
  if (!user) {
    fail(res, 401, '未授权');
    return false;
  }
  return true;
}
