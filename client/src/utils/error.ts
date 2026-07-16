// client/src/utils/error.ts
// 通用错误兜底工具：与 server/src/utils/error.ts 对齐，
// 统一前端 catch (err) 中 unknown → string 的消息提取逻辑。

/**
 * 从 unknown 类型异常中提取消息，非 Error 时回退到 defaultMsg
 *
 * 设计原因：前端多处 catch 块重复 `err instanceof Error ? err.message : 'XXX失败'` 三元，
 * 与 api-error.ts 处理 ErrorResponse 对象的语义不同（后者专用于 axios 拦截器 reject 的结构化错误），
 * 此处覆盖原生 Error / 字符串 / 其他类型抛出的通用兜底场景，避免散落三元与 `err as Error` 类型断言风险。
 *
 * 使用示例：
 *   try { await joinRoom(); }
 *   catch (err) { setError(getErrorMessage(err, '加入房间失败')); }
 */
export function getErrorMessage(err: unknown, defaultMsg: string): string {
  return err instanceof Error ? err.message : defaultMsg;
}
