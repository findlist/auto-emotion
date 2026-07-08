// server/src/services/idle-service.test.ts
// 挂机服务层单元测试：覆盖事务边界、区域切换校验、引擎委托调用契约
// 设计原因：claimOffline 涉及金币经验写入需事务保护，switchArea 涉及等级权限校验，
// 这两处是核心质量风险点；其余方法为纯委托，验证调用契约即可防止接线错误

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCode } from '../utils/error.js';

// 使用 vi.hoisted 提升 mock，确保 vi.mock 工厂能引用
// 设计原因：vi.mock 工厂在模块导入前执行，普通变量无法被工厂闭包捕获
const mocks = vi.hoisted(() => ({
  // pool.query：区域/角色查询入口
  queryMock: vi.fn(),
  // 事务客户端的 query：BEGIN/UPDATE/COMMIT/ROLLBACK
  clientQueryMock: vi.fn(),
  // 事务客户端 release：归还连接，泄漏会导致连接池耗尽
  releaseMock: vi.fn(),
  // pool.connect：获取事务客户端
  connectMock: vi.fn(),
  // idleEngine 委托方法
  getStatusMock: vi.fn(),
  switchAreaMock: vi.fn(),
  upgradeCharacterMock: vi.fn(),
  settleMock: vi.fn(),
  // offlineCalculator 委托方法
  calculateOfflineMock: vi.fn(),
}));

vi.mock('../config/database.js', () => ({
  default: {
    query: mocks.queryMock,
    connect: mocks.connectMock,
  },
}));

vi.mock('../idle/idle-engine.js', () => ({
  getStatus: mocks.getStatusMock,
  switchArea: mocks.switchAreaMock,
  upgradeCharacter: mocks.upgradeCharacterMock,
  settle: mocks.settleMock,
}));

vi.mock('../idle/offline-calculator.js', () => ({
  calculateOffline: mocks.calculateOfflineMock,
}));

import { getStatus, claimOffline, switchArea, upgradeCharacter, settle } from './idle-service.js';

