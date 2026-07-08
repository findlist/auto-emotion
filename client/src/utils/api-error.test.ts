import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { ToastType } from '@/components/Toast';

// mock showToast 仅捕获调用参数，避免渲染真实 Toast 组件
// 设计原因：原用 vi.fn<(type, message), void>() 是 vitest 4 新泛型语法，
// eslint typescript-parser 暂不支持会报解析错误。改用 vi.fn() + as Mock 断言保留类型安全
const showToastMock = vi.fn() as Mock<(type: ToastType, message: string) => void>;
vi.mock('@/utils/toast', () => ({
  showToast: (type: ToastType, message: string) => showToastMock(type, message),
}));

import { showApiError } from '@/utils/api-error';

describe('showApiError HTTP 状态码差异化提示', () => {
  beforeEach(() => {
    showToastMock.mockClear();
  });

  it('401 不弹 Toast（http.ts 拦截器已跳转登录页）', () => {
    showApiError({ code: 1002, message: '未授权', httpStatus: 401 });
    expect(showToastMock).not.toHaveBeenCalled();
  });

  it('403 用 warning 类型，业务 message 优先', () => {
    showApiError({ code: 1003, message: '金币不足', httpStatus: 403 });
    expect(showToastMock).toHaveBeenCalledWith('warning', '金币不足');
  });

  it('403 业务 message 为空时用 fallbackMessage', () => {
    showApiError({ code: 1003, message: '', httpStatus: 403 }, '购买失败');
    expect(showToastMock).toHaveBeenCalledWith('warning', '购买失败');
  });

  it('403 无 message 且无 fallbackMessage 时用状态码兜底文案', () => {
    showApiError({ code: 1003, message: '', httpStatus: 403 });
    expect(showToastMock).toHaveBeenCalledWith('warning', '权限不足');
  });

  it('404 用 info 类型', () => {
    showApiError({ code: 1004, message: '商品不存在', httpStatus: 404 });
    expect(showToastMock).toHaveBeenCalledWith('info', '商品不存在');
  });

  it('409 用 warning 类型', () => {
    showApiError({ code: 1005, message: '已购买过', httpStatus: 409 });
    expect(showToastMock).toHaveBeenCalledWith('warning', '已购买过');
  });

  it('422 用 warning 类型（参数校验失败）', () => {
    showApiError({ code: 1006, message: '昵称长度不合法', httpStatus: 422 });
    expect(showToastMock).toHaveBeenCalledWith('warning', '昵称长度不合法');
  });

  it('429 用 warning 类型（限流）', () => {
    showApiError({ code: 1007, message: '', httpStatus: 429 });
    expect(showToastMock).toHaveBeenCalledWith('warning', '操作过于频繁，请稍后再试');
  });

  it('500 用 error 类型，业务 message 优先', () => {
    showApiError({ code: 500, message: '数据库异常', httpStatus: 500 });
    expect(showToastMock).toHaveBeenCalledWith('error', '数据库异常');
  });

  it('500 无 message 时用 fallbackMessage', () => {
    showApiError({ code: 500, message: '', httpStatus: 500 }, '升级失败');
    expect(showToastMock).toHaveBeenCalledWith('error', '升级失败');
  });

  it('网络错误（httpStatus undefined）用 error 类型 + 网络兜底文案', () => {
    showApiError({ code: 500, message: '' });
    expect(showToastMock).toHaveBeenCalledWith('error', '网络异常，请检查连接');
  });

  it('网络错误业务 message 优先于网络兜底文案', () => {
    showApiError({ code: 500, message: '连接超时' });
    expect(showToastMock).toHaveBeenCalledWith('error', '连接超时');
  });

  it('Error 实例用 error 类型，Error.message 优先于 fallbackMessage', () => {
    // Error 实例有 message 字段，isErrorResponse 类型守卫放行，走 httpStatus undefined 分支
    showApiError(new Error('代码 bug'), '操作失败');
    expect(showToastMock).toHaveBeenCalledWith('error', '代码 bug');
  });

  it('Error 实例 message 为空时用 fallbackMessage', () => {
    showApiError(new Error(''), '操作失败');
    expect(showToastMock).toHaveBeenCalledWith('error', '操作失败');
  });

  it('null 用 error 类型 + fallbackMessage', () => {
    showApiError(null, '操作失败');
    expect(showToastMock).toHaveBeenCalledWith('error', '操作失败');
  });

  it('字符串错误用 error 类型 + fallbackMessage', () => {
    showApiError('字符串错误', '操作失败');
    expect(showToastMock).toHaveBeenCalledWith('error', '操作失败');
  });

  it('null 无 fallbackMessage 时用通用兜底', () => {
    showApiError(null);
    expect(showToastMock).toHaveBeenCalledWith('error', '操作失败');
  });

  it('业务 message 优先于 fallbackMessage', () => {
    showApiError({ code: 1003, message: '需要等级 10', httpStatus: 403 }, '购买失败');
    expect(showToastMock).toHaveBeenCalledWith('warning', '需要等级 10');
  });

  it('未映射的 HTTP 状态码（如 418）兜底用 error 类型', () => {
    showApiError({ code: 418, message: "I'm a teapot", httpStatus: 418 });
    expect(showToastMock).toHaveBeenCalledWith('error', "I'm a teapot");
  });

  it('ErrorResponse 无 message 字段时用 fallbackMessage', () => {
    // 模拟拦截器 reject 的对象结构异常的边界场景
    showApiError({ code: 500, httpStatus: 500 } as never, '操作失败');
    expect(showToastMock).toHaveBeenCalledWith('error', '操作失败');
  });
});
