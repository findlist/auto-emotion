// server/src/utils/error.test.ts
// 业务错误类单元测试

import { describe, it, expect } from 'vitest';
import { AppError, ErrorCode } from './error.js';

describe('error 业务错误类', () => {
  describe('ErrorCode 错误码枚举', () => {
    it('错误码为唯一递增数值', () => {
      // 收集所有错误码值，校验唯一性
      const codes = Object.values(ErrorCode).filter(
        (v): v is number => typeof v === 'number'
      );
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
    });

    it('关键错误码取值符合预期', () => {
      expect(ErrorCode.BAD_REQUEST).toBe(1001);
      expect(ErrorCode.UNAUTHORIZED).toBe(1002);
      expect(ErrorCode.INTERNAL_ERROR).toBe(1006);
      expect(ErrorCode.RATE_LIMIT).toBe(1008);
    });
  });

  describe('AppError 业务错误对象', () => {
    it('携带 code 与 message', () => {
      const err = new AppError(ErrorCode.NOT_FOUND, '资源不存在');
      expect(err.code).toBe(ErrorCode.NOT_FOUND);
      expect(err.message).toBe('资源不存在');
      expect(err.name).toBe('AppError');
      // AppError 继承自 Error，应可被 instanceof 判定
      expect(err).toBeInstanceOf(Error);
    });

    it('可选 errors 字段透传校验明细', () => {
      const details = { field: 'username', reason: 'required' };
      const err = new AppError(ErrorCode.VALIDATION_ERROR, '参数错误', details);
      expect(err.errors).toEqual(details);
    });

    it('未传入 errors 时 errors 字段为 undefined', () => {
      const err = new AppError(ErrorCode.CONFLICT, '冲突');
      expect(err.errors).toBeUndefined();
    });
  });
});
