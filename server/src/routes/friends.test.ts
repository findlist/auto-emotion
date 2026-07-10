// server/src/routes/friends.test.ts
// 好友路由单元测试：复用 shop/tasks 范式（handler 内 req.user 检查 + try/catch + fail 自处理错误）
// 设计原因：friends.ts 不使用 authMiddleware，每个 handler 内部检查 req.user 并用 fail() 自处理错误。
// 因此测试 app 不挂 errorHandler，改用可控中间件按 header 决定是否注入 req.user，
// 同时覆盖已授权正常流程与未授权 401 兜底两条路径。
// mock 边界：service 层全量 mock，route 测试聚焦鉴权透传、参数校验、错误兜底。

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Server } from 'http';

// mock 好友 service：route 测试不验证 SQL，只验证调用与透传
vi.mock('../services/friend-service.js', () => ({
  getFriends: vi.fn(),
  getPendingRequests: vi.fn(),
  sendFriendRequest: vi.fn(),
  acceptFriendRequest: vi.fn(),
  rejectFriendRequest: vi.fn(),
  removeFriend: vi.fn(),
}));

import router from './friends.js';
import * as friendService from '../services/friend-service.js';

// 可控鉴权中间件：通过请求头 x-test-no-auth 模拟未授权场景，
// 默认注入 req.user 模拟已登录用户，避免每个用例重复构造
function controllableAuth(req: Request, _res: Response, next: NextFunction): void {
  if (req.headers['x-test-no-auth'] === '1') {
    next();
    return;
  }
  (req as unknown as { user: { userId: string } }).user = { userId: 'u1' };
  next();
}

// 共享 Express app 与服务器实例，避免每个用例重复 listen/close
let server: Server;
let baseURL: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(controllableAuth);
  app.use('/api/friends', router);
  // friends 路由内部已 try/catch + fail 自处理错误，无需额外 errorHandler
  server = app.listen(0);
  // 等待端口绑定完成再读取 address，避免并行测试时绑定未完成 address() 返回 null 导致 fetch "bad port"
  await new Promise<void>(resolve => server.once('listening', resolve));
  const port = (server.address() as { port: number }).port;
  baseURL = `http://localhost:${port}/api/friends`;
});

afterAll(() => server.close());

