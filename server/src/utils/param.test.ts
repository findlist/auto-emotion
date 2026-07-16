import { describe, it, expect } from 'vitest';
import { parseIdParam } from './param.js';

describe('parseIdParam 路由参数解析', () => {
  it('传入数字字符串返回对应数字', () => {
    expect(parseIdParam('123')).toBe(123);
  });

  it('传入单元素字符串数组返回对应数字', () => {
    // Express 路由参数类型为 string | string[]，需兼容数组形式
    expect(parseIdParam(['456'])).toBe(456);
  });

  it('传入非数字字符串返回 NaN', () => {
    expect(parseIdParam('abc')).toBeNaN();
  });

  it('传入 undefined 返回 NaN', () => {
    // 显式处理 undefined，避免 parseInt(undefined) 的隐式行为
    expect(parseIdParam(undefined)).toBeNaN();
  });

  it('传入空数组返回 NaN', () => {
    // Array.isArray 命中取 value[0] = undefined，parseInt(undefined) = NaN
    expect(parseIdParam([])).toBeNaN();
  });
});