describe('idle-service 挂机服务', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 事务客户端默认返回空行，单测可按需覆盖
    mocks.connectMock.mockResolvedValue({
      query: mocks.clientQueryMock,
      release: mocks.releaseMock,
    });
    mocks.clientQueryMock.mockResolvedValue({ rows: [] });
  });

  describe('getStatus 状态查询', () => {
    it('直接委托给 idleEngine.getStatus 并返回其结果', async () => {
      const status = { level: 5, area_id: 2, gold: 100 };
      mocks.getStatusMock.mockResolvedValue(status);

      const result = await getStatus('u1');

      expect(mocks.getStatusMock).toHaveBeenCalledWith('u1');
      expect(result).toBe(status);
    });
  });

  describe('claimOffline 领取离线收益', () => {
    it('事务成功路径：BEGIN → advisory lock → calculateOffline(事务内重算) → 更新用户 → 更新角色 → COMMIT → 释放连接，返回收益', async () => {
      const offline = { exp: 80, gold: 200, duration: 3600 };
      mocks.calculateOfflineMock.mockResolvedValue(offline);

      const result = await claimOffline('u1');

      // 返回值即离线计算结果，不应被事务逻辑篡改
      expect(result).toEqual(offline);
      // 事务内重算：calculateOffline 必须传入 client.query 的事务绑定函数，确保在持锁连接上读取最新 idle_since
      // 设计原因：原实现事务外计算导致并发请求读到相同 idle_since 双倍发放，移入事务内 + advisory lock 串行化
      expect(mocks.calculateOfflineMock).toHaveBeenCalledWith('u1', expect.any(Function));
      // 校验事务执行序列
      const sqls = mocks.clientQueryMock.mock.calls.map(([sql]) => sql as string);
      expect(sqls[0]).toBe('BEGIN');
      expect(sqls[sqls.length - 1]).toBe('COMMIT');
      // 更新用户金币经验
      const userUpdate = mocks.clientQueryMock.mock.calls.find(
        ([sql]) => (sql as string).includes('UPDATE users'),
      );
      expect(userUpdate).toBeDefined();
      const userParams = userUpdate![1] as unknown[];
      // 参数顺序：[exp, gold, userId]
      expect(userParams[0]).toBe(80);
      expect(userParams[1]).toBe(200);
      expect(userParams[2]).toBe('u1');
      // 更新角色离线时间
      const charUpdate = mocks.clientQueryMock.mock.calls.find(
        ([sql]) => (sql as string).includes('UPDATE characters'),
      );
      expect(charUpdate).toBeDefined();
      expect((charUpdate![1] as unknown[])[0]).toBe('u1');
      // finally 块确保连接释放
      expect(mocks.releaseMock).toHaveBeenCalledOnce();
    });

    it('事务中途抛错时执行 ROLLBACK 并释放连接，错误透传', async () => {
      mocks.calculateOfflineMock.mockResolvedValue({ exp: 10, gold: 20, duration: 60 });
      // 让 UPDATE users 抛错，模拟事务中途失败
      mocks.clientQueryMock.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('UPDATE users')) {
          return Promise.reject(new Error('写入失败'));
        }
        return Promise.resolve({ rows: [] });
      });

      await expect(claimOffline('u1')).rejects.toThrow('写入失败');

      const sqls = mocks.clientQueryMock.mock.calls.map(([sql]) => sql as string);
      // 失败路径必须以 ROLLBACK 收尾，不能误用 COMMIT
      expect(sqls[sqls.length - 1]).toBe('ROLLBACK');
      // finally 块确保异常路径也释放连接
      expect(mocks.releaseMock).toHaveBeenCalledOnce();
    });

    it('零收益（已被并发领取或刚领取过）早返回，不写库但仍 COMMIT 释放锁', async () => {
      // 模拟 advisory lock 串行化后，前一个并发请求已 COMMIT 重置 idle_since=NOW()，重算时间差接近 0
      mocks.calculateOfflineMock.mockResolvedValue({ exp: 0, gold: 0, offlineSeconds: 0, cappedHours: 0 });

      const result = await claimOffline('u1');

      expect(result).toEqual({ exp: 0, gold: 0, offlineSeconds: 0, cappedHours: 0 });
      const sqls = mocks.clientQueryMock.mock.calls.map(([sql]) => sql as string);
      // 仍以 BEGIN / COMMIT 收尾，保证 advisory lock 正常释放
      expect(sqls[0]).toBe('BEGIN');
      expect(sqls[sqls.length - 1]).toBe('COMMIT');
      // 关键断言：零收益时不得执行任何 UPDATE，避免空收益写入与无谓 IO
      expect(sqls.some((s) => s.includes('UPDATE users'))).toBe(false);
      expect(sqls.some((s) => s.includes('UPDATE characters'))).toBe(false);
      expect(mocks.releaseMock).toHaveBeenCalledOnce();
    });
  });

  describe('switchArea 切换挂机区域', () => {
    it('区域不存在时抛 NOT_FOUND "区域不存在"', async () => {
      mocks.queryMock.mockResolvedValue({ rows: [] });

      await expect(switchArea('u1', 99)).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
        message: '区域不存在',
      });
      // 区域不存在时不应再查角色，避免无意义查询
      expect(mocks.queryMock).toHaveBeenCalledTimes(1);
      expect(mocks.switchAreaMock).not.toHaveBeenCalled();
    });

    it('角色不存在时抛 NOT_FOUND "角色不存在"', async () => {
      // 第一次查区域命中，第二次查角色为空
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [{ id: 2, required_level: 5 }] })
        .mockResolvedValueOnce({ rows: [] });

      await expect(switchArea('u1', 2)).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
        message: '角色不存在',
      });
      expect(mocks.switchAreaMock).not.toHaveBeenCalled();
    });

    it('角色等级不足时抛 FORBIDDEN 含所需等级提示', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [{ id: 2, required_level: 10 }] })
        .mockResolvedValueOnce({ rows: [{ level: 3 }] });

      await expect(switchArea('u1', 2)).rejects.toMatchObject({
        code: ErrorCode.FORBIDDEN,
        message: '需要等级 10 才能进入此区域',
      });
      expect(mocks.switchAreaMock).not.toHaveBeenCalled();
    });

    it('校验通过后委托给 idleEngine.switchArea 并返回 success:true', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [{ id: 2, required_level: 5 }] })
        .mockResolvedValueOnce({ rows: [{ level: 10 }] });
      mocks.switchAreaMock.mockResolvedValue(undefined);

      const result = await switchArea('u1', 2);

      expect(mocks.switchAreaMock).toHaveBeenCalledWith('u1', 2);
      expect(result).toEqual({ success: true });
    });
  });

  describe('upgradeCharacter 升级属性', () => {
    it('直接委托给 idleEngine.upgradeCharacter 并透传参数与返回值', async () => {
      const ret = { newLevel: 6, cost: 50 };
      mocks.upgradeCharacterMock.mockResolvedValue(ret);

      const result = await upgradeCharacter('u1', 'attack', 'weapon');

      expect(mocks.upgradeCharacterMock).toHaveBeenCalledWith('u1', 'attack', 'weapon');
      expect(result).toBe(ret);
    });
  });

  describe('settle 在线结算', () => {
    it('直接委托给 idleEngine.settle 并透传参数与返回值', async () => {
      const ret = { exp: 30, gold: 15 };
      mocks.settleMock.mockResolvedValue(ret);

      const result = await settle('u1', 120);

      expect(mocks.settleMock).toHaveBeenCalledWith('u1', 120);
      expect(result).toBe(ret);
    });
  });
});
