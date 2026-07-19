// server/src/utils/route-error.ts
// 路由层统一错误处理工具

import type { Response } from 'express';
import { fail } from './response.js';
import { AppError, getErrorMessage } from './error.js';

/**
 * 统一路由 catch 块错误处理：AppError 透传错误码，普通 Error 兜底 500。
 *
 * 设计原因：routes 层 catch 块原本重复以下两种等价模板，抽取后消除重复并保证错误处理一致性：
 *   模板 A（return 模式）：
 *     if (err instanceof AppError) { fail(res, err.code, err.message); return; }
 *     fail(res, 500, getErrorMessage(err, 'XXX失败'));
 *   模板 B（if/else 模式）：
 *     if (err instanceof AppError) { fail(res, err.code, err.message); }
 *     else { const msg = getErrorMessage(err, 'XXX失败'); fail(res, 500, msg); }
 *
 * 实际使用范围（2026-07-20 核实）：13 个 routes 文件共 23 处调用，覆盖
 * achievements/friends/idle/leaderboard/match/pets/room/season-pass/settle/shop/skills/tasks/weapons。
 * 主要用于 GET 路由（AppError 透传错误码 + 500 兜底），POST/DELETE 路由改用 routeBusinessError。
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
 * 实际使用范围（2026-07-20 核实）：9 个 routes 文件共 11 处调用，覆盖
 * achievements/friends/pets/season-pass/shop/skills/tasks/weapons。
 * 典型场景为购买/领取/删除/操作类 POST 路由的 catch 块。
 *
 * 不透传 AppError.code 是有意设计：POST 异常测试断言固定期望 HTTP 400（如 pets/skills
 * 测试中 service mock reject Error 实例时断言 status === 400），透传会破坏现有契约。
 */
export function routeBusinessError(res: Response, err: unknown, fallbackMessage: string): void {
  fail(res, 400, getErrorMessage(err, fallbackMessage));
}
