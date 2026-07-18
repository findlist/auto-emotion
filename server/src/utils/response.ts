// server/src/utils/response.ts
// 统一 API 响应封装：所有接口返回值需符合 ApiResponse 结构
// 注：server 端不再单独声明 ApiResponse / ApiErrorResponse 接口——
// client 端 client/src/types/api.ts 已有同结构定义并唯一被 http.ts 使用，
// server 端 success/fail 函数直接以字面量形式输出响应体，避免双源维护漂移

import { Response } from 'express';
import { ErrorCode, errorCodeToHttpStatus } from './error.js';

// 直接发送成功响应到客户端
export function success<T>(res: Response, data?: T, message = 'ok'): void {
  res.json({ code: 200, message, data });
}

// 直接发送失败响应到客户端
export function fail(
  res: Response,
  code: number,
  message = 'error',
  errors?: unknown
): void {
  // code >= 1000 视为 ErrorCode 枚举，按语义映射为对应 HTTP 状态码（与 errorHandler 一致），
  // 修复原统一降级 400 导致前端 401 拦截逻辑（清 token + 跳登录）不生效的 bug；
  // code < 1000 视为直接 HTTP 状态码原样使用（兼容路由层 fail(res, 401, ...) 等历史调用）
  const httpStatus = code >= 1000 ? errorCodeToHttpStatus(code as ErrorCode) : code;
  res.status(httpStatus).json({ code, message, errors });
}