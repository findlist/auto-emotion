import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useUserStore } from '@/stores/user-store';
import type { ErrorResponse } from '@/types/api';
import type { LoginResult, User } from '@/types/user';

// mock authApi 与 userApi，避免真实网络请求
vi.mock('@/api/auth', () => ({
  authApi: {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  },
  userApi: {
    getProfile: vi.fn(),
  },
}));

// mock disconnect 避免触发真实 socket 逻辑（user-store 在登出/token 失效时主动清理 socket）
vi.mock('@/websocket', () => ({
  disconnect: vi.fn(),
}));

import { authApi, userApi } from '@/api/auth';
import { disconnect as disconnectSocket } from '@/websocket';

// 复用的 mock 数据：覆盖 User 全字段避免 TS 报错
const mockUser: User = {
  id: 1,
  phone: '13800000000',
  nickname: '小明',
  avatarUrl: '',
  signature: '',
  coins: 100,
  gems: 10,
  level: 5,
  exp: 200,
  power: 80,
  pvp_points: 1200,
  battleScore: 3000,
  status: 1,
  lastLoginAt: '2026-07-05T00:00:00Z',
  createdAt: '2026-07-01T00:00:00Z',
};

const mockLoginResult: LoginResult = {
  token: 'tok-abc',
  refreshToken: 'ref-xyz',
  user: mockUser,
};

