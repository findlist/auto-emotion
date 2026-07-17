// server/src/utils/param.ts
// 路由参数解析工具：统一 Express 路由参数的整数 ID、字符串参数与分页参数解析逻辑

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
