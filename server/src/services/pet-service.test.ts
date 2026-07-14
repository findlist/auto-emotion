// server/src/services/pet-service.test.ts
// 宠物服务单元测试：覆盖列表查询、装备切换事务、购买金币扣减事务
// 设计原因：equipPet 含"取消旧装备 + 装备新宠物"两步操作需事务保护防部分失败；
// buyPet 涉及金币扣减与宠物解锁，需校验拥有/金币/扣减事务边界；
// 两方法均用 ROLLBACK + release 防连接泄漏。

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCode } from '../utils/error.js';

// 使用 vi.hoisted 提升 mock，确保 vi.mock 工厂能引用
const mocks = vi.hoisted(() => ({
  // pool.query：宠物列表查询（buyPet 的 pets 查询已修正为事务内 client.query）
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

import { listPets, equipPet, buyPet } from './pet-service.js';

describe('pet-service 宠物服务', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectMock.mockResolvedValue({
      query: mocks.clientQueryMock,
      release: mocks.releaseMock,
    });
    mocks.queryMock.mockResolvedValue({ rows: [] });
    mocks.clientQueryMock.mockResolvedValue({ rows: [] });
  });

  describe('listPets 宠物列表', () => {
    it('透传查询结果（含装备状态）', async () => {
      const rows = [
        { id: 1, name: '小猫', is_equipped: true },
        { id: 2, name: '小狗', is_equipped: false },
      ];
      mocks.queryMock.mockResolvedValueOnce({ rows });

      const result = await listPets('u1');

      expect(result).toEqual(rows);
      // 验证 LEFT JOIN 查询包含 user_id 参数
      expect(mocks.queryMock).toHaveBeenCalledWith(
        expect.stringContaining('LEFT JOIN user_pets'),
        ['u1']
      );
    });
  });

  describe('equipPet 装备宠物', () => {
    it('未拥有宠物时抛 NOT_FOUND', async () => {
      mocks.clientQueryMock
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // SELECT user_pets 空记录

      await expect(equipPet('u1', 99)).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
        message: '未拥有该宠物',
      });
      // 业务异常也触发 ROLLBACK
      expect(mocks.clientQueryMock).toHaveBeenCalledWith('ROLLBACK');
      expect(mocks.releaseMock).toHaveBeenCalled();
    });

    it('拥有宠物时取消旧装备 + 装备新宠物 + COMMIT', async () => {
      mocks.clientQueryMock
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // SELECT user_pets 有记录
        .mockResolvedValueOnce({ rows: [] }) // UPDATE 取消当前装备
        .mockResolvedValueOnce({ rows: [] }); // UPDATE 装备新宠物

      const result = await equipPet('u1', 2);

      expect(result).toEqual({ success: true, petId: 2 });
      // 验证先取消所有装备（WHERE user_id）
      expect(mocks.clientQueryMock).toHaveBeenCalledWith(
        expect.stringContaining('SET is_equipped = FALSE WHERE user_id = $1'),
        ['u1']
      );
      // 验证再装备新宠物（WHERE user_id AND pet_id）
      expect(mocks.clientQueryMock).toHaveBeenCalledWith(
        expect.stringContaining('SET is_equipped = TRUE WHERE user_id = $1 AND pet_id = $2'),
        ['u1', 2]
      );
      expect(mocks.clientQueryMock).toHaveBeenCalledWith('COMMIT');
      expect(mocks.releaseMock).toHaveBeenCalled();
    });

    it('事务失败时 ROLLBACK + release + 透传错误', async () => {
      const error = new Error('UPDATE 失败');
      mocks.clientQueryMock
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // SELECT 有记录
        .mockImplementationOnce(() => Promise.reject(error)); // UPDATE 取消抛错

      await expect(equipPet('u1', 2)).rejects.toThrow('UPDATE 失败');

      expect(mocks.clientQueryMock).toHaveBeenCalledWith('ROLLBACK');
      expect(mocks.releaseMock).toHaveBeenCalled();
    });
  });

  describe('buyPet 购买宠物', () => {
    it('宠物不存在抛 NOT_FOUND', async () => {
      mocks.clientQueryMock
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // client.query 查 pets 空（事务内）

      await expect(buyPet('u1', 99)).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
        message: '宠物不存在',
      });
      expect(mocks.clientQueryMock).toHaveBeenCalledWith('ROLLBACK');
      expect(mocks.releaseMock).toHaveBeenCalled();
    });

    it('已拥有宠物抛 CONFLICT', async () => {
      mocks.clientQueryMock
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1, name: '小猫', unlock_cost_gold: 100 }] }) // client.query 查 pets
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // SELECT user_pets 已拥有

      await expect(buyPet('u1', 1)).rejects.toMatchObject({
        code: ErrorCode.CONFLICT,
        message: '已拥有该宠物',
      });
      expect(mocks.clientQueryMock).toHaveBeenCalledWith('ROLLBACK');
    });

    it('金币不足抛 FORBIDDEN', async () => {
      mocks.clientQueryMock
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1, name: '小猫', unlock_cost_gold: 500 }] }) // client.query 查 pets
        .mockResolvedValueOnce({ rows: [] }) // SELECT user_pets 未拥有
        .mockResolvedValueOnce({ rows: [{ gold: 100 }] }); // SELECT users 金币不足

      await expect(buyPet('u1', 1)).rejects.toMatchObject({
        code: ErrorCode.FORBIDDEN,
        message: '金币不足，需要 500 金币',
      });
      expect(mocks.clientQueryMock).toHaveBeenCalledWith('ROLLBACK');
    });

    it('购买成功执行扣金币 + INSERT user_pets + COMMIT', async () => {
      mocks.clientQueryMock
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 2, name: '小狗', unlock_cost_gold: 200 }] }) // client.query 查 pets
        .mockResolvedValueOnce({ rows: [] }) // SELECT user_pets 未拥有
        .mockResolvedValueOnce({ rows: [{ gold: 500 }] }) // SELECT users 金币充足
        // 原子守卫 RETURNING gold 需返回非空 rows，否则会被判定为并发扣减失败
        .mockResolvedValueOnce({ rows: [{ gold: 300 }] }) // UPDATE 扣金币成功（500-200=300）
        .mockResolvedValueOnce({ rows: [] }); // INSERT user_pets

      const result = await buyPet('u1', 2);

      expect(result).toEqual({ success: true, petId: 2 });
      // 验证扣除金币（unlock_cost_gold）— 原子守卫带 AND gold >= $1 RETURNING gold
      expect(mocks.clientQueryMock).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET gold = gold - $1'),
        [200, 'u1']
      );
      // 验证创建用户宠物记录
      expect(mocks.clientQueryMock).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_pets'),
        ['u1', 2]
      );
      expect(mocks.clientQueryMock).toHaveBeenCalledWith('COMMIT');
      expect(mocks.releaseMock).toHaveBeenCalled();
    });

    it('事务失败时 ROLLBACK + release + 透传错误', async () => {
      const error = new Error('INSERT 失败');
      mocks.clientQueryMock
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1, name: '小猫', unlock_cost_gold: 100 }] }) // client.query 查 pets
        .mockResolvedValueOnce({ rows: [] }) // SELECT user_pets 未拥有
        .mockResolvedValueOnce({ rows: [{ gold: 500 }] }) // SELECT users
        // 原子守卫 RETURNING gold 需返回非空 rows，否则会在扣金币步骤抛"金币不足"而非 INSERT 抛错
        .mockResolvedValueOnce({ rows: [{ gold: 400 }] }) // UPDATE 扣金币成功（500-100=400）
        .mockImplementationOnce(() => Promise.reject(error)); // INSERT 抛错

      await expect(buyPet('u1', 1)).rejects.toThrow('INSERT 失败');

      expect(mocks.clientQueryMock).toHaveBeenCalledWith('ROLLBACK');
      expect(mocks.releaseMock).toHaveBeenCalled();
    });
  });
});
