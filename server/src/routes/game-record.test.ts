// server/src/routes/game-record.test.ts
// 战绩路由单元测试：建立 route 层测试范式
// 设计原因：route 层此前覆盖率 0%，是后端覆盖率提升最大空间。
// 范式选型：项目无 supertest 依赖，遵循"禁止随意新增依赖"红线，
// 改用 Node 20+ 内置 fetch + 独立 Express app 监听随机端口方式发起真实 HTTP 请求，
// 既能验证路由注册、参数解析、响应格式，又不引入新依赖。
// mock 边界：service 层与 authMiddleware 全量 mock，route 测试聚焦路由本身行为，
// service 内部逻辑由 service 测试覆盖，auth 行为由 auth.test.ts 覆盖。

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';

// mock 战绩 service：仅关注 route 是否正确调用与透传，不验证 service 内部 SQL
vi.mock('../services/record-service.js', () => ({
  listRecords: vi.fn(),
  getRecord: vi.fn(),
}));

// mock authMiddleware：跳过真实 JWT/Redis 校验，直接注入 req.user，
// 使 route 测试不依赖外部中间件状态
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (req: unknown, _res: unknown, next: () => void) => {
    (req as { user: unknown }).user = { userId: 'u1', phone: '13800000000' };
    next();
  },
}));

import router from './game-record.js';
import * as recordService from '../services/record-service.js';
import { errorHandler } from '../middleware/error-handler.js';
import { AppError, ErrorCode } from '../utils/error.js';

// 共享 Express app 与服务器实例，避免每个用例重复 listen/close
let server: Server;
let baseURL: string;

beforeAll(() => {
  const app = express();
  app.use(express.json());
  app.use('/api/game-records', router);
  // 挂载全局错误处理，验证 route 抛出的 AppError 能正确冒泡并按错误码响应
  app.use(errorHandler);
  server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  baseURL = `http://localhost:${port}/api/game-records`;
});

afterAll(() => server.close());

describe('game-record 战绩路由', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('GET / 战绩列表', () => {
    it('默认分页调用 listRecords(userId, 1, 10) 并返回统一响应结构', async () => {
      (recordService.listRecords as ReturnType<typeof vi.fn>).mockResolvedValue({
        records: [{ id: 1, mode: 'boss' }],
        total: 1,
        page: 1,
        pageSize: 10,
      });

      const res = await fetch(`${baseURL}/`);
      const body = await res.json();

      expect(res.status).toBe(200);
      // 统一响应结构 { code, message, data }
      expect(body).toEqual({
        code: 200,
        message: 'ok',
        data: { records: [{ id: 1, mode: 'boss' }], total: 1, page: 1, pageSize: 10 },
      });
      // 验证 userId 来自 authMiddleware 注入，分页使用默认值
      expect(recordService.listRecords).toHaveBeenCalledWith('u1', 1, 10);
    });

    it('自定义分页 page=2&pageSize=5 透传至 service', async () => {
      (recordService.listRecords as ReturnType<typeof vi.fn>).mockResolvedValue({
        records: [],
        total: 0,
        page: 2,
        pageSize: 5,
      });

      const res = await fetch(`${baseURL}/?page=2&pageSize=5`);
      await res.json();

      // 验证 query 参数被正确解析为 number 并透传
      expect(recordService.listRecords).toHaveBeenCalledWith('u1', 2, 5);
    });
  });

  describe('GET /:id 战绩详情', () => {
    it('调用 getRecord(recordId, userId) 返回单条详情', async () => {
      (recordService.getRecord as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 9,
        mode: 'boss',
        nickname: '玩家',
      });

      const res = await fetch(`${baseURL}/9`);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({ id: 9, mode: 'boss', nickname: '玩家' });
      // 验证路径参数与 userId 透传顺序
      expect(recordService.getRecord).toHaveBeenCalledWith('9', 'u1');
    });

    it('service 抛 NOT_FOUND 时冒泡至 errorHandler 返回 404 + 业务错误码', async () => {
      (recordService.getRecord as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AppError(ErrorCode.NOT_FOUND, '战绩不存在')
      );

      const res = await fetch(`${baseURL}/999`);
      const body = await res.json();

      // NOT_FOUND 按 ErrorCode 语义映射为 HTTP 404，业务码保留
      expect(res.status).toBe(404);
      expect(body.code).toBe(ErrorCode.NOT_FOUND);
      expect(body.message).toBe('战绩不存在');
    });
  });
});
