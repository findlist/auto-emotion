// server/src/ai/client.ts
// AI 服务封装：调用 OpenAI兼容 API 生成内容

import axios from 'axios';
import { ErrorCode, AppError } from '../utils/error.js';

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

  try {
    const messages: { role: string; content: string }[] = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });

    const response = await axios.post(
      `${baseURL}/chat/completions`,
      {
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.8,
        max_tokens: 500,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    return response.data.choices[0]?.message?.content || '';
  } catch (err) {
    const axiosError = err as { code?: string; response?: { status?: number } };
    if (axiosError.code === 'ECONNABORTED' || axiosError.response?.status === 504) {
      throw new AppError(ErrorCode.INTERNAL_ERROR, 'AI 服务响应超时');
    }
    throw new AppError(ErrorCode.INTERNAL_ERROR, 'AI 服务调用失败');
  }
}
