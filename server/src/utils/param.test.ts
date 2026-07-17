import { describe, it, expect } from 'vitest';
import { parseIdParam, parsePagination, firstParam } from './param.js';

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

describe('firstParam 字符串路由参数收窄', () => {
  it('传入字符串返回原值（UUID/roomId 等非数字参数）', () => {
    // friends.ts 的 friendId 为 UUID 字符串，需保留原值不转数字
    expect(firstParam('abc-123-uuid')).toBe('abc-123-uuid');
  });

  it('传入单元素数组返回首个元素（兼容 Express 路由参数类型）', () => {
    // Express 路由参数类型为 string | string[]，需兼容数组形式
    expect(firstParam(['room-1'])).toBe('room-1');
  });

  it('传入 undefined 返回空字符串（调用方配合 !value 判断返回 400）', () => {
    // 显式处理 undefined，避免 as string 在运行时 undefined 输入下的隐患
    expect(firstParam(undefined)).toBe('');
  });

  it('传入空数组返回空字符串', () => {
    // Array.isArray 命中取 value[0] = undefined，?? '' 兜底
    expect(firstParam([])).toBe('');
  });

  it('传入多元素数组返回首个元素（边界情况：Express 实际不会出现）', () => {
    // 单段路由参数实际不会是多元素数组，但工具函数需稳健处理
    expect(firstParam(['a', 'b', 'c'])).toBe('a');
  });
});

describe('parsePagination 分页参数解析', () => {
  it('缺省 query 与 options 时返回默认值 page=1 pageSize=20', () => {
    // 与 leaderboard 路由原 `|| 20` 默认行为对齐
    expect(parsePagination({})).toEqual({ page: 1, pageSize: 20 });
  });

  it('自定义 defaultPageSize 时生效（战绩路由默认 10）', () => {
    // 不同业务场景默认每页条数不同，通过 options 注入避免业务默认值耦合工具函数
    expect(parsePagination({}, { defaultPageSize: 10 })).toEqual({ page: 1, pageSize: 10 });
  });

  it('传入正常数字字符串时按传入值返回', () => {
    expect(parsePagination({ page: '3', pageSize: '50' })).toEqual({ page: 3, pageSize: 50 });
  });

  it('传入非数字字符串时回退到默认值（NaN 兜底）', () => {
    // parseInt('abc', 10) = NaN，falsy 兜底到默认值，保持原 `|| default` 语义
    expect(parsePagination({ page: 'abc', pageSize: 'xyz' })).toEqual({ page: 1, pageSize: 20 });
  });

  it('传入 0 时回退到默认值（0 兜底）', () => {
    // 0 是 falsy，与原 `parseInt(...) || 1` 行为等价，避免 page=0 导致的越界查询
    expect(parsePagination({ page: '0', pageSize: '0' })).toEqual({ page: 1, pageSize: 20 });
  });

  it('自定义 defaultPage 与 defaultPageSize 同时生效', () => {
    expect(
      parsePagination({}, { defaultPage: 2, defaultPageSize: 15 })
    ).toEqual({ page: 2, pageSize: 15 });
  });
});
