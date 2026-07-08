import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// 用 vi.hoisted 在 vi.mock 之前初始化 fake 实例与拦截器存储
// axios.create 返回 fake 实例，注册的拦截器函数存入数组供测试直接调用
// 同时 mock fakeHttp 的请求方法（post/get/put/delete/request），用于无感刷新重发场景
const mock = vi.hoisted(() => {
  const requestInterceptors: Array<(config: unknown) => unknown> = [];
  const responseInterceptors: Array<{
    onFulfilled?: (resp: unknown) => unknown;
    onRejected?: (err: unknown) => unknown;
  }> = [];
  // 请求方法 mock：默认无实现，测试用 vi.mockResolvedValue/vi.mockRejectedValue 按需配置
  const fakeHttp = {
    interceptors: {
      request: { use: (fn: (config: unknown) => unknown) => { requestInterceptors.push(fn); } },
      response: {
        use: (onFulfilled?: (resp: unknown) => unknown, onRejected?: (err: unknown) => unknown) => {
          responseInterceptors.push({ onFulfilled, onRejected });
        },
      },
    },
    // 支持 http(originalRequest) 重发请求场景，默认 reject 触发兜底逻辑
    request: vi.fn().mockRejectedValue(new Error('未配置 mock')),
    post: vi.fn().mockRejectedValue(new Error('未配置 mock')),
    get: vi.fn().mockRejectedValue(new Error('未配置 mock')),
    put: vi.fn().mockRejectedValue(new Error('未配置 mock')),
    delete: vi.fn().mockRejectedValue(new Error('未配置 mock')),
  };
  return { fakeHttp, requestInterceptors, responseInterceptors };
});

vi.mock('axios', () => ({
  default: { create: () => mock.fakeHttp },
  // AxiosError 仅作类型占位，运行时拦截器判断用 error.response?.status，不依赖 instanceof
  AxiosError: class AxiosError<T = unknown> extends Error {
    response?: { status: number; data: T };
  },
}));

import http from '@/api/http';

// mock window.location，避免 jsdom 导航限制（Not implemented: navigation）
const mockLocation = { pathname: '/', href: '' };
beforeAll(() => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: mockLocation,
  });
});

// 静态引入标记，确保 http 模块已加载（拦截器在模块加载时注册）
void http;

