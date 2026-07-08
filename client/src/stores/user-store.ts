import { create } from 'zustand';
import { authApi, userApi } from '@/api/auth';
import { disconnect as disconnectSocket } from '@/websocket';
import type { ErrorResponse } from '@/types/api';
import type { LoginResult, User } from '@/types/user';

/**
 * 用户状态管理
 * - 登录态持久化到 localStorage
 * - 提供 login / register / logout / fetchProfile 方法
 */
interface UserState {
  user: User | null;
  loading: boolean;
  /** restore 是否已完成，用于守卫 effect 区分"初始未恢复"与"已恢复但未登录" */
  restored: boolean;
  /** 从 localStorage 恢复登录态 */
  restore: () => Promise<void>;
  /** 登录 */
  login: (phone: string, password: string) => Promise<void>;
  /** 注册 */
  register: (phone: string, password: string, nickname: string) => Promise<void>;
  /** 登出 */
  logout: () => Promise<void>;
  /** 拉取个人资料 */
  fetchProfile: () => Promise<void>;
}

export const useUserStore = create<UserState>((set) => ({
  user: null,
  loading: false,
  restored: false,

  restore: async () => {
    const token = localStorage.getItem('token');
    // 无 token 时直接标记恢复完成，让守卫 effect 走未登录跳转逻辑
    if (!token) {
      set({ restored: true });
      return;
    }
    try {
      const user = await userApi.getProfile();
      set({ user });
    } catch (err) {
      // 区分错误类型：仅 401（token 真正失效）才清理登录态
      // 网络错误（httpStatus === undefined，如服务器宕机/超时/DNS 失败）保留 token，
      // 让用户下次操作时重试，避免网络波动导致已登录用户被误登出
      const httpStatus = (err as ErrorResponse | undefined)?.httpStatus;
      if (httpStatus === 401) {
        disconnectSocket();
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
      }
    } finally {
      // 无论成功失败都标记恢复完成，避免守卫 effect 在恢复期间误跳登录页
      set({ restored: true });
    }
  },

  login: async (phone, password) => {
    set({ loading: true });
    try {
      const result: LoginResult = await authApi.login({ phone, password });
      persistSession(result);
      set({ user: result.user });
    } finally {
      set({ loading: false });
    }
  },

  register: async (phone, password, nickname) => {
    set({ loading: true });
    try {
      const result: LoginResult = await authApi.register({ phone, password, nickname });
      persistSession(result);
      set({ user: result.user });
    } finally {
      set({ loading: false });
    }
  },

  logout: async () => {
    try {
      // 调用登出前先读取 refreshToken 传给后端一起黑名单，防止登出后 refreshToken 仍可换新 token
      // 设计原因：refreshToken 有效期 30 天，泄露后仍可换新 access token，必须与 access token 一起黑名单
      const refreshToken = localStorage.getItem('refreshToken') ?? undefined;
      await authApi.logout(refreshToken);
    } finally {
      // 登出时主动断开 WebSocket，避免旧 socket 残留导致下次登录复用旧连接鉴权失败
      disconnectSocket();
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      set({ user: null });
    }
  },

  fetchProfile: async () => {
    const user = await userApi.getProfile();
    set({ user });
  },
}));

/** 持久化会话到 localStorage */
function persistSession(result: LoginResult): void {
  localStorage.setItem('token', result.token);
  localStorage.setItem('refreshToken', result.refreshToken);
}
