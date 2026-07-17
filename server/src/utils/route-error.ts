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

/**
 * 统一 POST/DELETE 路由 catch 块错误处理：强制 HTTP 400，不透传 AppError.code。
 *
 * 设计原因：与 routeError（GET 路由：500 兜底 + AppError 透传）形成对照。
 * POST/DELETE 路由约定业务异常（参数/状态校验类，如"金币不足""宠物不存在""技能未解锁"）
 * 统一降级为 HTTP 400，避免 5xx 误报并保持 POST 异常路径语义稳定。
 *
 * 抽取前 9 个 routes 文件 17 处 catch 块重复两行模板：
 *   const msg = getErrorMessage(err, 'XXX失败'); fail(res, 400, msg);
 *
 * 不透传 AppError.code 是有意设计：POST 异常测试断言固定期望 HTTP 400（如 pets/skills
 * 测试中 service mock reject Error 实例时断言 status === 400），透传会破坏现有契约。
 */
export function routeBusinessError(res: Response, err: unknown, fallbackMessage: string): void {
  fail(res, 400, getErrorMessage(err, fallbackMessage));
}
