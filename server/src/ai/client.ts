// server/src/ai/client.ts
// AI 服务封装：调用 OpenAI 兼容 API 生成内容
// 含网络错误/5xx 指数退避重试机制（4xx 客户端错误不重试，鉴权/参数错误不可恢复）

import axios from 'axios';
import { ErrorCode, AppError } from '../utils/error.js';

// 最大重试次数（首次调用 + 重试次数 = 总尝试次数）
const MAX_RETRIES = 2;
// 重试基础退避时长（毫秒），实际退避 = BASE * 2^attempt（500ms, 1000ms）
const RETRY_BASE_DELAY = 500;

/**
 * axios 抛错的最小可用形态
 * 设计原因：isRetryableError 与 chat 末尾错误分类都依赖 code/response.status 两个字段，
 * 抽取类型别名统一签名，避免两处 `as { code?: string; response?: { status?: number } }` 重复断言
 */
type AxiosErrorLike = { code?: string; response?: { status?: number } };

/**
 * 将 unknown 错误断言为 axios 错误形态
 * 设计原因：仅做类型收窄不改变运行时行为；axios 抛出的错误实际包含更多字段，但本模块只用到这两个
 */
function asAxiosError(err: unknown): AxiosErrorLike {
  return err as AxiosErrorLike;
}

/**
 * 判断错误是否可重试
 * 设计原因：仅对 transient 故障（网络抖动、服务端临时过载）重试，
 * 4xx 客户端错误（鉴权失败/参数错误/配额耗尽）重试无意义且浪费配额。
 */
function isRetryableError(err: unknown): boolean {
  const axiosError = asAxiosError(err);
  // 网络层错误：超时、DNS 失败、连接重置等
  if (['ECONNABORTED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET', 'EAI_AGAIN'].includes(axiosError.code ?? '')) {
    return true;
  }
  // 5xx 服务端错误：临时过载/网关错误，重试有望恢复
  const status = axiosError.response?.status;
  return typeof status === 'number' && status >= 500 && status < 600;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 调用 AI chat 接口生成文本
 * @param prompt 用户输入的 prompt
 * @param systemPrompt 系统级提示词（可选）
 * @returns AI 返回的文本内容
 */
export async function chat(prompt: string, systemPrompt?: string): Promise<string> {
  const apiKey = process.env.AI_API_KEY;
  const baseURL = process.env.AI_BASE_URL || 'https://api.openai.com/v1';

  if (!apiKey) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, 'AI_API_KEY 未配置');
  }

  const messages: { role: string; content: string }[] = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });

  const requestBody = {
    model: 'gpt-4o-mini',
    messages,
    temperature: 0.8,
    max_tokens: 500,
  };
  const requestOptions = {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    timeout: 10000,
  };

  let lastErr: unknown;
  // 重试循环：首次 + MAX_RETRIES 次重试，共 MAX_RETRIES+1 次尝试
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.post(`${baseURL}/chat/completions`, requestBody, requestOptions);
      return response.data.choices[0]?.message?.content || '';
    } catch (err) {
      lastErr = err;
      // 最后一次尝试或不可重试错误直接跳出，抛统一错误
      if (attempt === MAX_RETRIES || !isRetryableError(err)) {
        break;
      }
      // 指数退避：500ms * 2^attempt（500ms, 1000ms），避免压垮已故障的上游服务
      await sleep(RETRY_BASE_DELAY * Math.pow(2, attempt));
    }
  }

  // 统一错误分类（与原逻辑保持兼容，便于上层针对性降级）
  const axiosError = asAxiosError(lastErr);
  if (axiosError.code === 'ECONNABORTED' || axiosError.response?.status === 504) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, 'AI 服务响应超时');
  }
  throw new AppError(ErrorCode.INTERNAL_ERROR, 'AI 服务调用失败');
}
