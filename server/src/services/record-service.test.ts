// server/src/services/record-service.test.ts
// 战绩查询服务单元测试：覆盖分页列表、单条详情、不存在兜底
// 设计原因：listRecords 含 count + 列表双查询与 offset 分页计算，
// getRecord 涉及 JOIN 查询与 NOT_FOUND 兜底，是战绩页核心数据来源。

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCode } from '../utils/error.js';

// 使用 vi.hoisted 提升 mock，确保 vi.mock 工厂能引用
const mocks = vi.hoisted(() => ({
  // pool.query：战绩 count 与列表查询
  queryMock: vi.fn(),
}));

vi.mock('../config/database.js', () => ({
  default: { query: mocks.queryMock },
}));

import { listRecords, getRecord } from './record-service.js';

describe('record-service 战绩服务', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryMock.mockResolvedValue({ rows: [] });
  });

  describe('listRecords 战绩分页列表', () => {
    it('默认分页 page=1 pageSize=10，offset=0', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [{ count: '15' }] }) // count 查询
        .mockResolvedValueOnce({ rows: [{ id: 1, mode: 'brawl' }, { id: 2, mode: 'boss' }] }); // 列表查询

      const result = await listRecords('u1');

      expect(result).toEqual({
        records: [{ id: 1, mode: 'brawl' }, { id: 2, mode: 'boss' }],
        total: 15,
        page: 1,
        pageSize: 10,
      });
      // 第二次查询参数：[userId, pageSize, offset] = ['u1', 10, 0]
      expect(mocks.queryMock.mock.calls[1][1]).toEqual(['u1', 10, 0]);
    });

    it('自定义分页 page=2 pageSize=5，offset=5', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [{ count: '20' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await listRecords('u1', 2, 5);

      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(5);
      // offset = (2-1)*5 = 5
      expect(mocks.queryMock.mock.calls[1][1]).toEqual(['u1', 5, 5]);
    });

    it('count 为字符串正确转 number', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [{ count: '42' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await listRecords('u1', 1, 10);

      expect(result.total).toBe(42);
      expect(typeof result.total).toBe('number');
    });

    it('SQL 含 JOIN game_record_players 与按 created_at DESC 排序', async () => {
      mocks.queryMock
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      await listRecords('u1', 1, 10);

      const listSql = mocks.queryMock.mock.calls[1][0];
      expect(listSql).toContain('JOIN game_record_players');
      expect(listSql).toContain('ORDER BY gr.created_at DESC');
    });
  });

  describe('getRecord 单条战绩详情', () => {
    it('战绩存在返回首行', async () => {
      mocks.queryMock.mockResolvedValueOnce({
        rows: [{ id: 1, mode: 'boss', nickname: '玩家', score: 100, is_mvp: true }],
      });

      const result = await getRecord('1', 'u1');

      expect(result).toEqual({ id: 1, mode: 'boss', nickname: '玩家', score: 100, is_mvp: true });
      // 验证查询参数 [recordId, userId]
      expect(mocks.queryMock.mock.calls[0][1]).toEqual(['1', 'u1']);
    });

    it('战绩不存在抛 NOT_FOUND', async () => {
      mocks.queryMock.mockResolvedValueOnce({ rows: [] });

      await expect(getRecord('999', 'u1')).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
      });
    });

    it('SQL 含双表 JOIN 与 user_id 过滤', async () => {
      mocks.queryMock.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      await getRecord('1', 'u1');

      const sql = mocks.queryMock.mock.calls[0][0];
      expect(sql).toContain('JOIN game_record_players');
      expect(sql).toContain('grp.user_id = $2');
    });
  });
});
