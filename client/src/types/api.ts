/**
 * 统一响应结构（与后端 project-spec.md 对齐）
 */
export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

/**
 * 分页响应结构
 */
export interface PageResponse<T> {
  code: number;
  message: string;
  data: {
    list: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasNext: boolean;
  };
}

/**
 * 错误响应结构
 * - code: 业务错误码（后端 AppError.ErrorCode，如 1001/1002）或 HTTP 状态码兜底
 * - httpStatus: HTTP 状态码（401/403/404/409/429/500 等），网络错误时为 undefined
 *   设计原因：与 code 分离，便于前端按 HTTP 语义做差异化提示（401 跳登录、403 warning、500 error）
 */
export interface ErrorResponse {
  code: number;
  message: string;
  httpStatus?: number;
  errors?: Array<{ field: string; message: string }>;
}
