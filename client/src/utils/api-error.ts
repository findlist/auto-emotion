import { showToast } from '@/utils/toast';
import type { ErrorResponse } from '@/types/api';
import type { ToastType } from '@/components/Toast';

interface ApiErrorToastConfig {
  type: ToastType;
  fallback: string;
}

/**
 * HTTP 状态码 → Toast 类型与兜底文案映射
 * 设计原因：后端通过 errorCode→HTTP 状态码语义映射（UNAUTHORIZED→401、FORBIDDEN→403 等），
 * 前端按 HTTP 语义差异化选择 Toast 类型，避免所有错误统一用 error 类型：
 * - 403/409/422/429 用 warning：用户可理解的业务冲突或限流，非系统故障
 * - 404 用 info：资源不存在属信息性提示，非操作错误
 * - 500+/网络错误 用 error：真实系统故障，需用户感知严重性
 */
const HTTP_STATUS_TOAST_MAP: Record<number, ApiErrorToastConfig> = {
  403: { type: 'warning', fallback: '权限不足' },
  404: { type: 'info', fallback: '资源不存在' },
  409: { type: 'warning', fallback: '操作冲突，请刷新后重试' },
  422: { type: 'warning', fallback: '输入信息有误' },
  429: { type: 'warning', fallback: '操作过于频繁，请稍后再试' },
};

/**
 * 是否为拦截器 reject 的 ErrorResponse 对象
 * 设计原因：拦截器 reject 的是普通对象（非 Error 实例），业务层 catch (err) 中 err 为 unknown，
 * 需类型守卫收敛后才能安全读取 httpStatus/message，避免 TS 报错
 */
function isErrorResponse(err: unknown): err is ErrorResponse {
  return typeof err === 'object' && err !== null && 'message' in err;
}

/**
 * 根据 HTTP 状态码差异化提示 API 错误
 * - 优先使用后端返回的业务 message（如「金币不足」「需要等级 10」），为空时用 fallbackMessage 或状态码兜底文案
 * - 401 不弹 Toast：http.ts 拦截器已清 token + 跳登录页，由登录页接管错误提示，避免重复弹窗
 * - err 参数为 unknown，兼容业务层 catch (err) 模式，调用方无需类型断言
 *
 * 使用示例：
 *   try { await shopApi.buy(id); }
 *   catch (err) { showApiError(err, '购买失败'); }
 */
export function showApiError(err: unknown, fallbackMessage?: string): void {
  // 非 ErrorResponse（如代码 bug 抛 Error）兜底用 error 类型
  if (!isErrorResponse(err)) {
    showToast('error', fallbackMessage || '操作失败');
    return;
  }

  const httpStatus = err.httpStatus;

  // 401 已跳登录页，不弹 Toast 避免重复提示
  if (httpStatus === 401) return;

  // 5xx 服务器错误或网络错误（httpStatus undefined 表示无 response，如断网/超时）
  if (httpStatus === undefined || httpStatus >= 500) {
    showToast('error', err.message || fallbackMessage || '网络异常，请检查连接');
    return;
  }

  // 4xx 客户端错误：按映射表选类型，未映射的状态码兜底 error
  const config = HTTP_STATUS_TOAST_MAP[httpStatus];
  const message = err.message || fallbackMessage || config?.fallback || '操作失败';
  showToast(config?.type ?? 'error', message);
}