describe('user-store 用户状态管理', () => {
  beforeEach(() => {
    // 重置 store 状态、清空 localStorage、清空 mock 调用记录，避免跨用例污染
    useUserStore.setState({ user: null, loading: false, restored: false });
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('login 成功：持久化 token 并设置 user，loading 最终恢复 false', async () => {
    vi.mocked(authApi.login).mockResolvedValue(mockLoginResult);

    await useUserStore.getState().login('13800000000', 'pwd123');

    expect(authApi.login).toHaveBeenCalledWith({ phone: '13800000000', password: 'pwd123' });
    expect(localStorage.getItem('token')).toBe('tok-abc');
    expect(localStorage.getItem('refreshToken')).toBe('ref-xyz');
    expect(useUserStore.getState().user).toEqual(mockUser);
    // finally 分支：loading 必须恢复
    expect(useUserStore.getState().loading).toBe(false);
  });

  it('login 失败：loading 恢复 false 且错误向上冒泡，user 保持 null、不持久化 token', async () => {
    vi.mocked(authApi.login).mockRejectedValue(new Error('密码错误'));

    await expect(useUserStore.getState().login('138', 'wrong')).rejects.toThrow('密码错误');

    expect(useUserStore.getState().loading).toBe(false);
    expect(useUserStore.getState().user).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('register 成功：持久化 token 并设置 user', async () => {
    vi.mocked(authApi.register).mockResolvedValue(mockLoginResult);

    await useUserStore.getState().register('13800000000', 'pwd123', '小明');

    expect(authApi.register).toHaveBeenCalledWith({
      phone: '13800000000',
      password: 'pwd123',
      nickname: '小明',
    });
    expect(localStorage.getItem('token')).toBe('tok-abc');
    expect(useUserStore.getState().user).toEqual(mockUser);
  });

  it('logout 成功：清理 token 与 socket，user 置空', async () => {
    useUserStore.setState({ user: mockUser });
    localStorage.setItem('token', 'old');
    localStorage.setItem('refreshToken', 'old-ref');
    vi.mocked(authApi.logout).mockResolvedValue(undefined);

    await useUserStore.getState().logout();

    expect(authApi.logout).toHaveBeenCalled();
    expect(disconnectSocket).toHaveBeenCalled();
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(useUserStore.getState().user).toBeNull();
  });

  it('logout 即使 api 抛错也清理 token 与 socket（finally 分支兜底）', async () => {
    useUserStore.setState({ user: mockUser });
    localStorage.setItem('token', 'old');
    vi.mocked(authApi.logout).mockRejectedValue(new Error('网络错误'));

    // logout 内部 try/finally 无 catch，错误会冒泡但清理仍执行
    await expect(useUserStore.getState().logout()).rejects.toThrow('网络错误');

    expect(disconnectSocket).toHaveBeenCalled();
    expect(localStorage.getItem('token')).toBeNull();
    expect(useUserStore.getState().user).toBeNull();
  });

  it('restore 无 token 时自动游客登录，标记 restored=true', async () => {
    // 无 token 时触发 autoGuestLogin：先尝试 login，成功则设置 user 和 token
    vi.mocked(authApi.login).mockResolvedValue(mockLoginResult);

    await useUserStore.getState().restore();

    expect(authApi.login).toHaveBeenCalledWith({ phone: '13000000000', password: 'guest123456' });
    expect(userApi.getProfile).not.toHaveBeenCalled();
    expect(localStorage.getItem('token')).toBe('tok-abc');
    expect(useUserStore.getState().user).toEqual(mockUser);
    expect(useUserStore.getState().restored).toBe(true);
  });

  it('restore 有 token 且 getProfile 成功：设置 user，标记 restored=true', async () => {
    localStorage.setItem('token', 'tok');
    vi.mocked(userApi.getProfile).mockResolvedValue(mockUser);

    await useUserStore.getState().restore();

    expect(userApi.getProfile).toHaveBeenCalled();
    expect(useUserStore.getState().user).toEqual(mockUser);
    expect(useUserStore.getState().restored).toBe(true);
  });

  it('restore 有 token 但 getProfile 返回 401：清理旧 token 后自动游客重新登录', async () => {
    localStorage.setItem('token', 'tok');
    localStorage.setItem('refreshToken', 'ref');
    // 模拟 401 错误：token 失效，http 拦截器 refresh 失败后抛出带 httpStatus 的 ErrorResponse
    const err: ErrorResponse = { code: 401, message: '登录已过期', httpStatus: 401 };
    vi.mocked(userApi.getProfile).mockRejectedValue(err);
    // 401 后 autoGuestLogin 重新登录
    vi.mocked(authApi.login).mockResolvedValue(mockLoginResult);

    await useUserStore.getState().restore();

    // 401 是 token 真正失效，清理 socket + 清理旧 localStorage
    expect(disconnectSocket).toHaveBeenCalled();
    // autoGuestLogin 重新登录成功，设置新 token 和 user
    expect(authApi.login).toHaveBeenCalledWith({ phone: '13000000000', password: 'guest123456' });
    expect(localStorage.getItem('token')).toBe('tok-abc');
    expect(useUserStore.getState().user).toEqual(mockUser);
    expect(useUserStore.getState().restored).toBe(true);
  });

  it('restore 有 token 但 getProfile 网络错误：保留 token 不登出，finally 标记 restored=true', async () => {
    localStorage.setItem('token', 'tok');
    localStorage.setItem('refreshToken', 'ref');
    // 模拟网络错误：服务器宕机/超时/DNS 失败，无 httpStatus（http 拦截器不处理网络错误，错误无 httpStatus 字段）
    vi.mocked(userApi.getProfile).mockRejectedValue(new Error('Network Error'));

    await useUserStore.getState().restore();

    // 网络错误不清理 token，让用户下次操作时重试，避免网络波动导致已登录用户被误登出
    expect(disconnectSocket).not.toHaveBeenCalled();
    expect(localStorage.getItem('token')).toBe('tok');
    expect(localStorage.getItem('refreshToken')).toBe('ref');
    expect(useUserStore.getState().user).toBeNull();
    // 无论成功失败都标记恢复完成，避免守卫 effect 永久阻断
    expect(useUserStore.getState().restored).toBe(true);
  });

  it('fetchProfile 成功：更新 user', async () => {
    vi.mocked(userApi.getProfile).mockResolvedValue(mockUser);

    await useUserStore.getState().fetchProfile();

    expect(userApi.getProfile).toHaveBeenCalled();
    expect(useUserStore.getState().user).toEqual(mockUser);
  });
});
