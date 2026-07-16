// server/src/utils/param.ts
// 路由参数解析工具：统一 Express 路由参数的整数 ID 解析逻辑

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
