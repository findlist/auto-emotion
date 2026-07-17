// server/src/routes/match.test.ts
// 匹配路由单元测试：复用 shop 范式（controllableAuth + handler 内 req.user 检查 + try/catch + fail 自处理错误）
// 设计原因：match 路由不挂 authMiddleware，handler 内部检查 req.user 并用 fail() 自行兜底错误，
// 测试 app 不挂 errorHandler。3 个端点：POST /quick（匹配）、DELETE /cancel（取消）、GET /status（状态查询），
// 错误处理统一规范：AppError 透传错误码（按 ErrorCode→HTTP 状态码语义映射）+ 普通 Error 兜底 500。

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { controllableAuth, getServerPort } from './__helpers__/test-server.js';

// mock 匹配 service：route 测试聚焦参数校验与错误兜底，service 行为由 service 测试覆盖
vi.mock('../services/match-service.js', () => ({
  joinQuickMatch: vi.fn(),
  leaveQuickMatch: vi.fn(),
  getMatchStatus: vi.fn(),
}));

import router from './match.js';
import * as matchService from '../services/match-service.js';
import { AppError, ErrorCode } from '../utils/error.js';

let server: Server;
let baseURL: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(controllableAuth);
  app.use('/api/match', router);
  // match 路由内部已 try/catch + fail 自处理错误，无需额外 errorHandler
  server = app.listen(0);
  const port = await getServerPort(server);
  baseURL = `http://localhost:${port}/api/match`;
});

afterAll(() => server.close());

describe('match 匹配路由', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('POST /quick 发起快速匹配', () => {
    it('未授权返回 401', async () => {
      const res = await fetch(`${baseURL}/quick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-no-auth': '1' },
        body: JSON.stringify({ nickname: '玩家1', socketId: 's1' }),
      });

      expect(res.status).toBe(401);
      expect(matchService.joinQuickMatch).not.toHaveBeenCalled();
    });

    it('缺 nickname 返回 400 "缺少参数"', async () => {
      const res = await fetch(`${baseURL}/quick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ socketId: 's1' }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('缺少参数');
      expect(matchService.joinQuickMatch).not.toHaveBeenCalled();
    });

    it('缺 socketId 返回 400 "缺少参数"', async () => {
      const res = await fetch(`${baseURL}/quick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: '玩家1' }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('缺少参数');
    });

    it('参数齐全调用 joinQuickMatch(userId, nickname, socketId) 返回匹配结果', async () => {
      (matchService.joinQuickMatch as ReturnType<typeof vi.fn>).mockResolvedValue({
        matched: false,
        queueSize: 3,
      });

      const res = await fetch(`${baseURL}/quick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: '玩家1', socketId: 's1' }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({ matched: false, queueSize: 3 });
      // 验证三参数透传
      expect(matchService.joinQuickMatch).toHaveBeenCalledWith('u1', '玩家1', 's1');
    });

    it('service 抛 AppError 时透传错误码（BAD_REQUEST → 400）', async () => {
      // 设计原因：match-service 实际抛 AppError(BAD_REQUEST, '已在匹配队列中'/'正在匹配中...')，
      // 路由层应透传 err.code 使 errorCodeToHttpStatus 按语义映射为 HTTP 400。
      (matchService.joinQuickMatch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AppError(ErrorCode.BAD_REQUEST, '已在匹配队列中')
      );

      const res = await fetch(`${baseURL}/quick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: '玩家1', socketId: 's1' }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.code).toBe(ErrorCode.BAD_REQUEST);
      expect(body.message).toBe('已在匹配队列中');
    });

    it('service 抛普通 Error 时兜底 500 + 错误消息', async () => {
      // 设计原因：Redis 等基础设施异常抛普通 Error，路由层走兜底分支 fail(res, 500, msg)
      (matchService.joinQuickMatch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Redis 不可用')
      );

      const res = await fetch(`${baseURL}/quick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: '玩家1', socketId: 's1' }),
      });
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.message).toBe('Redis 不可用');
    });

    it('service 抛非 Error 值时兜底 500 + 兜底文案', async () => {
      // 覆盖 catch 块兜底分支：reject 非 Error 值时使用 getErrorMessage 兜底文案（与 quick 路由 catch 块兜底参数一致）
      (matchService.joinQuickMatch as ReturnType<typeof vi.fn>).mockRejectedValue('队列异常');

      const res = await fetch(`${baseURL}/quick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: '玩家1', socketId: 's1' }),
      });
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.message).toBe('快速匹配失败');
    });
  });

  describe('DELETE /cancel 取消匹配', () => {
    it('未授权返回 401', async () => {
      const res = await fetch(`${baseURL}/cancel`, {
        method: 'DELETE',
        headers: { 'x-test-no-auth': '1' },
      });

      expect(res.status).toBe(401);
      expect(matchService.leaveQuickMatch).not.toHaveBeenCalled();
    });

    it('已授权调用 leaveQuickMatch(userId) 返回成功', async () => {
      (matchService.leaveQuickMatch as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const res = await fetch(`${baseURL}/cancel`, { method: 'DELETE' });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({ success: true });
      expect(matchService.leaveQuickMatch).toHaveBeenCalledWith('u1');
    });

    it('service 抛普通 Error 时兜底 500 + 错误消息', async () => {
      // 设计原因：leaveQuickMatch 当前不抛 AppError，Redis 等异常抛普通 Error 走兜底 500 分支
      (matchService.leaveQuickMatch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('取消失败')
      );

      const res = await fetch(`${baseURL}/cancel`, { method: 'DELETE' });
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.message).toBe('取消失败');
    });

    it('service 抛非 Error 值时兜底 500 + 兜底文案', async () => {
      // 覆盖 catch 块兜底分支：reject 非 Error 值时使用 getErrorMessage 兜底文案（与 cancel 路由 catch 块兜底参数一致）
      (matchService.leaveQuickMatch as ReturnType<typeof vi.fn>).mockRejectedValue('管道断开');

      const res = await fetch(`${baseURL}/cancel`, { method: 'DELETE' });
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.message).toBe('取消匹配失败');
    });
  });

  describe('GET /status 获取匹配状态', () => {
    it('未授权返回 401', async () => {
      const res = await fetch(`${baseURL}/status`, {
        headers: { 'x-test-no-auth': '1' },
      });

      expect(res.status).toBe(401);
      expect(matchService.getMatchStatus).not.toHaveBeenCalled();
    });

    it('已授权调用 getMatchStatus(userId) 返回状态', async () => {
      (matchService.getMatchStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
        status: 'matching',
        queueSize: 5,
      });

      const res = await fetch(`${baseURL}/status`);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({ status: 'matching', queueSize: 5 });
      expect(matchService.getMatchStatus).toHaveBeenCalledWith('u1');
    });

    it('service 抛普通 Error 时兜底 500 + 错误消息', async () => {
      // 设计原因：getMatchStatus 当前不抛 AppError，Redis 等异常抛普通 Error 走兜底 500 分支
      (matchService.getMatchStatus as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Redis 不可用')
      );

      const res = await fetch(`${baseURL}/status`);
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.message).toBe('Redis 不可用');
    });

    it('service 抛非 Error 值时兜底 500 + 兜底文案', async () => {
      // 覆盖 catch 块兜底分支：reject 非 Error 值时使用 getErrorMessage 兜底文案（与 status 路由 catch 块兜底参数一致）
      (matchService.getMatchStatus as ReturnType<typeof vi.fn>).mockRejectedValue('游标越界');

      const res = await fetch(`${baseURL}/status`);
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.message).toBe('获取匹配状态失败');
    });
  });
});
