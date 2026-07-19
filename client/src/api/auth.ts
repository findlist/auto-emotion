import http from './http';
import { unwrap } from './unwrap';
import type { LoginResult, UpdateProfilePayload, User } from '@/types/user';

/**
 * 认证与用户相关 API
 * 拦截器已将 ApiResponse 解包，response.data 即业务数据
 */
export const authApi = {
  /** 手机号注册 */
  register(payload: { phone: string; password: string; nickname: string }): Promise<LoginResult> {
    return unwrap(http.post('/auth/register', payload));
  },

  /** 手机号登录 */
  login(payload: { phone: string; password: string }): Promise<LoginResult> {
    return unwrap(http.post('/auth/login', payload));
  },

  /** 刷新 token */
  refresh(refreshToken: string): Promise<{ token: string; refreshToken: string }> {
    return unwrap(http.post('/auth/refresh', { refreshToken }));
  },

  /** 登出（access token 与 refreshToken 均加入黑名单） */
  // refreshToken 可选参数：传给后端一起黑名单，防止登出后 refreshToken 仍可换新 token
  // 注：登出无返回数据，不使用 unwrap（unwrap 仅适用于有 data 字段的响应）
  logout(refreshToken?: string): Promise<void> {
    return http.post('/auth/logout', refreshToken ? { refreshToken } : undefined).then(() => undefined);
  },
};

export const userApi = {
  /** 获取个人资料 */
  getProfile(): Promise<User> {
    return unwrap(http.get('/users/profile'));
  },

  /** 修改个人资料 */
  updateProfile(payload: UpdateProfilePayload): Promise<User> {
    return unwrap(http.put('/users/profile', payload));
  },
};
