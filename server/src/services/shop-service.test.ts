// server/src/services/shop-service.test.ts
// 商城服务单元测试：覆盖商品初始化、金币/钻石扣减事务、余额校验、背包查询
// 设计原因：buyItem 涉及货币扣减与背包写入需事务保护，金币/钻石双货币分支是核心质量风险点；
// ensureItemsExist 含 count=0 时的批量初始化逻辑，需验证幂等性。

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCode } from '../utils/error.js';

// 使用 vi.hoisted 提升 mock，确保 vi.mock 工厂能引用
const mocks = vi.hoisted(() => ({
  // pool.query：商品查询、用户余额查询、ensureItemsExist 初始化
  queryMock: vi.fn(),
  // 事务客户端的 query：BEGIN/UPDATE/INSERT/COMMIT/ROLLBACK
  clientQueryMock: vi.fn(),
  // 事务客户端 release：归还连接，泄漏会导致连接池耗尽
  releaseMock: vi.fn(),
  // pool.connect：获取事务客户端
  connectMock: vi.fn(),
}));

vi.mock('../config/database.js', () => ({
  default: {
    query: mocks.queryMock,
    connect: mocks.connectMock,
  },
}));

import { getShopItems, buyItem, getUserInventory } from './shop-service.js';

describe('shop-service 商城服务', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectMock.mockResolvedValue({
      query: mocks.clientQueryMock,
      release: mocks.releaseMock,
    });
    // pool.query 默认返回空行，用例用 mockResolvedValueOnce 覆盖关键查询
    mocks.queryMock.mockResolvedValue({ rows: [] });
    mocks.clientQueryMock.mockResolvedValue({ rows: [] });
  });

  describe('getShopItems 商品列表', () => {
    it('无 type 参数时返回全部商品，ensureItemsExist count>0 跳过初始化', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // COUNT 已有商品
        .mockResolvedValueOnce({ rows: [{ id: 1, name: '挂机加速卡' }] }); // 查询

      const result = await getShopItems();

      expect(result).toEqual([{ id: 1, name: '挂机加速卡' }]);
      // 验证查询 SQL 不含 type 过滤
      expect(mocks.queryMock).toHaveBeenNthCalledWith(
        2,
        expect.not.stringContaining('AND type'),
        []
      );
    });

    it('带 type 参数时查询带过滤条件', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 2, type: 'pet' }] });

      const result = await getShopItems('pet');

      expect(result).toEqual([{ id: 2, type: 'pet' }]);
      // 验证查询参数包含 type
      expect(mocks.queryMock).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('AND type = $1'),
        ['pet']
      );
    });

    it('ensureItemsExist count=0 时批量插入 9 个商品', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // COUNT=0 触发初始化
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // 初始化后查询（第 11 次调用）

      await getShopItems();

      // 验证 INSERT 调用 9 次（SHOP_ITEMS 模板数量）
      const insertCalls = mocks.queryMock.mock.calls.filter(([sql]) =>
        String(sql).includes('INSERT INTO shop_items')
      );
      expect(insertCalls).toHaveLength(9);
    });
  });

  describe('buyItem 购买商品', () => {
    it('商品不存在抛 NOT_FOUND', async () => {
      mocks.queryMock.mockResolvedValueOnce({ rows: [] }); // SELECT 商品空

      await expect(buyItem('1', 99)).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
        message: '商品不存在',
      });
      // 未进入事务，不应获取连接
      expect(mocks.connectMock).not.toHaveBeenCalled();
    });

    it('用户不存在抛 NOT_FOUND', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [{ id: 1, price: 100, price_type: 'gold' }] }) // 商品
        .mockResolvedValueOnce({ rows: [] }); // 用户不存在

      await expect(buyItem('1', 1)).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
        message: '用户不存在',
      });
    });

    it('金币不足抛 BAD_REQUEST', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [{ id: 1, price: 100, price_type: 'gold' }] })
        .mockResolvedValueOnce({ rows: [{ gold: 50, gems: 0 }] }); // 金币不足

      await expect(buyItem('1', 1)).rejects.toMatchObject({
        code: ErrorCode.BAD_REQUEST,
        message: '金币不足',
      });
    });

    it('钻石不足抛 BAD_REQUEST', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [{ id: 1, price: 100, price_type: 'gems' }] })
        .mockResolvedValueOnce({ rows: [{ gold: 0, gems: 50 }] }); // 钻石不足

      await expect(buyItem('1', 1)).rejects.toMatchObject({
        code: ErrorCode.BAD_REQUEST,
        message: '钻石不足',
      });
    });

    it('金币购买成功执行 BEGIN→UPDATE gold→INSERT 背包→COMMIT', async () => {
      const item = { id: 1, name: '加速卡', price: 100, price_type: 'gold', type: 'item' };
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [item] }) // 商品
        .mockResolvedValueOnce({ rows: [{ gold: 200, gems: 0 }] }); // 用户余额充足
      mocks.clientQueryMock
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ gold: 100 }] }) // UPDATE gold RETURNING gold（原子扣减成功，剩余 100）
        .mockResolvedValueOnce({ rows: [] }); // INSERT 背包

      const result = await buyItem('1', 1);

      expect(result).toEqual({ success: true, item });
      // 验证扣除金币
      expect(mocks.clientQueryMock).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET gold = gold - $1'),
        [100, '1']
      );
      // 验证写入背包（含 ON CONFLICT 数量+1）
      expect(mocks.clientQueryMock).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_inventory'),
        ['1', 'item', 1]
      );
      expect(mocks.clientQueryMock).toHaveBeenCalledWith('COMMIT');
      expect(mocks.releaseMock).toHaveBeenCalled();
    });

    it('钻石购买成功执行 UPDATE gems 分支', async () => {
      const item = { id: 2, name: '钻石商品', price: 50, price_type: 'gems', type: 'item' };
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [item] })
        .mockResolvedValueOnce({ rows: [{ gold: 0, gems: 100 }] });
      mocks.clientQueryMock
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ gems: 50 }] }) // UPDATE gems RETURNING gems（原子扣减成功，剩余 50）
        .mockResolvedValueOnce({ rows: [] }); // INSERT 背包

      const result = await buyItem('1', 2);

      expect(result).toEqual({ success: true, item });
      // 验证扣除钻石而非金币
      expect(mocks.clientQueryMock).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET gems = gems - $1'),
        [50, '1']
      );
      expect(mocks.clientQueryMock).not.toHaveBeenCalledWith(
        expect.stringContaining('SET gold = gold'),
        expect.anything()
      );
    });

    it('事务失败时 ROLLBACK 并 release 并透传错误', async () => {
      const item = { id: 1, price: 100, price_type: 'gold', type: 'item' };
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [item] })
        .mockResolvedValueOnce({ rows: [{ gold: 200, gems: 0 }] });
      const error = new Error('写入背包失败');
      mocks.clientQueryMock
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ gold: 100 }] }) // UPDATE gold RETURNING gold（扣减成功，继续 INSERT）
        .mockRejectedValueOnce(error); // INSERT 抛错

      await expect(buyItem('1', 1)).rejects.toThrow('写入背包失败');

      // 验证 ROLLBACK 与 release 均被调用，防止连接泄漏
      expect(mocks.clientQueryMock).toHaveBeenCalledWith('ROLLBACK');
      expect(mocks.releaseMock).toHaveBeenCalled();
    });
  });

  describe('getUserInventory 用户背包', () => {
    it('透传查询结果', async () => {
      const rows = [
        { id: 1, item_type: 'item', item_id: 1, quantity: 2, name: '加速卡', emoji: '⚡' },
      ];
      mocks.queryMock.mockResolvedValueOnce({ rows });

      const result = await getUserInventory('u1');

      expect(result).toEqual(rows);
      expect(mocks.queryMock).toHaveBeenCalledWith(
        expect.stringContaining('FROM user_inventory ui'),
        ['u1']
      );
    });
  });
});
