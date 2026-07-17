// server/src/services/leaderboard-service.test.ts
// 排行榜服务单元测试：覆盖三类榜单字段映射、分页 rank 计算、用户排名查询、
// 好友榜单、Redis+DB 双写更新分数
// 设计原因：getLeaderboard 依赖动态字段拼接（power/battle_score/speed_score），
// 字段映射错误会导致排行榜错乱；updateUserScore 涉及 Redis ZSET 与 DB 双写，
// 一致性是核心风险点；getUserRank 含两段查询与 null 兜底，需逐分支覆盖。

import { describe, it, expect, vi, beforeEach } from 'vitest';

// 使用 vi.hoisted 提升 mock，确保 vi.mock 工厂能引用
const mocks = vi.hoisted(() => ({
  // pool.query：榜单查询、用户排名、总数统计
  queryMock: vi.fn(),
  // redis.zadd：排行榜 ZSET 写入
  zaddMock: vi.fn(),
}));

vi.mock('../config/database.js', () => ({
  default: { query: mocks.queryMock },
}));

vi.mock('../config/redis.js', () => ({
  default: { zadd: mocks.zaddMock },
}));

import {
  getLeaderboard,
  getUserRank,
  getPowerLeaderboard,
  getBattleLeaderboard,
  getSpeedLeaderboard,
  updateUserScore,
  getFriendsLeaderboard,
  getFriendsUserRank,
} from './leaderboard-service.js';

