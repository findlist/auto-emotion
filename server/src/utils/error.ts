// server/src/utils/error.ts
// 业务错误类定义

// 错误码枚举
export enum ErrorCode {
  BAD_REQUEST = 1001,
  UNAUTHORIZED = 1002,
  FORBIDDEN = 1003,
  NOT_FOUND = 1004,
  CONFLICT = 1005,
  INTERNAL_ERROR = 1006,
  VALIDATION_ERROR = 1007,
  RATE_LIMIT = 1008,
}

/**
 * ErrorCode → HTTP 状态码语义映射表
 * 设计原因：原 errorHandler 用 `err.code >= 1000 ? 400 : err.code` 把所有 AppError
 * 统一降级为 400，导致前端 http.ts 依赖 HTTP 401 触发的「清 token + 跳登录」逻辑
 * 永不生效（UNAUTHORIZED 实际返回 400）。按 ErrorCode 语义映射到对应 HTTP 状态码，
 * 使 HTTP 层语义与业务码一致，前端可基于 HTTP 状态码做差异化处理（401 跳登录、429 限流提示等）。
 * VALIDATION_ERROR 保持 400 与 BAD_REQUEST 一致，避免前端需区分 400/422 增加复杂度。
 */
const ERROR_CODE_HTTP_STATUS: Record<ErrorCode, number> = {
  [ErrorCode.BAD_REQUEST]: 400,
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.RATE_LIMIT]: 429,
};

/** 将 ErrorCode 映射为对应的 HTTP 状态码，未知码兜底 400 */
export function errorCodeToHttpStatus(code: ErrorCode): number {
  return ERROR_CODE_HTTP_STATUS[code] ?? 400;
}

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly errors?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}