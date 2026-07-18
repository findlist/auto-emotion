import { describe, it, expect } from 'vitest';
import { getErrorMessage } from './error';

// 测试 getErrorMessage 在不同异常类型下的消息提取行为
// 设计原因：扩展支持 ErrorResponse 对象（非 Error 实例但带 message 字段）后，
// 需覆盖原生 Error、ErrorResponse、空字符串 message、其他类型 4 个分支以保障回归稳定
describe('getErrorMessage', () => {
  it('Error 实例优先返回其 message', () => {
    const err = new Error('原生错误');
    expect(getErrorMessage(err, '兜底')).toBe('原生错误');
  });

  it('带 message 字段的普通对象（ErrorResponse 形态）返回其 message', () => {
    // 模拟 axios 拦截器 reject 的 ErrorResponse 对象（非 Error 实例但带业务 message）
    const err = { code: 400, message: '密码错误', httpStatus: 400 };
    expect(getErrorMessage(err, '登录失败')).toBe('密码错误');
  });

  it('带 message 字段但 message 为空字符串时回退 defaultMsg', () => {
    // 网络错误等场景 message 可能为空字符串，需保持原 `|| 'XXX失败'` 的兜底语义
    const err = { code: 500, message: '' };
    expect(getErrorMessage(err, '操作失败')).toBe('操作失败');
  });

  it('message 字段为非字符串类型时回退 defaultMsg', () => {
    // 防御性测试：异常对象 message 字段被赋值为数字/对象等非字符串类型时不应抛错
    const err = { message: 12345 };
    expect(getErrorMessage(err, '兜底')).toBe('兜底');
  });

  it('其他类型（字符串/数字/null/undefined）回退 defaultMsg', () => {
    expect(getErrorMessage('字符串错误', '兜底')).toBe('兜底');
    expect(getErrorMessage(42, '兜底')).toBe('兜底');
    expect(getErrorMessage(null, '兜底')).toBe('兜底');
    expect(getErrorMessage(undefined, '兜底')).toBe('兜底');
  });
});
