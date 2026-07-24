// server/src/utils/param.ts
// 路由参数解析工具：统一 Express 路由参数的整数 ID、字符串参数、分页参数与请求体校验逻辑

import { Response } from 'express';
import { ZodSchema } from 'zod';
import { fail } from './response.js';

/**
 * 解析路由参数为整数 ID
 *
 * 设计原因：Express 路由参数类型为 string | string[]，routes 层多处重复
 * Array.isArray 三元 + parseInt + isNaN 三段式校验。提取后统一参数解析风格，
 * 消除复制粘贴导致的字段名/文案不一致风险，降低新增路由的复制成本。
 *
 * @param value 路由参数值（req.params.xxx）
 * @returns 解析后的整数 ID，无效时返回 NaN（调用方配合 isNaN 判断返回 400）
 */
export function parseIdParam(value: string | string[] | undefined): number {
  // 显式处理 undefined，避免 parseInt(undefined) 的隐式行为，语义更清晰
  if (value === undefined) return NaN;
  const str = Array.isArray(value) ? value[0] : value;
  return parseInt(str, 10);
}

/**
 * 提取路由参数的首个字符串值
 *
 * 设计原因：与 parseIdParam 对应的字符串版本，处理 UUID、roomId、枚举类型等
 * 非数字路由参数。Express 路由参数类型为 string | string[]，routes 层多处重复
 * Array.isArray 三元或直接 `as string` 类型断言。提取后统一参数收窄风格，
 * 消除 as string 类型断言在运行时 undefined 输入下的安全隐患。
 *
 * @param value 路由参数值（req.params.xxx）
 * @returns 首个字符串值，undefined/空数组时返回空字符串（调用方配合 !value 判断返回 400）
 */
export function firstParam(value: string | string[] | undefined): string {
  if (value === undefined) return '';
  return Array.isArray(value) ? (value[0] ?? '') : value;
}

/**
 * 分页解析选项
 *
 * 设计原因：不同业务场景的默认每页条数不同（榜单 20、战绩 10），
 * 通过 options 显式注入默认值，避免工具函数被业务默认值耦合。
 */
export interface PaginationOptions {
  /** 默认页码，缺省 1 */
  defaultPage?: number;
  /** 默认每页条数，缺省 20 */
  defaultPageSize?: number;
}

export interface Pagination {
  page: number;
  pageSize: number;
}

/**
 * 解析路由参数为整数 ID 并在失败时直接发送 400 响应
 *
 * 设计原因：tasks.ts / achievements.ts 的 `/:id/claim` 路由重复以下 5 行样板：
 *   const XId = parseIdParam(req.params.id);
 *   if (isNaN(XId)) { fail(res, 400, '无效的X ID'); return; }
 * 抽取后调用方仅需两行：解析与校验合一，消除"无效的X ID"文案漂移风险，
 * 新增路由时复制粘贴不会引入 400/422 状态码或文案变体。
 * 与 parseIdParam 并行不冲突：parseIdParam 返回 NaN 由调用方自主处理（保留灵活性），
 * parseIdOrFail 是 fail-fast 版本（适用 400 路径参数场景）。
 *
 * @param value 路由参数值（req.params.xxx）
 * @param res Express 响应对象，解析失败时直接发送 400 响应
 * @param message 失败响应文案（如"无效的任务ID"）
 * @returns 解析成功返回整数 ID，失败返回 null（调用方配合 if (X === null) return 判断）
 */
export function parseIdOrFail(
  value: string | string[] | undefined,
  res: Response,
  message: string
): number | null {
  const id = parseIdParam(value);
  if (Number.isNaN(id)) {
    fail(res, 400, message);
    return null;
  }
  return id;
}

/**
 * 解析 Express 查询参数中的分页字段
 *
 * 设计原因：routes 层 6 处重复 `parseInt(req.query.page as string, 10) || N` 两行样板，
 * 各路由默认 pageSize 不一致（榜单 20、战绩 10），复制粘贴易引入默认值漂移。
 * 提取后通过 options 注入业务默认值，保持 `parseInt || default` 原语义（NaN/0 兜底）。
 *
 * @param query Express 请求查询参数对象（req.query）
 * @param options 业务自定义默认值
 * @returns 规范化后的分页参数
 */
export function parsePagination(
  query: Record<string, unknown>,
  options: PaginationOptions = {}
): Pagination {
  const { defaultPage = 1, defaultPageSize = 20 } = options;
  // 保留 parseInt + falsy 兜底原语义（NaN/0 均回退到默认值），仅消除重复样板
  const rawPage = parseInt(query.page as string, 10);
  const rawPageSize = parseInt(query.pageSize as string, 10);
  return {
    page: rawPage || defaultPage,
    pageSize: rawPageSize || defaultPageSize,
  };
}

/**
 * 从 pg 查询结果行中解析 COUNT 聚合值
 *
 * 设计原因：service 层多处重复 `parseInt(xxx.rows[0].count, 10)` 单行样板，
 * 且不同业务别名不一致（4 处用 `as count`、1 处用 `as total`），复制粘贴
 * 易引入字段名/进制参数漂移。提取后通过 field 参数兼容两种别名，
 * 统一 service 层行数统计模式。
 *
 * @param row pg 查询结果的首行（xxx.rows[0]）
 * @param field 聚合字段名，缺省 'count'，传 'total' 兼容 leaderboard 模式
 * @returns 解析后的整数行数（pg COUNT(*) 返回 string，parseInt 转为 number）
 */
export function parseCount(
  row: Record<string, unknown>,
  field: string = 'count'
): number {
  // pg COUNT(*) 默认返回 string，parseInt 兼容 string/number 输入；
  // 字段缺失或类型异常时 parseInt 返回 NaN，调用方按业务语义判断（> 0 / 直接使用）
  return parseInt(row[field] as string, 10);
}

/**
 * 校验请求体并自动发送 422 失败响应
 *
 * 设计原因：routes 层多处重复 `const parsed = schema.safeParse(req.body);
 * if (!parsed.success) { fail(res, 422, '参数校验失败', parsed.error.issues); return; }`
 * 4 行样板（idle.ts 3 处 + ai.ts 1 处），状态码 422、文案 "参数校验失败"、errors 透传
 * 三要素需保持一致。提取为 helper 后调用方仅需两行：
 *   `const parsed = parseBody(schema, req.body, res);`
 *   `if (!parsed) return;`
 * 避免新增路由时复制粘贴导致文案漂移（如 "参数错误" / "校验失败" 等变体）。
 *
 * 注意：仅适用于 422 参数校验场景。生成结果校验等非 422 场景（如 ai.ts 怪兽配置生成
 * 异常返回 500）应保留原 safeParse + fail 写法，避免强行统一导致语义混淆。
 *
 * @param schema zod schema 实例
 * @param body 请求体（req.body）
 * @param res Express 响应对象，校验失败时直接发送 422 响应
 * @returns 校验成功返回 data（类型 T 由 schema 推断），失败返回 null（调用方配合 if (!parsed) return 判断）
 */
export function parseBody<T>(
  schema: ZodSchema<T>,
  body: unknown,
  res: Response
): T | null {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    fail(res, 422, '参数校验失败', parsed.error.issues);
    return null;
  }
  return parsed.data;
}