describe('leaderboard-service 排行榜服务', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryMock.mockResolvedValue({ rows: [] });
    mocks.zaddMock.mockResolvedValue(1);
  });

  describe('getLeaderboard 榜单查询', () => {
    it('power 类型按 power 字段排序与分页 rank 计算', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({ // 榜单查询
          rows: [
            { user_id: 'uuid-1', nickname: 'A', score: 100 },
            { user_id: 'uuid-2', nickname: 'B', score: 90 },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ total: '50' }] }); // 总数

      const result = await getLeaderboard('power', 2, 10);

      // offset = (2-1)*10 = 10，rank 从 11 开始
      expect(result.ranking[0]).toEqual({ rank: 11, userId: 'uuid-1', nickname: 'A', score: 100 });
      expect(result.ranking[1]).toEqual({ rank: 12, userId: 'uuid-2', nickname: 'B', score: 90 });
      expect(result.total).toBe(50);
      // 验证 SQL 使用 power 字段
      expect(mocks.queryMock.mock.calls[0][0]).toContain('power');
      expect(mocks.queryMock.mock.calls[0][0]).toContain('ORDER BY');
    });

    it('battle 类型映射 battle_score 字段', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [{ user_id: 'uuid-1', nickname: 'A', score: 200 }] })
        .mockResolvedValueOnce({ rows: [{ total: '1' }] });

      await getLeaderboard('battle', 1, 20);

      // SQL 应包含 battle_score 字段名
      expect(mocks.queryMock.mock.calls[0][0]).toContain('battle_score');
    });

    it('speed 类型映射 speed_score 字段', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [{ user_id: 'uuid-1', nickname: 'A', score: 50 }] })
        .mockResolvedValueOnce({ rows: [{ total: '1' }] });

      await getLeaderboard('speed', 1, 20);

      expect(mocks.queryMock.mock.calls[0][0]).toContain('speed_score');
    });

    it('score 为 null 兜底为 0', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [{ user_id: 'uuid-1', nickname: 'A', score: null }] })
        .mockResolvedValueOnce({ rows: [{ total: '1' }] });

      const result = await getLeaderboard('power', 1, 20);

      expect(result.ranking[0].score).toBe(0);
    });
  });

  describe('getUserRank 用户排名', () => {
    it('用户存在返回 rank 与 score', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [{ rank: 3 }] }) // 排名查询
        .mockResolvedValueOnce({ rows: [{ score: 100 }] }); // 分数查询

      const result = await getUserRank('1', 'power');

      expect(result).toEqual({ rank: 3, score: 100 });
    });

    it('用户不存在返回 null，不再查分数', async () => {
      mocks.queryMock.mockResolvedValueOnce({ rows: [] });

      const result = await getUserRank('999', 'power');

      expect(result).toBeNull();
      expect(mocks.queryMock).toHaveBeenCalledTimes(1);
    });

    it('score 为 null 兜底为 0', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [{ rank: 1 }] })
        .mockResolvedValueOnce({ rows: [{ score: null }] });

      const result = await getUserRank('1', 'battle');

      expect(result).toEqual({ rank: 1, score: 0 });
    });
  });

  describe('三个便捷方法透传', () => {
    it('getPowerLeaderboard 透传 power 类型', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      await getPowerLeaderboard(1, 5);

      expect(mocks.queryMock.mock.calls[0][0]).toContain('power');
    });

    it('getBattleLeaderboard 透传 battle 类型', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      await getBattleLeaderboard(1, 5);

      expect(mocks.queryMock.mock.calls[0][0]).toContain('battle_score');
    });

    it('getSpeedLeaderboard 透传 speed 类型', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      await getSpeedLeaderboard(1, 5);

      expect(mocks.queryMock.mock.calls[0][0]).toContain('speed_score');
    });
  });

  describe('updateUserScore 分数双写', () => {
    it('power 类型同时写 Redis ZSET 与 DB power 字段', async () => {
      await updateUserScore('1', 'power', 999);

      // Redis ZSET 写入
      expect(mocks.zaddMock).toHaveBeenCalledWith('leaderboard:power', 999, '1');
      // DB UPDATE 使用 power 字段
      expect(mocks.queryMock).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET power'),
        [999, '1']
      );
    });

    it('battle 类型映射 battle_score 字段', async () => {
      await updateUserScore('1', 'battle', 200);

      expect(mocks.zaddMock).toHaveBeenCalledWith('leaderboard:battle', 200, '1');
      expect(mocks.queryMock).toHaveBeenCalledWith(
        expect.stringContaining('battle_score'),
        [200, '1']
      );
    });

    it('speed 类型映射 speed_score 字段', async () => {
      await updateUserScore('1', 'speed', 50);

      expect(mocks.zaddMock).toHaveBeenCalledWith('leaderboard:speed', 50, '1');
      expect(mocks.queryMock).toHaveBeenCalledWith(
        expect.stringContaining('speed_score'),
        [50, '1']
      );
    });
  });

  describe('getFriendsLeaderboard 好友榜单', () => {
    it('包含好友与自己，按 power 排序', async () => {
      // 好友列表查询（friend_id 为 UUID 字符串，与 schema 对齐）
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [{ friend_id: 'uuid-2' }, { friend_id: 'uuid-3' }] })
        // 好友排行查询
        .mockResolvedValueOnce({
          rows: [
            { user_id: 'uuid-1', nickname: '我', score: 300 },
            { user_id: 'uuid-2', nickname: '好友A', score: 200 },
          ],
        });

      const result = await getFriendsLeaderboard('uuid-1', 1, 20);

      // 2 好友 + 自己 = 3
      expect(result.total).toBe(3);
      expect(result.ranking[0]).toEqual({ rank: 1, userId: 'uuid-1', nickname: '我', score: 300 });
      // 验证 ANY 参数包含自己（UUID 字符串）与好友
      const anyParam = mocks.queryMock.mock.calls[1][1][0];
      expect(anyParam).toEqual(expect.arrayContaining(['uuid-1', 'uuid-2', 'uuid-3']));
    });

    it('无好友仅自己，total=1', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [] }) // 无好友
        .mockResolvedValueOnce({ rows: [{ user_id: 'uuid-1', nickname: '我', score: 100 }] });

      const result = await getFriendsLeaderboard('uuid-1', 1, 20);

      expect(result.total).toBe(1);
      expect(result.ranking[0]).toEqual({ rank: 1, userId: 'uuid-1', nickname: '我', score: 100 });
    });

    it('score 为 null 兜底为 0', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ user_id: 'uuid-1', nickname: '我', score: null }] });

      const result = await getFriendsLeaderboard('uuid-1', 1, 20);

      expect(result.ranking[0].score).toBe(0);
    });
  });

  describe('getFriendsUserRank 好友圈个人排名', () => {
    it('用户存在返回好友圈内 rank 与 score', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [{ friend_id: 'uuid-2' }, { friend_id: 'uuid-3' }] }) // 好友列表
        .mockResolvedValueOnce({ rows: [{ rank: 2 }] }) // 好友圈排名
        .mockResolvedValueOnce({ rows: [{ score: 200 }] }); // 分数查询

      const result = await getFriendsUserRank('uuid-1');

      expect(result).toEqual({ rank: 2, score: 200 });
      // 验证 ANY 参数包含自己与好友（均为 UUID 字符串）
      const anyParam = mocks.queryMock.mock.calls[1][1][0];
      expect(anyParam).toEqual(expect.arrayContaining(['uuid-1', 'uuid-2', 'uuid-3']));
    });

    it('无好友仅自己，rank=1', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [] }) // 无好友
        .mockResolvedValueOnce({ rows: [{ rank: 1 }] })
        .mockResolvedValueOnce({ rows: [{ score: 100 }] });

      const result = await getFriendsUserRank('uuid-1');

      expect(result).toEqual({ rank: 1, score: 100 });
    });

    it('用户不存在返回 null，不再查分数', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [] }) // 无好友
        .mockResolvedValueOnce({ rows: [] }); // 排名查询无结果

      const result = await getFriendsUserRank('uuid-999');

      expect(result).toBeNull();
      // 排名查询失败后不应再查分数（共 2 次查询：好友列表 + 排名）
      expect(mocks.queryMock).toHaveBeenCalledTimes(2);
    });

    it('score 为 null 兜底为 0', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ rank: 1 }] })
        .mockResolvedValueOnce({ rows: [{ score: null }] });

      const result = await getFriendsUserRank('uuid-1');

      expect(result).toEqual({ rank: 1, score: 0 });
    });
  });
});
