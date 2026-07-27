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

/**
 * 从未知错误中提取消息，非 Error 类型时返回兜底文案
 * 设计原因：routes 层 34 处 catch 块重复 `err instanceof Error ? err.message : 'XXX失败'` 三元，
 * 统一提取为工具函数消除重复，同时保留各路由自定义兜底文案（业务语义不同）。
 */
export function getErrorMessage(err: unknown, defaultMsg: string): string {
  return err instanceof Error ? err.message : defaultMsg;
}

/**
 * zod schema 校验失败时的统一文案。
 *
 * 设计原因：middleware/validate.ts（抛 AppError 经全局 errorHandler 兜底响应）
 * 与 utils/param.ts（parseBody helper 直接 fail(res, 422, ...)）两条路径对前端展示的
 * 文案必须一致，原本散落 2 处字面量，未来调整文案需逐处搜索且易遗漏导致同类错误提示不一致。
 * 与 ErrorCode.VALIDATION_ERROR 同区域定义，确保错误码与文案单点维护。
 */
export const VALIDATION_ERROR_MSG = '参数校验失败';

/**
 * 用户不存在时的统一文案。
 *
 * 设计原因：user-service（getProfile + refreshToken）、friend-service（sendFriendRequest）、
 * season-pass-service（getCurrentSeason + claimSeasonReward）、shop-service（buyItem）、
 * utils/gold（getUserGold）共 6 处业务代码使用同一文案，原本散落 5 处字面量 +
 * user-service 本地常量，未来调整文案需逐处搜索且易遗漏导致同类错误提示不一致。
 * 与 ErrorCode.NOT_FOUND 同区域定义，确保错误码与文案单点维护；同时消除 user-service
 * 本地常量与其它 5 处字面量的分裂，统一为单点 import。
 */
export const USER_NOT_FOUND_MSG = '用户不存在';

/**
 * 角色不存在时的统一文案。
 *
 * 设计原因：idle-engine（settle + switchArea + upgradeCharacter 共 3 处）、
 * idle-service（getStatus）、skill-service（upgradeSkill）、offline-calculator（calculateOffline）、
 * routes/idle（GET /status 兜底）共 7 处业务代码使用同一文案，原本散落 7 处字面量，
 * 未来调整文案需逐处搜索且易遗漏导致同类错误提示不一致。
 * 与 ErrorCode.NOT_FOUND / USER_NOT_FOUND_MSG 同区域定义，确保错误码与文案单点维护。
 */
export const CHARACTER_NOT_FOUND_MSG = '角色不存在';

/**
 * 行存在性守卫：查询结果集为空时抛 NOT_FOUND。
 *
 * 设计原因：22 处 service 守卫重复以下三行模板：
 *   if (X.rows.length === 0) {
 *     throw new AppError(ErrorCode.NOT_FOUND, 'xxx不存在');
 *   }
 * 抽取后消除重复，集中维护 NOT_FOUND 语义，调用方变为单行 ensureFound(X.rows, 'xxx不存在')。
 *
 * 行为等价：rows.length === 0 时抛 AppError(NOT_FOUND, message)，与原 22 处完全一致。
 * 不返回值（仅守卫），调用方紧接 rows[0] 读取数据。
 *
 * 边界：仅适用于"空集即错误"的守卫场景；leaderboard-service 中"空集返回 null"的
 * 兜底语义不在抽取范围（返回值不同，强行统一会破坏 null 兜底契约）。
 *
 * @param rows 查询结果集（pg QueryResult.rows 或同类数组）
 * @param message 错误信息（业务语义，如 '角色不存在'）
 * @throws AppError(NOT_FOUND) rows 为空时抛出
 */
export function ensureFound(rows: unknown[], message: string): void {
  if (rows.length === 0) {
    throw new AppError(ErrorCode.NOT_FOUND, message);
  }
}