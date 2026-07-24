import { create } from 'zustand';
import { authApi, userApi } from '@/api/auth';
import { disconnect as disconnectSocket } from '@/websocket';
import { isErrorResponse } from '@/utils/api-error';
import type { LoginResult, User } from '@/types/user';

/**
 * 用户状态管理
 * - 登录态持久化到 localStorage
 * - 提供 login / register / logout / fetchProfile 方法
 * - 无 token 时自动以游客身份登录，用户无需手动注册/登录即可游玩
 */

// 游客账号：固定手机号+密码，首次访问自动注册，后续直接登录
const GUEST = {
  phone: '13000000000',
  password: 'guest123456',
  nickname: '冒险者',
} as const;

// 后端不可用时的本地兜底用户（API 调用会失败但不阻塞页面浏览）
// id 为空串：User.id 已收敛为 string 与后端 UUID 契约对齐，兜底用户无真实身份用空串标识
const FALLBACK_USER: User = {
  id: '',
  phone: GUEST.phone,
  nickname: GUEST.nickname,
  avatarUrl: '',
  signature: '',
  coins: 0,
  gems: 0,
  level: 1,
  exp: 0,
  power: 0,
  pvp_points: 0,
  battleScore: 0,
  status: 0,
  lastLoginAt: '',
  createdAt: '',
};

type SetFn = (partial: Partial<UserState>) => void;

/**
 * 游客自动登录：先尝试登录，失败则注册（首次访问），都失败则使用本地兜底用户
 * 设计原因：去掉手动登录流程，用户打开页面即自动获取身份，可直接进入游戏
 */
async function autoGuestLogin(set: SetFn): Promise<void> {
  try {
    const result = await authApi.login({ phone: GUEST.phone, password: GUEST.password });
    persistSession(result);
    set({ user: result.user });
  } catch {
    try {
      const result = await authApi.register({
        phone: GUEST.phone,
        password: GUEST.password,
        nickname: GUEST.nickname,
      });
      persistSession(result);
      set({ user: result.user });
    } catch {
      // 后端不可用，使用本地兜底用户让用户至少能浏览页面
      set({ user: FALLBACK_USER });
    }
  }
}

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
    // 无 token：自动以游客身份登录，用户无需手动注册/登录
    if (!token) {
      await autoGuestLogin(set);
      set({ restored: true });
      return;
    }
    try {
      const user = await userApi.getProfile();
      set({ user });
    } catch (err) {
      // 区分错误类型：仅 401（token 真正失效）才清理并重新游客登录
      // 网络错误（httpStatus === undefined，如服务器宕机/超时/DNS 失败）保留 token，
      // 让用户下次操作时重试，避免网络波动导致已登录用户被误登出
      // 用 isErrorResponse 类型守卫收敛 unknown，替代 as ErrorResponse 类型断言
      if (isErrorResponse(err) && err.httpStatus === 401) {
        disconnectSocket();
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        // token 失效后自动重新游客登录
        await autoGuestLogin(set);
      }
    } finally {
      // 无论成功失败都标记恢复完成，避免守卫 effect 在恢复期间误跳
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
