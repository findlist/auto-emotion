import axios, { AxiosError, type AxiosInstance, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import type { ApiResponse, ErrorResponse } from '@/types/api';

/**
 * 全局 axios 实例
 * - 请求拦截：自动注入 JWT token
 * - 响应拦截：统一解包 ApiResponse，错误时抛出业务错误
 * - 401 无感刷新：access token 过期时自动用 refreshToken 调 /auth/refresh 获取新 token 并重发请求
 */
const http: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

// 请求拦截：注入 token
http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

// ============ Token 无感刷新机制 ============
// 并发 401 时合并刷新：首个请求触发 refresh，其余请求挂起等待新 token 后重发
// 设计原因：避免并发刷新导致 refreshToken 被多次使用引发后端冲突，且减少 refresh 接口压力
let isRefreshing = false;
let pendingRequests: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

/** 清空挂起队列并 reject 所有等待请求（refresh 失败时调用） */
function rejectPendingRequests(err: unknown): void {
  pendingRequests.forEach(({ reject }) => reject(err));
  pendingRequests = [];
}

/** 用 refreshToken 调 /api/auth/refresh 换取新 access token，绕过 http 实例避免拦截器递归 */
async function refreshAccessToken(): Promise<string> {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) throw new Error('无 refreshToken');

  // 设置 10 秒超时，避免 refresh 接口 hang 住时所有 401 请求永久挂起
  // 设计原因：refresh 是无感刷新的关键路径，超时后应快速失败触发清登录态跳转，
  // 而非让用户无限等待。10 秒略大于一般接口超时（15s axios timeout 用于业务请求，
  // refresh 是单一职责的轻量接口，10s 足够覆盖正常响应）
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`refresh 失败: ${res.status}`);

    // 后端返回 ApiResponse<{ token: string }>，解包取 data.token
    // 成功条件与响应拦截器一致（200 或 201），避免 refresh 接口返回 201 时被误判为失败
    const body = (await res.json()) as ApiResponse<{ token: string }>;
    if ((body.code !== 200 && body.code !== 201) || !body.data?.token) {
      throw new Error(body.message || 'refresh 业务失败');
    }
    return body.data.token;
  } finally {
    // 无论成功失败都清理定时器，避免内存泄漏（abort 后定时器仍在事件队列中）
    clearTimeout(timeoutId);
  }
}

/** 清登录态并跳首页（refresh 不可恢复时调用，刷新后自动游客重新登录） */
function clearAuthAndRedirectLogin(): void {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  if (window.location.pathname !== '/') {
    window.location.href = '/';
  }
}

// 响应拦截：解包 ApiResponse，返回 data 字段；401 自动刷新重发
http.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    const body = response.data;
    if (body.code === 200 || body.code === 201) {
      // 把 data 字段挂到 response.data 上，供调用方直接取
      response.data = body.data as never;
      return response;
    }
    // 业务错误：抛出
    const err: ErrorResponse = {
      code: body.code,
      message: body.message,
      errors: (body as ErrorResponse).errors,
    };
    return Promise.reject(err);
  },
  async (error: AxiosError<ErrorResponse>) => {
    const httpStatus = error.response?.status;
    const originalRequest = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;

    // 401 无感刷新：有 refreshToken + 未重试 + 非 refresh 请求自身（避免递归）
    // 设计原因：access token 过期时后端返回 401，前端用 refreshToken 静默换新 token 重发请求，
    // 用户无感知。refreshToken 也无效时才走清登录态跳登录兜底。
    if (
      httpStatus === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/refresh') &&
      !originalRequest.url?.includes('/auth/login') &&
      localStorage.getItem('refreshToken')
    ) {
      // 并发 401 合并：首个请求触发 refresh，其余请求挂起等待
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingRequests.push({
            resolve: (token: string) => {
              originalRequest.headers.set('Authorization', `Bearer ${token}`);
              // 标记 _retry 防止重发后再次 401 时无限递归刷新
              // 设计原因：队列请求用新 token 重发，若新 token 也无效（极少见），应走普通 401 路径清登录态而非再次触发刷新
              originalRequest._retry = true;
              resolve(http(originalRequest));
            },
            reject,
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;
      try {
        const newToken = await refreshAccessToken();
        localStorage.setItem('token', newToken);

        // 重发挂起队列
        pendingRequests.forEach(({ resolve }) => resolve(newToken));
        pendingRequests = [];
        isRefreshing = false;

        // 重发当前请求
        // 设计原因：用 http.request 而非 http(config) 调用形式，避免依赖 axios 实例可调用性
        // （axios.create 返回的实例本身是函数，但测试 mock 中 fakeHttp 是普通对象）
        originalRequest.headers.set('Authorization', `Bearer ${newToken}`);
        return http.request(originalRequest);
      } catch (refreshError) {
        // refresh 失败：清挂起队列 + 清登录态 + 跳登录
        rejectPendingRequests(refreshError);
        pendingRequests = [];
        isRefreshing = false;
        clearAuthAndRedirectLogin();
        const err: ErrorResponse = {
          code: 401,
          message: '登录已过期，请重新登录',
          httpStatus: 401,
        };
        return Promise.reject(err);
      }
    }

    // 普通 401（无 refreshToken / refresh 请求自身 401 / 已重试过）→ 清登录态跳首页
    // 排除 login/register 请求：游客自动登录时 login 401 是预期行为（账号未注册），
    // 不应触发页面跳转，错误直接 reject 给 autoGuestLogin 的 catch 处理
    if (
      httpStatus === 401 &&
      !originalRequest?.url?.includes('/auth/login') &&
      !originalRequest?.url?.includes('/auth/register')
    ) {
      clearAuthAndRedirectLogin();
    }

    const err: ErrorResponse = {
      code: error.response?.data?.code ?? 500,
      // 优先用后端返回的业务 message（如「金币不足」「需要等级 10」），兜底用 axios 原始错误
      message: error.response?.data?.message ?? error.message,
      httpStatus,
      errors: error.response?.data?.errors,
    };
    return Promise.reject(err);
  }
);

export default http;
