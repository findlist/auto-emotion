// server/src/utils/response.ts
// 统一 API 响应封装：所有接口返回值需符合 ApiResponse 结构

import { Response } from 'express';
import { ErrorCode, errorCodeToHttpStatus } from './error.js';

// 统一响应结构
export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T | null;
}

// 错误响应结构（含校验错误明细）
export interface ApiErrorResponse extends ApiResponse<null> {
  errors?: unknown;
}

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