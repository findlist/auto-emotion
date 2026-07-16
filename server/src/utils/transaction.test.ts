// server/src/utils/transaction.test.ts
// 事务高阶工具单元测试：覆盖正常路径、业务异常、ROLLBACK 失败、BEGIN/COMMIT 失败、参数透传
// 设计原因：事务工具承载全项目 19 处事务的生命周期管理，BEGIN/COMMIT/ROLLBACK/release
// 四个关键节点的失败路径必须验证，否则一次回归即可能造成数据不一致或连接泄漏

import { describe, it, expect, vi, beforeEach } from 'vitest';

// 使用 vi.hoisted 提升 mock，确保 vi.mock 工厂能引用到
const { poolMock, clientMock } = vi.hoisted(() => ({
  poolMock: {
    connect: vi.fn(),
  },
  clientMock: {
    query: vi.fn(),
    release: vi.fn(),
  },
}));

vi.mock('../config/database.js', () => ({
  default: poolMock,
}));

// mock logger 避免真实日志输出干扰测试，同时可断言 ROLLBACK 失败日志
const { loggerMock } = vi.hoisted(() => ({
  loggerMock: { error: vi.fn() },
}));

vi.mock('./logger.js', () => ({
  logger: loggerMock,
}));

import { withTransaction } from './transaction.js';

describe('withTransaction 事务工具', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    poolMock.connect.mockResolvedValue(clientMock);
    // 默认 query 成功，用例用 mockResolvedValueOnce/mockRejectedValueOnce 覆盖关键节点
    clientMock.query.mockResolvedValue({ rows: [] });
  });

  it('正常路径：执行 BEGIN→work→COMMIT→release，返回 work 结果', async () => {
    const expectedResult = { id: 1, name: 'test' };

    const result = await withTransaction(async (tx) => {
      await tx.query('SELECT 1');
      return expectedResult;
    });

    expect(result).toEqual(expectedResult);
    // 验证事务生命周期顺序：BEGIN → 业务 query → COMMIT
    expect(clientMock.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(clientMock.query).toHaveBeenNthCalledWith(2, 'SELECT 1');
    expect(clientMock.query).toHaveBeenNthCalledWith(3, 'COMMIT');
    // 成功路径不应调用 ROLLBACK
    expect(clientMock.query).not.toHaveBeenCalledWith('ROLLBACK');
    // finally 必须释放连接，防止连接泄漏
    expect(clientMock.release).toHaveBeenCalledTimes(1);
  });

  it('业务异常：work 抛错 → ROLLBACK → release，透传原错误', async () => {
    const workError = new Error('业务失败');

    await expect(
      withTransaction(async () => {
        throw workError;
      })
    ).rejects.toBe(workError);

    // catch 内必须 ROLLBACK 回滚事务
    expect(clientMock.query).toHaveBeenCalledWith('ROLLBACK');
    expect(clientMock.release).toHaveBeenCalledTimes(1);
    // 业务异常不应触发 ROLLBACK 失败日志（ROLLBACK 成功）
    expect(loggerMock.error).not.toHaveBeenCalled();
  });

  it('ROLLBACK 失败：记录日志但不掩盖原始业务错误', async () => {
    const workError = new Error('业务失败');
    const rollbackError = new Error('ROLLBACK 连接断开');
    clientMock.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockRejectedValueOnce(rollbackError); // ROLLBACK 失败

    await expect(
      withTransaction(async () => {
        throw workError;
      })
    ).rejects.toBe(workError); // 透传的是 workError 而非 rollbackError

    // ROLLBACK 失败必须记录到日志，便于排查连接异常
    expect(loggerMock.error).toHaveBeenCalledWith('ROLLBACK 失败', {
      error: 'ROLLBACK 连接断开',
    });
    expect(clientMock.release).toHaveBeenCalledTimes(1);
  });

  it('BEGIN 失败：不执行 work，直接释放并透传错误', async () => {
    const beginError = new Error('BEGIN 失败');
    clientMock.query.mockRejectedValueOnce(beginError);

    const workSpy = vi.fn();
    await expect(
      withTransaction(async () => {
        workSpy();
        return 'ok';
      })
    ).rejects.toBe(beginError);

    // BEGIN 失败时事务未开始，work 不应执行
    expect(workSpy).not.toHaveBeenCalled();
    // 即使 BEGIN 失败，finally 也必须释放连接
    expect(clientMock.release).toHaveBeenCalledTimes(1);
  });

  it('COMMIT 失败：走 catch → ROLLBACK → 透传 COMMIT 错误', async () => {
    const commitError = new Error('COMMIT 失败');
    clientMock.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // work 内的 query
      .mockRejectedValueOnce(commitError) // COMMIT 失败
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK 成功

    await expect(
      withTransaction(async (tx) => {
        await tx.query('SELECT 1');
        return 'ok';
      })
    ).rejects.toBe(commitError);

    // COMMIT 失败后必须 ROLLBACK 回滚
    expect(clientMock.query).toHaveBeenCalledWith('ROLLBACK');
    expect(clientMock.release).toHaveBeenCalledTimes(1);
  });

  it('tx.query 透传参数给 client.query', async () => {
    await withTransaction(async (tx) => {
      await tx.query('UPDATE users SET gold = $1 WHERE id = $2', [100, 'u1']);
      return undefined;
    });

    // 验证 SQL 与 params 均被透传，未发生参数丢失或顺序错乱
    expect(clientMock.query).toHaveBeenCalledWith(
      'UPDATE users SET gold = $1 WHERE id = $2',
      [100, 'u1']
    );
  });

  it('work 返回 undefined 时正常 COMMIT 并返回 undefined', async () => {
    const result = await withTransaction(async () => {
      // 无返回值的事务（如纯写入）也应正常提交
      return undefined;
    });

    expect(result).toBeUndefined();
    expect(clientMock.query).toHaveBeenCalledWith('COMMIT');
    expect(clientMock.release).toHaveBeenCalledTimes(1);
  });
});
