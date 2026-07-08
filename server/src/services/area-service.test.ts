// server/src/services/area-service.test.ts
// 挂机区域服务单元测试：覆盖区域列表排序、单条查询存在/不存在兜底
// 设计原因：listAreas 是挂机区域选择的唯一数据来源，SQL 含 ORDER BY required_level
// 保证按解锁等级递增展示；getArea 返回 null 兜底是 route 层 NOT_FOUND 判定前置依赖。

import { describe, it, expect, vi, beforeEach } from 'vitest';

// 使用 vi.hoisted 提升 mock，确保 vi.mock 工厂能引用
const mocks = vi.hoisted(() => ({
  // pool.query：区域列表与单条查询
  queryMock: vi.fn(),
}));

vi.mock('../config/database.js', () => ({
  default: { query: mocks.queryMock },
}));

import { listAreas, getArea } from './area-service.js';

describe('area-service 挂机区域服务', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryMock.mockResolvedValue({ rows: [] });
  });

  describe('listAreas 区域列表', () => {
    it('返回区域列表并按 required_level 排序', async () => {
      mocks.queryMock.mockResolvedValueOnce({
        rows: [
          { id: 1, name: '职场焦虑区', required_level: 1 },
          { id: 2, name: '生活烦躁区', required_level: 10 },
        ],
      });

      const result = await listAreas();

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ id: 1, name: '职场焦虑区' });
      // SQL 必须含 ORDER BY required_level，保证解锁顺序展示
      const sql = mocks.queryMock.mock.calls[0][0];
      expect(sql).toContain('ORDER BY required_level');
    });

    it('无区域时返回空数组', async () => {
      mocks.queryMock.mockResolvedValueOnce({ rows: [] });

      const result = await listAreas();

      expect(result).toEqual([]);
    });
  });

  describe('getArea 单条区域查询', () => {
    it('区域存在返回首行', async () => {
      mocks.queryMock.mockResolvedValueOnce({
        rows: [{ id: 1, name: '职场焦虑区', required_level: 1, difficulty: 1 }],
      });

      const result = await getArea(1);

      expect(result).toMatchObject({ id: 1, name: '职场焦虑区' });
      // 验证查询参数 [areaId]
      expect(mocks.queryMock.mock.calls[0][1]).toEqual([1]);
    });

    it('区域不存在返回 null 兜底', async () => {
      mocks.queryMock.mockResolvedValueOnce({ rows: [] });

      const result = await getArea(999);

      // 返回 null 而非抛错，由 route 层判定 NOT_FOUND
      expect(result).toBeNull();
      // SQL 必须含 WHERE id = $1 过滤
      const sql = mocks.queryMock.mock.calls[0][0];
      expect(sql).toContain('WHERE id = $1');
    });
  });
});