describe('friends 好友路由', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('GET / 好友列表', () => {
    it('未授权（无 req.user）返回 401', async () => {
      const res = await fetch(`${baseURL}`, { headers: { 'x-test-no-auth': '1' } });
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.code).toBe(401);
      expect(body.message).toBe('未授权');
      // 未授权不应调用 service
      expect(friendService.getFriends).not.toHaveBeenCalled();
    });

    it('已授权调用 getFriends(userId) 返回 { friends: [...] }', async () => {
      (friendService.getFriends as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 2, nickname: '好友A', level: 10 },
      ]);

      const res = await fetch(`${baseURL}`);
      const body = await res.json();

      expect(res.status).toBe(200);
      // friends 路由将结果包装为 { friends: [...] }
      expect(body).toEqual({
        code: 200,
        message: 'ok',
        data: { friends: [{ id: 2, nickname: '好友A', level: 10 }] },
      });
      // 验证 userId 来自 authMiddleware 注入
      expect(friendService.getFriends).toHaveBeenCalledWith('u1');
    });

    it('service 抛错时 fail 返回 500 + 错误消息', async () => {
      (friendService.getFriends as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('数据库查询失败')
      );

      const res = await fetch(`${baseURL}`);
      const body = await res.json();

      // friends 路由 GET / 异常路径固定 fail(res, 500, msg)
      expect(res.status).toBe(500);
      expect(body.code).toBe(500);
      expect(body.message).toBe('数据库查询失败');
    });

    it('service 抛非 Error 值时 fail 返回 500 + 兜底文案', async () => {
      // 设计原因：catch 块三元 err instanceof Error ? err.message : 'XXX失败' 的 false 分支，
      // service reject 字符串等非 Error 值时使用兜底文案，保证异常兜底可读
      (friendService.getFriends as ReturnType<typeof vi.fn>).mockRejectedValue('数据库连接丢失');

      const res = await fetch(`${baseURL}`);
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.code).toBe(500);
      expect(body.message).toBe('获取好友列表失败');
    });
  });

  describe('GET /requests 待处理好友请求', () => {
    it('未授权返回 401', async () => {
      const res = await fetch(`${baseURL}/requests`, { headers: { 'x-test-no-auth': '1' } });
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.message).toBe('未授权');
      expect(friendService.getPendingRequests).not.toHaveBeenCalled();
    });

    it('已授权调用 getPendingRequests(userId) 返回 { requests: [...] }', async () => {
      (friendService.getPendingRequests as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 1, fromUser: { id: 3, nickname: '请求者' } },
      ]);

      const res = await fetch(`${baseURL}/requests`);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({
        requests: [{ id: 1, fromUser: { id: 3, nickname: '请求者' } }],
      });
      expect(friendService.getPendingRequests).toHaveBeenCalledWith('u1');
    });

    it('service 抛错时 fail 返回 500 + 错误消息', async () => {
      (friendService.getPendingRequests as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('请求列表查询失败')
      );

      const res = await fetch(`${baseURL}/requests`);
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.message).toBe('请求列表查询失败');
    });

    it('service 抛非 Error 值时 fail 返回 500 + 兜底文案', async () => {
      // 覆盖 catch 块三元 false 分支：reject 非 Error 值时使用兜底文案
      (friendService.getPendingRequests as ReturnType<typeof vi.fn>).mockRejectedValue('Redis 超时');

      const res = await fetch(`${baseURL}/requests`);
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.message).toBe('获取好友请求失败');
    });
  });

  describe('POST /request 发送好友请求', () => {
    it('未授权返回 401', async () => {
      const res = await fetch(`${baseURL}/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-no-auth': '1' },
        body: JSON.stringify({ targetUserId: 5 }),
      });

      expect(res.status).toBe(401);
      expect(friendService.sendFriendRequest).not.toHaveBeenCalled();
    });

    it('缺少 targetUserId 返回 400 "缺少目标用户ID"', async () => {
      const res = await fetch(`${baseURL}/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.code).toBe(400);
      expect(body.message).toBe('缺少目标用户ID');
      expect(friendService.sendFriendRequest).not.toHaveBeenCalled();
    });

    it('参数齐全调用 sendFriendRequest(userId, targetUserId) 返回结果', async () => {
      (friendService.sendFriendRequest as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        targetUserId: 5,
      });

      const res = await fetch(`${baseURL}/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: 5 }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({ success: true, targetUserId: 5 });
      // 验证 userId 来自 req.user，targetUserId 来自 body
      expect(friendService.sendFriendRequest).toHaveBeenCalledWith('u1', 5);
    });

    it('service 抛错时 fail 返回 400 + 错误消息（发送失败降级码）', async () => {
      (friendService.sendFriendRequest as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('不能添加自己为好友')
      );

      const res = await fetch(`${baseURL}/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: 1 }),
      });
      const body = await res.json();

      // friends 路由 POST /request 异常路径固定 fail(res, 400, msg)
      expect(res.status).toBe(400);
      expect(body.message).toBe('不能添加自己为好友');
    });

    it('service 抛非 Error 值时 fail 返回 400 + 兜底文案', async () => {
      // 覆盖 catch 块三元 false 分支：reject 非 Error 值时使用兜底文案
      (friendService.sendFriendRequest as ReturnType<typeof vi.fn>).mockRejectedValue('网络中断');

      const res = await fetch(`${baseURL}/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: 5 }),
      });
      const body = await res.json();

      // POST /request 异常路径固定 fail(res, 400, msg)
      expect(res.status).toBe(400);
      expect(body.message).toBe('发送好友请求失败');
    });
  });

  describe('POST /accept 接受好友请求', () => {
    it('未授权返回 401', async () => {
      const res = await fetch(`${baseURL}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-no-auth': '1' },
        body: JSON.stringify({ requestId: 7 }),
      });
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.message).toBe('未授权');
      expect(friendService.acceptFriendRequest).not.toHaveBeenCalled();
    });

    it('缺少 requestId 返回 400 "缺少请求ID"', async () => {
      const res = await fetch(`${baseURL}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('缺少请求ID');
      expect(friendService.acceptFriendRequest).not.toHaveBeenCalled();
    });

    it('参数齐全调用 acceptFriendRequest(userId, requestId) 返回结果', async () => {
      (friendService.acceptFriendRequest as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        friendId: 7,
      });

      const res = await fetch(`${baseURL}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: 7 }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({ success: true, friendId: 7 });
      expect(friendService.acceptFriendRequest).toHaveBeenCalledWith('u1', 7);
    });

    it('service 抛错时 fail 返回 400 + 错误消息', async () => {
      (friendService.acceptFriendRequest as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('好友请求不存在')
      );

      const res = await fetch(`${baseURL}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: 99 }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('好友请求不存在');
    });

    it('service 抛非 Error 值时 fail 返回 400 + 兜底文案', async () => {
      // 覆盖 catch 块三元 false 分支：reject 非 Error 值时使用兜底文案
      (friendService.acceptFriendRequest as ReturnType<typeof vi.fn>).mockRejectedValue('事务回滚');

      const res = await fetch(`${baseURL}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: 7 }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('接受好友请求失败');
    });
  });

  describe('POST /reject 拒绝好友请求', () => {
    it('未授权返回 401', async () => {
      const res = await fetch(`${baseURL}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-no-auth': '1' },
        body: JSON.stringify({ requestId: 8 }),
      });
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.message).toBe('未授权');
      expect(friendService.rejectFriendRequest).not.toHaveBeenCalled();
    });

    it('缺少 requestId 返回 400 "缺少请求ID"', async () => {
      const res = await fetch(`${baseURL}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('缺少请求ID');
      expect(friendService.rejectFriendRequest).not.toHaveBeenCalled();
    });

    it('参数齐全调用 rejectFriendRequest(userId, requestId) 返回结果', async () => {
      (friendService.rejectFriendRequest as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
      });

      const res = await fetch(`${baseURL}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: 8 }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({ success: true });
      expect(friendService.rejectFriendRequest).toHaveBeenCalledWith('u1', 8);
    });

    it('service 抛错时 fail 返回 400 + 错误消息', async () => {
      (friendService.rejectFriendRequest as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('请求已处理')
      );

      const res = await fetch(`${baseURL}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: 8 }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('请求已处理');
    });

    it('service 抛非 Error 值时 fail 返回 400 + 兜底文案', async () => {
      // 覆盖 catch 块三元 false 分支：reject 非 Error 值时使用兜底文案
      (friendService.rejectFriendRequest as ReturnType<typeof vi.fn>).mockRejectedValue('连接池耗尽');

      const res = await fetch(`${baseURL}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: 8 }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('拒绝好友请求失败');
    });
  });

  describe('DELETE /:friendId 删除好友', () => {
    it('未授权返回 401', async () => {
      const res = await fetch(`${baseURL}/5`, {
        method: 'DELETE',
        headers: { 'x-test-no-auth': '1' },
      });

      expect(res.status).toBe(401);
      expect(friendService.removeFriend).not.toHaveBeenCalled();
    });

    it('无效 ID（非数字）返回 400 "无效的好友ID"', async () => {
      const res = await fetch(`${baseURL}/abc`, { method: 'DELETE' });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.code).toBe(400);
      expect(body.message).toBe('无效的好友ID');
      expect(friendService.removeFriend).not.toHaveBeenCalled();
    });

    it('合法 ID 调用 removeFriend(userId, friendId) 返回结果', async () => {
      (friendService.removeFriend as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        friendId: 5,
      });

      const res = await fetch(`${baseURL}/5`, { method: 'DELETE' });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({ success: true, friendId: 5 });
      // 验证 userId 来自 req.user，friendId 来自路径参数解析
      expect(friendService.removeFriend).toHaveBeenCalledWith('u1', 5);
    });

    it('service 抛错时 fail 返回 400 + 错误消息', async () => {
      (friendService.removeFriend as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('好友关系不存在')
      );

      const res = await fetch(`${baseURL}/99`, { method: 'DELETE' });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('好友关系不存在');
    });

    it('service 抛非 Error 值时 fail 返回 400 + 兜底文案', async () => {
      // 覆盖 catch 块三元 false 分支：reject 非 Error 值时使用兜底文案
      (friendService.removeFriend as ReturnType<typeof vi.fn>).mockRejectedValue('数据库锁冲突');

      const res = await fetch(`${baseURL}/99`, { method: 'DELETE' });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('删除好友失败');
    });
  });
});
