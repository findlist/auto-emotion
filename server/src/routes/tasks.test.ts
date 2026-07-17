// server/src/routes/tasks.test.ts
// 任务路由单元测试：复用 shop 范式（handler 内 req.user 检查 + try/catch + fail 自处理错误）
// 设计原因：tasks.ts 不使用 authMiddleware，每个 handler 内部检查 req.user 并用 fail() 自处理错误。
// 因此测试 app 不挂 errorHandler，改用可控中间件按 header 决定是否注入 req.user，
// 同时覆盖已授权正常流程与未授权 401 兜底两条路径。

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { controllableAuth, getServerPort, mockIdempotencyConflict } from './__helpers__/test-server.js';

// mock 任务 service：route 测试聚焦参数校验与错误兜底，service 行为由 service 测试覆盖
vi.mock('../services/task-service.js', () => ({
  getDailyTasks: vi.fn(),
  claimTaskReward: vi.fn(),
}));

// mock 幂等控制：claim 路由用 withIdempotency 防重复提交，
// 默认放行（返回 true）；幂等拦截场景用 mockImplementationOnce 调真实 fail 返回 409
// 真实 withIdempotency 行为（含 try/catch + fail 调用）由 idempotency.test.ts 单测覆盖
vi.mock('../utils/idempotency.js', () => ({
  withIdempotency: vi.fn().mockResolvedValue(true),
  checkIdempotency: vi.fn().mockResolvedValue(true),
}));

import router from './tasks.js';
import * as taskService from '../services/task-service.js';
import { ErrorCode } from '../utils/error.js';
import { withIdempotency } from '../utils/idempotency.js';

let server: Server;
let baseURL: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(controllableAuth);
  app.use('/api/tasks', router);
  // tasks 路由内部已 try/catch + fail 自处理错误，无需额外 errorHandler
  server = app.listen(0);
  const port = await getServerPort(server);
  baseURL = `http://localhost:${port}/api/tasks`;
});

afterAll(() => server.close());

describe('tasks 任务路由', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('GET /daily 每日任务列表', () => {
    it('未授权（无 req.user）返回 401', async () => {
      const res = await fetch(`${baseURL}/daily`, {
        headers: { 'x-test-no-auth': '1' },
      });
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.code).toBe(401);
      expect(body.message).toBe('未授权');
      // 未授权不应调用 service
      expect(taskService.getDailyTasks).not.toHaveBeenCalled();
    });

    it('已授权调用 getDailyTasks(userId) 返回 { tasks: [...] }', async () => {
      (taskService.getDailyTasks as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 1, type: 1, title: '完成1场对战', progress: 0, target: 1, claimed: false },
      ]);

      const res = await fetch(`${baseURL}/daily`);
      const body = await res.json();

      expect(res.status).toBe(200);
      // tasks 路由将结果包装为 { tasks: [...] }
      expect(body).toEqual({
        code: 200,
        message: 'ok',
        data: {
          tasks: [{ id: 1, type: 1, title: '完成1场对战', progress: 0, target: 1, claimed: false }],
        },
      });
      expect(taskService.getDailyTasks).toHaveBeenCalledWith('u1');
    });

    it('service 抛错时 fail 返回 500 + 错误消息', async () => {
      (taskService.getDailyTasks as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('任务查询失败')
      );

      const res = await fetch(`${baseURL}/daily`);
      const body = await res.json();

      // tasks 路由 GET /daily 异常路径固定 fail(res, 500, msg)
      expect(res.status).toBe(500);
      expect(body.code).toBe(500);
      expect(body.message).toBe('任务查询失败');
    });

    it('service 抛非 Error 值时 fail 返回 500 + 兜底文案', async () => {
      // 覆盖 catch 块三元 false 分支：reject 非 Error 值时使用兜底文案
      (taskService.getDailyTasks as ReturnType<typeof vi.fn>).mockRejectedValue('Redis 超时');

      const res = await fetch(`${baseURL}/daily`);
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.message).toBe('获取任务失败');
    });
  });

  describe('POST /:id/claim 领取任务奖励', () => {
    it('未授权返回 401', async () => {
      const res = await fetch(`${baseURL}/5/claim`, {
        method: 'POST',
        headers: { 'x-test-no-auth': '1' },
      });

      expect(res.status).toBe(401);
      expect(taskService.claimTaskReward).not.toHaveBeenCalled();
    });

    it('无效 ID（非数字）返回 400 "无效的任务ID"', async () => {
      const res = await fetch(`${baseURL}/abc/claim`, { method: 'POST' });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.code).toBe(400);
      expect(body.message).toBe('无效的任务ID');
      expect(taskService.claimTaskReward).not.toHaveBeenCalled();
    });

    it('幂等拦截命中（5秒内重复提交）时返回 409，不调用 claimTaskReward', async () => {
      // mock withIdempotency 命中拦截：调用 fail 返回 409 + 返回 false 让路由 return
      // 真实 withIdempotency 行为（catch AppError → 调 fail → 返回 false）由 idempotency.test.ts 覆盖
      mockIdempotencyConflict(withIdempotency);

      const res = await fetch(`${baseURL}/5/claim`, { method: 'POST' });
      const body = await res.json();

      // CONFLICT 按 ErrorCode 语义映射为 HTTP 409
      expect(res.status).toBe(409);
      expect(body.code).toBe(ErrorCode.CONFLICT);
      expect(body.message).toBe('请求已存在，请稍后重试');
      // 幂等拦截命中时不应调用 claimTaskReward 发奖
      expect(taskService.claimTaskReward).not.toHaveBeenCalled();
    });

    it('合法 ID 调用 claimTaskReward(userId, taskId) 返回领取结果', async () => {
      (taskService.claimTaskReward as ReturnType<typeof vi.fn>).mockResolvedValue({
        taskId: 5,
        reward: { gold: 100, experience: 50 },
      });

      const res = await fetch(`${baseURL}/5/claim`, { method: 'POST' });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({
        taskId: 5,
        reward: { gold: 100, experience: 50 },
      });
      // 验证 userId 来自 req.user，taskId 来自路径参数解析
      expect(taskService.claimTaskReward).toHaveBeenCalledWith('u1', 5);
    });

    it('service 抛错时 fail 返回 400 + 错误消息（领取失败降级码）', async () => {
      (taskService.claimTaskReward as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('任务未完成')
      );

      const res = await fetch(`${baseURL}/9/claim`, { method: 'POST' });
      const body = await res.json();

      // tasks 路由 POST /:id/claim 异常路径固定 fail(res, 400, msg)
      expect(res.status).toBe(400);
      expect(body.message).toBe('任务未完成');
    });

    it('service 抛非 Error 值时 fail 返回 400 + 兜底文案', async () => {
      // 覆盖 catch 块三元 false 分支：reject 非 Error 值时使用兜底文案
      (taskService.claimTaskReward as ReturnType<typeof vi.fn>).mockRejectedValue('序列化异常');

      const res = await fetch(`${baseURL}/9/claim`, { method: 'POST' });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('领取奖励失败');
    });
  });
});