describe('http axios 实例拦截器', () => {
  beforeEach(() => {
    localStorage.clear();
    mockLocation.pathname = '/';
    mockLocation.href = '';
    // 清除 vi.stubGlobal 设置的 fetch mock，避免用例间互相污染
    vi.unstubAllGlobals();
    // 重置 fakeHttp 请求方法 mock 并恢复默认 mockRejectedValue（兜底触发拦截器 catch 路径）
    // 设计原因：mockReset 清除所有 mock 实现，需重新设置默认值，否则未配置 mock 的用例会返回 undefined
    mock.fakeHttp.request.mockReset();
    mock.fakeHttp.request.mockRejectedValue(new Error('未配置 mock'));
    mock.fakeHttp.post.mockReset();
    mock.fakeHttp.post.mockRejectedValue(new Error('未配置 mock'));
    mock.fakeHttp.get.mockReset();
    mock.fakeHttp.get.mockRejectedValue(new Error('未配置 mock'));
    mock.fakeHttp.put.mockReset();
    mock.fakeHttp.put.mockRejectedValue(new Error('未配置 mock'));
    mock.fakeHttp.delete.mockReset();
    mock.fakeHttp.delete.mockRejectedValue(new Error('未配置 mock'));
  });

  describe('请求拦截器：token 注入', () => {
    it('localStorage 有 token 时注入 Authorization Bearer 头', () => {
      localStorage.setItem('token', 'test-jwt-token');
      // 用 Map 模拟 AxiosHeaders（set/get/has 签名兼容）
      const config = { headers: new Map<string, string>() } as never;
      const result = mock.requestInterceptors[0](config) as { headers: Map<string, string> };
      expect(result.headers.get('Authorization')).toBe('Bearer test-jwt-token');
    });

    it('localStorage 无 token 时不注入 Authorization 头', () => {
      const config = { headers: new Map<string, string>() } as never;
      const result = mock.requestInterceptors[0](config) as { headers: Map<string, string> };
      expect(result.headers.has('Authorization')).toBe(false);
    });
  });

  describe('响应拦截器：成功路径', () => {
    it('code=200 时解包 ApiResponse 返回 data 字段', async () => {
      const response = { data: { code: 200, message: 'ok', data: { foo: 'bar' } } };
      const result = await mock.responseInterceptors[0].onFulfilled!(response) as { data: unknown };
      expect(result.data).toEqual({ foo: 'bar' });
    });

    it('code=201 时解包 ApiResponse 返回 data 字段', async () => {
      const response = { data: { code: 201, message: 'created', data: { id: 1 } } };
      const result = await mock.responseInterceptors[0].onFulfilled!(response) as { data: unknown };
      expect(result.data).toEqual({ id: 1 });
    });
  });

  describe('响应拦截器：业务错误（HTTP 200 但 code 非 200/201）', () => {
    it('code=400 时 reject ErrorResponse', async () => {
      const response = { data: { code: 400, message: '参数错误', data: null } };
      await expect(mock.responseInterceptors[0].onFulfilled!(response)).rejects.toEqual({
        code: 400,
        message: '参数错误',
        errors: undefined,
      });
    });

    it('业务错误体含 errors 字段时透传', async () => {
      const response = {
        data: {
          code: 422,
          message: '校验失败',
          data: null,
          errors: [{ field: 'name', message: '必填' }],
        },
      };
      await expect(mock.responseInterceptors[0].onFulfilled!(response)).rejects.toEqual({
        code: 422,
        message: '校验失败',
        errors: [{ field: 'name', message: '必填' }],
      });
    });
  });

  describe('响应拦截器：HTTP 异常', () => {
    it('HTTP 401 且无 refreshToken 时清登录态跳 /login', async () => {
      // 场景：未登录态访问受保护接口，无 refreshToken 可刷新，直接走清登录态路径
      localStorage.setItem('token', 'old-token');
      mockLocation.pathname = '/dashboard';

      const error = {
        response: { status: 401, data: { code: 401, message: '未授权' } },
        message: 'Request failed with status code 401',
      };

      await expect(mock.responseInterceptors[0].onRejected!(error)).rejects.toEqual({
        code: 401,
        message: '未授权',
        httpStatus: 401,
        errors: undefined,
      });
      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('refreshToken')).toBeNull();
      expect(mockLocation.href).toBe('/login');
    });

    it('HTTP 401 且当前已在 /login 时不重复跳转', async () => {
      localStorage.setItem('token', 'old-token');
      mockLocation.pathname = '/login';

      const error = {
        response: { status: 401, data: { code: 401, message: '未授权' } },
        message: 'Request failed with status code 401',
      };

      await expect(mock.responseInterceptors[0].onRejected!(error)).rejects.toEqual({
        code: 401,
        message: '未授权',
        httpStatus: 401,
        errors: undefined,
      });
      // href 未被赋值，保持初始空串
      expect(mockLocation.href).toBe('');
    });

    it('网络错误（无 response）时 reject ErrorResponse(code=500, message=error.message)', async () => {
      const error = { message: 'Network Error' };
      await expect(mock.responseInterceptors[0].onRejected!(error)).rejects.toEqual({
        code: 500,
        message: 'Network Error',
        errors: undefined,
      });
    });

    it('HTTP 500 且错误体含 errors 时透传', async () => {
      const error = {
        response: {
          status: 500,
          data: {
            code: 500,
            message: '服务器异常',
            errors: [{ field: 'db', message: '连接失败' }],
          },
        },
        message: 'Request failed with status code 500',
      };
      await expect(mock.responseInterceptors[0].onRejected!(error)).rejects.toEqual({
        code: 500,
        message: '服务器异常',
        httpStatus: 500,
        errors: [{ field: 'db', message: '连接失败' }],
      });
    });
  });

  describe('响应拦截器：401 无感刷新', () => {
    /** 构造带 config 的 401 error，模拟 axios 真实调用环境 */
    function make401Error(url: string, opts?: { retry?: boolean }) {
      return {
        config: {
          url,
          headers: new Map<string, string>(),
          _retry: opts?.retry,
        },
        response: { status: 401, data: { code: 401, message: '未授权' } },
        message: 'Request failed with status code 401',
      };
    }

    /** mock fetch 返回 refresh 成功响应（200 + 新 token） */
    function mockFetchRefreshSuccess(newToken: string) {
      // 用 vi.stubGlobal 替代直接 global.fetch = ...，jsdom 下 global 属性可能只读，stubGlobal 内部用 Object.defineProperty 强制写入
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: 200, message: 'ok', data: { token: newToken } }),
      });
      vi.stubGlobal('fetch', fetchMock);
      return fetchMock;
    }

    /** mock fetch 返回 refresh 失败响应（401） */
    function mockFetchRefreshFail(httpStatus: number) {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: httpStatus,
        json: async () => ({ code: httpStatus, message: 'refresh token 无效' }),
      });
      vi.stubGlobal('fetch', fetchMock);
      return fetchMock;
    }

    it('401 + 有 refreshToken + fetch 成功 → 更新 token 并重发原请求', async () => {
      // 场景：access token 过期，refreshToken 有效，应静默换新 token 并重发请求
      localStorage.setItem('token', 'expired-token');
      localStorage.setItem('refreshToken', 'valid-refresh');
      mockLocation.pathname = '/dashboard';
      const fetchMock = mockFetchRefreshSuccess('new-token-123');
      // 重发请求 mock：先用 mockReset 清除默认 mockRejectedValue，再设置本次 resolve
      // 设计原因：mock 的 fakeHttp.request 不会触发响应拦截器链（拦截器逻辑由其他用例覆盖），
      // 直接返回「拦截器解包后」的结构 response.data = body.data，验证 refresh + 重发流程即可
      mock.fakeHttp.request.mockReset();
      mock.fakeHttp.request.mockResolvedValue({
        data: { foo: 'bar' },
      });

      const error = make401Error('/users/profile');
      const result = (await mock.responseInterceptors[0].onRejected!(error)) as { data: unknown };

      // 验证 fetch 被调用且参数正确
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/refresh',
        expect.objectContaining({ method: 'POST' })
      );
      // 验证 token 已更新
      expect(localStorage.getItem('token')).toBe('new-token-123');
      // 验证重发请求被调用（http.request(originalRequest)）
      expect(mock.fakeHttp.request).toHaveBeenCalled();
      // 验证重发返回的数据（mock 模拟拦截器解包后结构）
      expect(result.data).toEqual({ foo: 'bar' });
    });

    it('401 + refresh 接口返回 code=201 → 同样视为成功（与响应拦截器一致）', async () => {
      // 设计原因：refreshAccessToken 原仅接受 code=200，与响应拦截器（200||201）不一致，
      // 若 refresh 接口返回 201 会被误判为失败。修复后 201 也应正常换 token 重发
      localStorage.setItem('token', 'expired-token');
      localStorage.setItem('refreshToken', 'valid-refresh');
      mockLocation.pathname = '/dashboard';
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: 201, message: 'created', data: { token: 'new-201' } }),
      });
      vi.stubGlobal('fetch', fetchMock);
      mock.fakeHttp.request.mockReset();
      mock.fakeHttp.request.mockResolvedValue({ data: { ok: 1 } });

      const error = make401Error('/users/profile');
      await mock.responseInterceptors[0].onRejected!(error);

      // code=201 应被视为成功，token 正常更新
      expect(localStorage.getItem('token')).toBe('new-201');
      expect(mock.fakeHttp.request).toHaveBeenCalled();
    });

    it('401 + 有 refreshToken + fetch 失败 → 清登录态跳 /login + reject "登录已过期"', async () => {
      // 场景：refreshToken 也已过期，refresh 接口返回 401，应清登录态并提示用户
      localStorage.setItem('token', 'expired-token');
      localStorage.setItem('refreshToken', 'expired-refresh');
      mockLocation.pathname = '/dashboard';
      mockFetchRefreshFail(401);

      const error = make401Error('/users/profile');

      await expect(mock.responseInterceptors[0].onRejected!(error)).rejects.toEqual({
        code: 401,
        message: '登录已过期，请重新登录',
        httpStatus: 401,
      });
      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('refreshToken')).toBeNull();
      expect(mockLocation.href).toBe('/login');
    });

    it('401 + 是 /auth/refresh 请求自身 → 不递归刷新，直接清登录态', async () => {
      // 场景：refresh 请求自身返回 401（refreshToken 无效），避免拦截器递归调用 refresh
      localStorage.setItem('token', 'expired-token');
      localStorage.setItem('refreshToken', 'expired-refresh');
      mockLocation.pathname = '/dashboard';
      // 不应触发 fetch（refresh 不递归）
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
      vi.stubGlobal('fetch', fetchMock);

      const error = make401Error('/auth/refresh');

      // 走普通 401 路径，reject ErrorResponse { code: 401, message: '未授权' }
      await expect(mock.responseInterceptors[0].onRejected!(error)).rejects.toEqual({
        code: 401,
        message: '未授权',
        httpStatus: 401,
        errors: undefined,
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(localStorage.getItem('token')).toBeNull();
      expect(mockLocation.href).toBe('/login');
    });

    it('401 + 是 /auth/login 请求自身 → 不触发 refresh', async () => {
      // 场景：login 接口返回 401（账号密码错误），不应当尝试 refresh（无意义且浪费请求）
      localStorage.setItem('refreshToken', 'some-refresh');
      mockLocation.pathname = '/login';
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
      vi.stubGlobal('fetch', fetchMock);

      const error = make401Error('/auth/login');

      await expect(mock.responseInterceptors[0].onRejected!(error)).rejects.toEqual({
        code: 401,
        message: '未授权',
        httpStatus: 401,
        errors: undefined,
      });
      expect(fetchMock).not.toHaveBeenCalled();
      // 走普通 401 路径但已在 /login 不跳转
      expect(mockLocation.href).toBe('');
    });

    it('401 + 已重试过（_retry=true）→ 不重复 refresh，直接清登录态', async () => {
      // 场景：refresh 后重发的请求再次 401（极少见，新 token 也无效），避免无限循环
      localStorage.setItem('token', 'new-but-invalid');
      localStorage.setItem('refreshToken', 'used-refresh');
      mockLocation.pathname = '/dashboard';
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
      vi.stubGlobal('fetch', fetchMock);

      const error = make401Error('/users/profile', { retry: true });

      await expect(mock.responseInterceptors[0].onRejected!(error)).rejects.toEqual({
        code: 401,
        message: '未授权',
        httpStatus: 401,
        errors: undefined,
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(localStorage.getItem('token')).toBeNull();
      expect(mockLocation.href).toBe('/login');
    });

    it('401 + refresh 接口 10 秒未响应 → 超时 abort，走清登录态跳转路径', async () => {
      // 场景：refresh 接口 hang 住，所有 401 请求永久挂起。
      // 修复后 10 秒超时触发 AbortController.abort()，fetch reject AbortError，走清登录态路径
      localStorage.setItem('token', 'expired-token');
      localStorage.setItem('refreshToken', 'valid-refresh');
      mockLocation.pathname = '/dashboard';
      // mock fetch 返回永不 resolve 的 Promise，监听 signal.abort 事件
      // 当 controller.abort() 被调用时，fetch 应 reject AbortError
      const fetchMock = vi.fn().mockImplementation((_url: string, opts: { signal: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          opts.signal.addEventListener('abort', () => {
            reject(new DOMException('The user aborted a request.', 'AbortError'));
          });
        });
      });
      vi.stubGlobal('fetch', fetchMock);

      vi.useFakeTimers();
      const error = make401Error('/users/profile');
      const promise = mock.responseInterceptors[0].onRejected!(error);
      // 立即 attach catch 避免 fake timers 下 rejection 触发时机与 await 之间的间隙产生 unhandled rejection
      const result = promise.catch((e: unknown) => e);

      // 推进 10 秒触发 setTimeout -> controller.abort() -> fetch reject AbortError
      await vi.advanceTimersByTimeAsync(10000);
      const rejection = await result;
      vi.useRealTimers();

      // 超时后走清登录态路径：reject ErrorResponse(401) + 清 token + 跳转 /login
      expect(rejection).toEqual({
        code: 401,
        message: '登录已过期，请重新登录',
        httpStatus: 401,
      });
      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('refreshToken')).toBeNull();
      expect(mockLocation.href).toBe('/login');
    });
  });
});
