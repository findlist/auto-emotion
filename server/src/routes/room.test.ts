// server/src/routes/room.test.ts
// 房间路由单元测试：复用 shop 范式（controllableAuth + handler 内 req.user 检查 + try/catch + fail 自处理错误）
// 设计原因：room 路由不挂 authMiddleware，handler 内部检查 req.user 并用 fail() 自行兜底错误，
// 测试 app 不挂 errorHandler。room 路由依赖 roomManager（来自 websocket/room-manager.js，非 service 层），
// mock roomManager 以隔离 Redis/Socket.IO 环境。2 个端点：POST /create（创建并自动加入）、GET /:roomId（查询）。

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Server } from 'http';

// mock roomManager：room 路由依赖 websocket 房间管理器，route 测试聚焦参数校验与错误兜底
vi.mock('../websocket/room-manager.js', () => ({
  roomManager: {
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
    getRoom: vi.fn(),
  },
}));

import router from './room.js';
import { roomManager } from '../websocket/room-manager.js';

// 可控鉴权中间件：通过请求头 x-test-no-auth 模拟未授权场景
function controllableAuth(req: Request, _res: Response, next: NextFunction): void {
  if (req.headers['x-test-no-auth'] === '1') {
    next();
    return;
  }
  (req as unknown as { user: { userId: string } }).user = { userId: 'u1' };
  next();
}

let server: Server;
let baseURL: string;

beforeAll(() => {
  const app = express();
  app.use(express.json());
  app.use(controllableAuth);
  app.use('/api/room', router);
  // room 路由内部已 try/catch + fail 自处理错误，无需额外 errorHandler
  server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  baseURL = `http://localhost:${port}/api/room`;
});

afterAll(() => server.close());

describe('room 房间路由', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('POST /create 创建房间', () => {
    it('未授权（无 req.user）返回 401', async () => {
      const res = await fetch(`${baseURL}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-no-auth': '1' },
        body: JSON.stringify({ nickname: '玩家1', socketId: 's1' }),
      });
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.code).toBe(401);
      expect(body.message).toBe('未授权');
      // 未授权不应调用 roomManager
      expect(roomManager.createRoom).not.toHaveBeenCalled();
    });

    it('缺 nickname 返回 400 "缺少 nickname"', async () => {
      const res = await fetch(`${baseURL}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ socketId: 's1' }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.code).toBe(400);
      expect(body.message).toBe('缺少 nickname');
      expect(roomManager.createRoom).not.toHaveBeenCalled();
    });

    it('有 nickname 无 socketId 时 socketId 兜底空串，调用 createRoom + joinRoom 返回房间信息', async () => {
      // createRoom 返回模拟房间对象
      (roomManager.createRoom as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'r1',
        hostId: 'u1',
        players: [{ userId: 'u1', nickname: '玩家1', socketId: '', isReady: false }],
      });
      // joinRoom 返回加入后的房间
      (roomManager.joinRoom as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'r1',
        hostId: 'u1',
        players: [{ userId: 'u1', nickname: '玩家1', socketId: '', isReady: false }],
      });

      const res = await fetch(`${baseURL}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: '玩家1' }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      // 验证响应结构：roomId / hostId / players 透传
      expect(body.data).toEqual({
        roomId: 'r1',
        hostId: 'u1',
        players: [{ userId: 'u1', nickname: '玩家1', socketId: '', isReady: false }],
      });
      // 验证 createRoom 调用：userId 来自 req.user，socketId 兜底空串，nickname 透传
      expect(roomManager.createRoom).toHaveBeenCalledWith('u1', '', '玩家1');
      // 验证 joinRoom 自动调用：roomId 来自 createRoom 返回值
      expect(roomManager.joinRoom).toHaveBeenCalledWith('r1', 'u1', '', '玩家1');
    });

    it('参数齐全调用 createRoom(userId, socketId, nickname) 并自动 joinRoom', async () => {
      (roomManager.createRoom as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'r2',
        hostId: 'u1',
        players: [],
      });
      (roomManager.joinRoom as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'r2',
        hostId: 'u1',
        players: [{ userId: 'u1', nickname: '玩家1', socketId: 's1', isReady: false }],
      });

      const res = await fetch(`${baseURL}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: '玩家1', socketId: 's1' }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data.roomId).toBe('r2');
      // 验证三参数透传
      expect(roomManager.createRoom).toHaveBeenCalledWith('u1', 's1', '玩家1');
      expect(roomManager.joinRoom).toHaveBeenCalledWith('r2', 'u1', 's1', '玩家1');
    });

    it('createRoom 抛非 AppError 错误时 fail 返回 500 + 错误消息（服务端异常）', async () => {
      (roomManager.createRoom as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Redis 不可用')
      );

      const res = await fetch(`${baseURL}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: '玩家1', socketId: 's1' }),
      });
      const body = await res.json();

      // 非 AppError 错误视为服务端异常返回 500，AppError 则按 ErrorCode 映射 HTTP 状态码
      expect(res.status).toBe(500);
      expect(body.message).toBe('Redis 不可用');
      // createRoom 抛错后不应继续调用 joinRoom
      expect(roomManager.joinRoom).not.toHaveBeenCalled();
    });

    it('joinRoom 抛非 AppError 错误时 fail 返回 500 + 错误消息', async () => {
      (roomManager.createRoom as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'r3',
        hostId: 'u1',
        players: [],
      });
      (roomManager.joinRoom as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('房间已满')
      );

      const res = await fetch(`${baseURL}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: '玩家1', socketId: 's1' }),
      });
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.message).toBe('房间已满');
    });

    it('createRoom 抛非 Error 值时 fail 返回 500 + 兜底文案', async () => {
      // 覆盖 catch 块三元 false 分支：reject 非 Error 值时使用兜底文案
      (roomManager.createRoom as ReturnType<typeof vi.fn>).mockRejectedValue('连接池耗尽');

      const res = await fetch(`${baseURL}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: '玩家1', socketId: 's1' }),
      });
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.message).toBe('创建房间失败');
      // createRoom 抛错后不应继续调用 joinRoom
      expect(roomManager.joinRoom).not.toHaveBeenCalled();
    });
  });

  describe('GET /:roomId 获取房间信息', () => {
    it('房间不存在返回 404 "房间不存在"', async () => {
      (roomManager.getRoom as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const res = await fetch(`${baseURL}/r404`);
      const body = await res.json();

      expect(res.status).toBe(404);
      expect(body.code).toBe(404);
      expect(body.message).toBe('房间不存在');
      expect(roomManager.getRoom).toHaveBeenCalledWith('r404');
    });

    it('房间存在返回 room 数据', async () => {
      const mockRoom = {
        id: 'r1',
        hostId: 'u1',
        status: 'waiting',
        players: [{ userId: 'u1', nickname: '玩家1', socketId: 's1', isReady: false }],
      };
      (roomManager.getRoom as ReturnType<typeof vi.fn>).mockResolvedValue(mockRoom);

      const res = await fetch(`${baseURL}/r1`);
      const body = await res.json();

      expect(res.status).toBe(200);
      // 验证 room 数据完整透传
      expect(body.data).toEqual({ room: mockRoom });
      expect(roomManager.getRoom).toHaveBeenCalledWith('r1');
    });
  });
});
