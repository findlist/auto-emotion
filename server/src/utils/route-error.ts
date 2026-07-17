// server/src/utils/route-error.ts
// 路由层统一错误处理工具

import type { Response } from 'express';
import { fail } from './response.js';
import { AppError, getErrorMessage } from './error.js';

/**
 * 统一路由 catch 块错误处理：AppError 透传错误码，普通 Error 兜底 500。
 *
 * 设计原因：routes 层 4 个文件（idle/match/room/settle）共 10 处 catch 块
 * 重复以下两种等价模板，抽取后消除重复并保证错误处理一致性：
 *   模板 A（return 模式，idle/match 8 处）：
 *     if (err instanceof AppError) { fail(res, err.code, err.message); return; }
 *     fail(res, 500, getErrorMessage(err, 'XXX失败'));
 *   模板 B（if/else 模式，room/settle 2 处）：
 *     if (err instanceof AppError) { fail(res, err.code, err.message); }
 *     else { const msg = getErrorMessage(err, 'XXX失败'); fail(res, 500, msg); }
 *
 * 与全局 errorHandler 区别：errorHandler 处理 next(err) 流程（用于未捕获错误兜底），
 * routeError 用于路由内 try/catch 手动 fail（保留业务自定义兜底文案），两者并行不冲突。
 */
export function routeError(res: Response, err: unknown, fallbackMessage: string): void {
  if (err instanceof AppError) {
    fail(res, err.code, err.message);
    return;
  }
  fail(res, 500, getErrorMessage(err, fallbackMessage));
}
