// server/src/services/season-pass-service.test.ts
// 赛季通行证服务单元测试：覆盖赛季信息查询、购买通行证事务、奖励领取事务边界
// 设计原因：claimSeasonReward 含双重校验（等级 + 通行证类型）与奖励发放事务，
// 需验证防双发（CONFLICT）与 ROLLBACK；buySeasonPass 用 FOR UPDATE 锁防并发购买；
// getCurrentSeason 涉及 3 表关联查询（users/seasons/user_season_rewards）需验证合并逻辑。

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCode } from '../utils/error.js';

// 使用 vi.hoisted 提升 mock，确保 vi.mock 工厂能引用
const mocks = vi.hoisted(() => ({
  // pool.query：用户查询、赛季查询、已领奖励查询
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

import {
  getCurrentSeason,
  buySeasonPass,
  addSeasonExp,
  claimSeasonReward,
} from './season-pass-service.js';

describe('season-pass-service 赛季通行证服务', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectMock.mockResolvedValue({
      query: mocks.clientQueryMock,
      release: mocks.releaseMock,
    });
    mocks.queryMock.mockResolvedValue({ rows: [] });
    mocks.clientQueryMock.mockResolvedValue({ rows: [] });
  });

  describe('getCurrentSeason 获取当前赛季信息', () => {
    it('用户不存在抛 NOT_FOUND', async () => {
      mocks.queryMock.mockResolvedValueOnce({ rows: [] }); // users 查询空

      await expect(getCurrentSeason('u1')).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
        message: '用户不存在',
      });
    });

    it('有赛季时返回赛季信息与奖励列表（含已领状态）', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({
          rows: [{ season_id: 1, season_level: 5, season_exp: 450, is_premium: true, season_started_at: null }],
        }) // users 查询
        .mockResolvedValueOnce({
          rows: [{ id: 7, name: '赛季1', started_at: '2026-07-01', ends_at: '2026-07-29' }],
        }) // seasons 查询
        .mockResolvedValueOnce({
          rows: [{ level: 1 }, { level: 3 }], // 已领奖励（level 1 和 3）
        });

      const result = await getCurrentSeason('u1');

      expect(result.seasonId).toBe(7);
      expect(result.seasonName).toBe('赛季1');
      expect(result.level).toBe(5);
      expect(result.isPremium).toBe(true);
      // rewards 应有 50 个等级（SEASON_MAX_LEVEL=50）
      expect(result.rewards).toHaveLength(50);
      // 验证已领取状态合并：level 1 已领，level 2 未领
      const level1 = result.rewards.find(r => r.level === 1)!;
      const level2 = result.rewards.find(r => r.level === 2)!;
      expect(level1.freeClaimed).toBe(true);
      expect(level2.freeClaimed).toBe(false);
    });

    it('无赛季时返回默认赛季信息', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({
          rows: [{ season_id: 0, season_level: 1, season_exp: 0, is_premium: false, season_started_at: null }],
        })
        .mockResolvedValueOnce({ rows: [] }) // seasons 查询空
        .mockResolvedValueOnce({ rows: [] }); // 已领奖励空

      const result = await getCurrentSeason('u1');

      expect(result.seasonId).toBe(0);
      expect(result.seasonName).toBe('赛季1'); // 默认名称
      // rewards 全部未领取
      expect(result.rewards.every(r => r.freeClaimed === false)).toBe(true);
    });
  });

  describe('buySeasonPass 购买通行证', () => {
    it('未购买时成功更新为高级通行证', async () => {
      mocks.clientQueryMock
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ is_premium: false }] }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rows: [] }); // UPDATE is_premium=true

      const result = await buySeasonPass('u1');

      expect(result).toEqual({ success: true });
      // 验证 FOR UPDATE 锁查询
      expect(mocks.clientQueryMock).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE'),
        ['u1']
      );
      expect(mocks.clientQueryMock).toHaveBeenCalledWith('COMMIT');
      expect(mocks.releaseMock).toHaveBeenCalled();
    });

    it('已购买时抛 CONFLICT 并 ROLLBACK', async () => {
      mocks.clientQueryMock
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ is_premium: true }] }); // SELECT FOR UPDATE 已购买

      await expect(buySeasonPass('u1')).rejects.toMatchObject({
        code: ErrorCode.CONFLICT,
        message: '已购买高级通行证',
      });
      // 业务异常也会触发 ROLLBACK（catch 块）
      expect(mocks.clientQueryMock).toHaveBeenCalledWith('ROLLBACK');
      expect(mocks.releaseMock).toHaveBeenCalled();
    });

    it('事务失败时 ROLLBACK + release + 透传错误', async () => {
      const error = new Error('UPDATE 失败');
      mocks.clientQueryMock
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ is_premium: false }] }) // SELECT
        .mockImplementationOnce(() => Promise.reject(error)); // UPDATE 抛错

      await expect(buySeasonPass('u1')).rejects.toThrow('UPDATE 失败');

      expect(mocks.clientQueryMock).toHaveBeenCalledWith('ROLLBACK');
      expect(mocks.releaseMock).toHaveBeenCalled();
    });
  });

  describe('addSeasonExp 添加赛季经验', () => {
    it('透传 UPDATE 调用', async () => {
      await addSeasonExp('u1', 100);

      expect(mocks.queryMock).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET season_exp = season_exp +'),
        [100, 'u1']
      );
    });
  });

  describe('claimSeasonReward 领取赛季奖励', () => {
    it('用户不存在抛 NOT_FOUND', async () => {
      mocks.queryMock.mockResolvedValueOnce({ rows: [] }); // users 查询空

      await expect(claimSeasonReward('u1', 1, false)).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
        message: '用户不存在',
      });
      expect(mocks.connectMock).not.toHaveBeenCalled();
    });

    it('等级不足抛 BAD_REQUEST', async () => {
      mocks.queryMock.mockResolvedValueOnce({
        rows: [{ season_level: 3, is_premium: false }],
      });

      await expect(claimSeasonReward('u1', 5, false)).rejects.toMatchObject({
        code: ErrorCode.BAD_REQUEST,
        message: '等级不足',
      });
    });

    it('领取高级奖励但无通行证抛 BAD_REQUEST', async () => {
      mocks.queryMock.mockResolvedValueOnce({
        rows: [{ season_level: 5, is_premium: false }],
      });

      await expect(claimSeasonReward('u1', 3, true)).rejects.toMatchObject({
        code: ErrorCode.BAD_REQUEST,
        message: '需要高级通行证',
      });
    });

    it('已领取抛 CONFLICT', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [{ season_level: 5, is_premium: false }] }) // users
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // 已领记录存在

      await expect(claimSeasonReward('u1', 3, false)).rejects.toMatchObject({
        code: ErrorCode.CONFLICT,
        message: '奖励已领取',
      });
    });

    it('领取免费奖励执行 INSERT + 发放金币 + COMMIT', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [{ season_level: 5, is_premium: false }] }) // users
        .mockResolvedValueOnce({ rows: [] }); // 未领取
      mocks.clientQueryMock
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // INSERT user_season_rewards
        .mockResolvedValueOnce({ rows: [] }); // UPDATE users gold

      const result = await claimSeasonReward('u1', 1, false);

      expect(result).toEqual({ success: true });
      // 验证记录领取（season_id=0 表示当前赛季）
      expect(mocks.clientQueryMock).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_season_rewards'),
        ['u1', 0, 1, false]
      );
      // 验证发放金币（免费奖励是 gold 类型）
      expect(mocks.clientQueryMock).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET gold = gold +'),
        [expect.any(Number), 'u1']
      );
      expect(mocks.clientQueryMock).toHaveBeenCalledWith('COMMIT');
      expect(mocks.releaseMock).toHaveBeenCalled();
    });

    it('领取高级奖励执行 INSERT + 发放道具 + COMMIT', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [{ season_level: 5, is_premium: true }] }) // users
        .mockResolvedValueOnce({ rows: [] }); // 未领取
      mocks.clientQueryMock
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // INSERT user_season_rewards
        .mockResolvedValueOnce({ rows: [] }); // INSERT user_inventory

      const result = await claimSeasonReward('u1', 2, true);

      expect(result).toEqual({ success: true });
      // 验证记录领取（is_premium=true）
      expect(mocks.clientQueryMock).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_season_rewards'),
        ['u1', 0, 2, true]
      );
      // 验证发放道具（高级奖励是 skin 类型，写入背包）
      const inventoryCalls = mocks.clientQueryMock.mock.calls.filter(([sql]) =>
        String(sql).includes('INSERT INTO user_inventory')
      );
      expect(inventoryCalls).toHaveLength(1);
      // 参数：user_id, reward_type, reward_id
      expect(inventoryCalls[0][1]).toEqual(['u1', 'skin', expect.any(Number)]);
    });

    it('事务失败时 ROLLBACK + release + 透传错误', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [{ season_level: 5, is_premium: false }] })
        .mockResolvedValueOnce({ rows: [] });
      const error = new Error('INSERT 失败');
      mocks.clientQueryMock
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockImplementationOnce(() => Promise.reject(error)); // INSERT 抛错

      await expect(claimSeasonReward('u1', 1, false)).rejects.toThrow('INSERT 失败');

      expect(mocks.clientQueryMock).toHaveBeenCalledWith('ROLLBACK');
      expect(mocks.releaseMock).toHaveBeenCalled();
    });
  });
});
