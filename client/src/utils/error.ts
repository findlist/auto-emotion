// client/src/utils/error.ts
// 通用错误兜底工具：与 server/src/utils/error.ts 对齐，
// 统一前端 catch (err) 中 unknown → string 的消息提取逻辑。

/**
 * 从 unknown 类型异常中提取消息字符串，按优先级回退兜底
 *
 * 设计原因：
 * 1. 前端 catch (err) 中 err 为 unknown，散落的 `(err as Error).message || 'XXX失败'` 类型断言风险高
 *    （err 实际可能是 axios 拦截器 reject 的 ErrorResponse 对象，非 Error 实例但带 message 字段）
 * 2. 扩展支持 ErrorResponse 对象后，可消除业务层的 `err as Error` 类型断言，
 *    同时修正 lobby.tsx 等页面原有 getErrorMessage 调用对 ErrorResponse 取兜底文案导致业务消息丢失的问题
 *    （原实现仅判 `err instanceof Error`，对 ErrorResponse 对象直接回退 defaultMsg）
 *
 * 优先级：Error 实例 message → 带.message 字段对象（ErrorResponse）的 message（空字符串兜底）→ defaultMsg
 *
 * 使用示例：
 *   try { await joinRoom(); }
 *   catch (err) { setError(getErrorMessage(err, '加入房间失败')); }
 */
export function getErrorMessage(err: unknown, defaultMsg: string): string {
  // Error 实例优先：保留原生异常语义，避免误读业务对象的 message 字段
  if (err instanceof Error) return err.message;
  // 兼容 axios 拦截器 reject 的 ErrorResponse 对象（非 Error 实例但带 message 字段）
  // 设计原因：http.ts 拦截器对业务错误（code != 200）与网络错误统一 reject ErrorResponse，
  // 业务层无法用 instanceof Error 识别，需读取 message 字段拿到业务文案
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const msg = (err as { message: unknown }).message;
    // 业务 message 可能为空字符串（如网络错误兜底场景），空时回退 defaultMsg 保持原 `|| 'XXX失败'` 语义
    return typeof msg === 'string' && msg.length > 0 ? msg : defaultMsg;
  }
  return defaultMsg;
}
