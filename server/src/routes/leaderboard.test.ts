// server/src/routes/leaderboard.test.ts
// 排行榜路由单元测试：/friends /:type/me 逐路由挂载 authMiddleware，/power /battle /speed 公开。
// 设计原因：leaderboard.ts 对需鉴权的 /friends 与 /:type/me 逐路由挂载 authMiddleware，
// 公共榜单 /power /battle /speed 不检查 req.user。mock auth.js 按请求头决定是否注入 req.user。
// mock 边界：service 层与 authMiddleware 全量 mock，route 测试聚焦分页参数解析、鉴权透传、type 校验、排名兜底。

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Server } from 'http';

// mock 排行榜 service：route 测试不验证 SQL/Redis，只验证调用与透传
vi.mock('../services/leaderboard-service.js', () => ({
  getPowerLeaderboard: vi.fn(),
  getBattleLeaderboard: vi.fn(),
  getSpeedLeaderboard: vi.fn(),
  getUserRank: vi.fn(),
  getFriendsLeaderboard: vi.fn(),
}));

// mock authMiddleware：通过请求头 x-test-no-auth 模拟未授权场景，未授权时直接返回 401
// （与真实 authMiddleware 抛 AppError 后被 errorHandler 处理的效果一致）
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (req: Request, res: Response, next: NextFunction): void => {
    if (req.headers['x-test-no-auth'] === '1') {
      res.status(401).json({ code: 401, message: '未提供认证令牌', errors: undefined });
      return;
    }
    (req as unknown as { user: { userId: string } }).user = { userId: 'u1' };
    next();
  },
}));

import router from './leaderboard.js';
import * as leaderboardService from '../services/leaderboard-service.js';

// 共享 Express app 与服务器实例
let server: Server;
let baseURL: string;

beforeAll(() => {
  const app = express();
  app.use(express.json());
  app.use('/api/leaderboard', router);
  // /friends /:type/me 由 mock authMiddleware 鉴权，/power /battle /speed 公开无需鉴权
  server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  baseURL = `http://localhost:${port}/api/leaderboard`;
});

afterAll(() => server.close());

describe('leaderboard 排行榜路由', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('GET /power 战力榜', () => {
    it('默认分页调用 getPowerLeaderboard(1, 20) 返回榜单', async () => {
      (leaderboardService.getPowerLeaderboard as ReturnType<typeof vi.fn>).mockResolvedValue({
        list: [{ userId: 'u2', nickname: '榜首', power: 9999, rank: 1 }],
        total: 1,
      });

      const res = await fetch(`${baseURL}/power`);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({
        list: [{ userId: 'u2', nickname: '榜首', power: 9999, rank: 1 }],
        total: 1,
      });
      // 默认 page=1, pageSize=20
      expect(leaderboardService.getPowerLeaderboard).toHaveBeenCalledWith(1, 20);
    });

    it('自定义分页调用 getPowerLeaderboard(2, 10) 透传 query', async () => {
      (leaderboardService.getPowerLeaderboard as ReturnType<typeof vi.fn>).mockResolvedValue({
        list: [],
        total: 0,
      });

      const res = await fetch(`${baseURL}/power?page=2&pageSize=10`);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({ list: [], total: 0 });
      expect(leaderboardService.getPowerLeaderboard).toHaveBeenCalledWith(2, 10);
    });

    it('service 抛错时 fail 返回 500 + 错误消息', async () => {
      (leaderboardService.getPowerLeaderboard as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Redis 不可用')
      );

      const res = await fetch(`${baseURL}/power`);
      const body = await res.json();

      // leaderboard 路由 GET /power 异常路径固定 fail(res, 500, msg)
      expect(res.status).toBe(500);
      expect(body.code).toBe(500);
      expect(body.message).toBe('Redis 不可用');
    });

    it('service 抛非 Error 值时 fail 返回 500 + 兜底文案', async () => {
      // 覆盖 catch 块三元 false 分支：reject 非 Error 值时使用兜底文案
      (leaderboardService.getPowerLeaderboard as ReturnType<typeof vi.fn>).mockRejectedValue('缓存穿透');

      const res = await fetch(`${baseURL}/power`);
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.message).toBe('获取战力榜失败');
    });
  });

  describe('GET /battle 对战榜', () => {
    it('默认分页调用 getBattleLeaderboard(1, 20)', async () => {
      (leaderboardService.getBattleLeaderboard as ReturnType<typeof vi.fn>).mockResolvedValue({
        list: [{ userId: 'u3', nickname: '战神', score: 1500, rank: 1 }],
        total: 1,
      });

      const res = await fetch(`${baseURL}/battle`);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data.list).toHaveLength(1);
      expect(leaderboardService.getBattleLeaderboard).toHaveBeenCalledWith(1, 20);
    });

    it('service 抛错时 fail 返回 500 + 错误消息', async () => {
      (leaderboardService.getBattleLeaderboard as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('对战榜缓存失效')
      );

      const res = await fetch(`${baseURL}/battle`);
      const body = await res.json();

      // leaderboard 路由 GET /battle 异常路径固定 fail(res, 500, msg)
      expect(res.status).toBe(500);
      expect(body.code).toBe(500);
      expect(body.message).toBe('对战榜缓存失效');
    });

    it('service 抛非 Error 值时 fail 返回 500 + 兜底文案', async () => {
      // 覆盖 catch 块三元 false 分支：reject 非 Error 值时使用兜底文案
      (leaderboardService.getBattleLeaderboard as ReturnType<typeof vi.fn>).mockRejectedValue('序列化失败');

      const res = await fetch(`${baseURL}/battle`);
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.message).toBe('获取对战榜失败');
    });
  });

  describe('GET /speed 速度榜', () => {
    it('默认分页调用 getSpeedLeaderboard(1, 20)', async () => {
      (leaderboardService.getSpeedLeaderboard as ReturnType<typeof vi.fn>).mockResolvedValue({
        list: [{ userId: 'u4', nickname: '快手', bestTime: 90, rank: 1 }],
        total: 1,
      });

      const res = await fetch(`${baseURL}/speed`);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data.list).toHaveLength(1);
      expect(leaderboardService.getSpeedLeaderboard).toHaveBeenCalledWith(1, 20);
    });

    it('service 抛错时 fail 返回 500 + 错误消息', async () => {
      (leaderboardService.getSpeedLeaderboard as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('速度榜计算异常')
      );

      const res = await fetch(`${baseURL}/speed`);
      const body = await res.json();

      // leaderboard 路由 GET /speed 异常路径固定 fail(res, 500, msg)
      expect(res.status).toBe(500);
      expect(body.code).toBe(500);
      expect(body.message).toBe('速度榜计算异常');
    });

    it('service 抛非 Error 值时 fail 返回 500 + 兜底文案', async () => {
      // 覆盖 catch 块三元 false 分支：reject 非 Error 值时使用兜底文案
      (leaderboardService.getSpeedLeaderboard as ReturnType<typeof vi.fn>).mockRejectedValue('游标越界');

      const res = await fetch(`${baseURL}/speed`);
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.message).toBe('获取速度榜失败');
    });
  });

  describe('GET /friends 好友榜', () => {
    it('未授权（无 req.user）返回 401', async () => {
      const res = await fetch(`${baseURL}/friends`, { headers: { 'x-test-no-auth': '1' } });
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.code).toBe(401);
      expect(body.message).toBe('未提供认证令牌');
      // 未授权不应调用 service
      expect(leaderboardService.getFriendsLeaderboard).not.toHaveBeenCalled();
    });

    it('已授权调用 getFriendsLeaderboard(userId, 1, 20) 返回好友榜', async () => {
      (leaderboardService.getFriendsLeaderboard as ReturnType<typeof vi.fn>).mockResolvedValue({
        list: [{ userId: 'u1', nickname: '我', power: 100, rank: 1 }],
        total: 1,
      });

      const res = await fetch(`${baseURL}/friends`);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({
        list: [{ userId: 'u1', nickname: '我', power: 100, rank: 1 }],
        total: 1,
      });
      // 验证 userId 来自 req.user，默认分页 1/20
      expect(leaderboardService.getFriendsLeaderboard).toHaveBeenCalledWith('u1', 1, 20);
    });

    it('自定义分页调用 getFriendsLeaderboard(userId, 2, 10) 透传 query', async () => {
      (leaderboardService.getFriendsLeaderboard as ReturnType<typeof vi.fn>).mockResolvedValue({
        list: [],
        total: 0,
      });

      const res = await fetch(`${baseURL}/friends?page=2&pageSize=10`);

      expect(res.status).toBe(200);
      expect(leaderboardService.getFriendsLeaderboard).toHaveBeenCalledWith('u1', 2, 10);
    });

    it('service 抛错时 fail 返回 500 + 错误消息', async () => {
      (leaderboardService.getFriendsLeaderboard as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('好友榜计算失败')
      );

      const res = await fetch(`${baseURL}/friends`);
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.message).toBe('好友榜计算失败');
    });

    it('service 抛非 Error 值时 fail 返回 500 + 兜底文案', async () => {
      // 覆盖 catch 块三元 false 分支：reject 非 Error 值时使用兜底文案
      (leaderboardService.getFriendsLeaderboard as ReturnType<typeof vi.fn>).mockRejectedValue('聚合超时');

      const res = await fetch(`${baseURL}/friends`);
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.message).toBe('获取好友榜失败');
    });
  });

  describe('GET /:type/me 个人排名', () => {
    it('未授权返回 401', async () => {
      const res = await fetch(`${baseURL}/power/me`, { headers: { 'x-test-no-auth': '1' } });
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.message).toBe('未提供认证令牌');
      expect(leaderboardService.getUserRank).not.toHaveBeenCalled();
    });

    it('无效 type 返回 400 "无效的榜单类型"', async () => {
      const res = await fetch(`${baseURL}/invalid/me`);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.code).toBe(400);
      expect(body.message).toBe('无效的榜单类型');
      expect(leaderboardService.getUserRank).not.toHaveBeenCalled();
    });

    it('type=power 调用 getUserRank(userId, "power") 返回排名', async () => {
      (leaderboardService.getUserRank as ReturnType<typeof vi.fn>).mockResolvedValue({
        userId: 'u1',
        nickname: '我',
        rank: 5,
        power: 1000,
      });

      const res = await fetch(`${baseURL}/power/me`);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({ userId: 'u1', nickname: '我', rank: 5, power: 1000 });
      // 验证 userId 与 type 透传
      expect(leaderboardService.getUserRank).toHaveBeenCalledWith('u1', 'power');
    });

    it('type=friends 内部转调 getUserRank(userId, "power")（friends 无独立榜单，复用战力榜）', async () => {
      // 设计原因：leaderboard.ts 中 type==='friends' 分支调用 getUserRank(userId, 'power')，
      // 这是源码既定行为（好友榜个人排名复用战力榜排名），测试需如实覆盖
      (leaderboardService.getUserRank as ReturnType<typeof vi.fn>).mockResolvedValue({
        userId: 'u1',
        rank: 3,
      });

      const res = await fetch(`${baseURL}/friends/me`);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({ userId: 'u1', rank: 3 });
      // 验证 friends 类型内部转调 power 榜单
      expect(leaderboardService.getUserRank).toHaveBeenCalledWith('u1', 'power');
    });

    it('排名不存在时 fail 返回 404 "未找到排名"', async () => {
      (leaderboardService.getUserRank as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const res = await fetch(`${baseURL}/battle/me`);
      const body = await res.json();

      // result 为 null 时 fail(res, 404, '未找到排名')
      expect(res.status).toBe(404);
      expect(body.code).toBe(404);
      expect(body.message).toBe('未找到排名');
    });

    it('service 抛错时 fail 返回 500 + 错误消息', async () => {
      (leaderboardService.getUserRank as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('排名查询失败')
      );

      const res = await fetch(`${baseURL}/speed/me`);
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.message).toBe('排名查询失败');
    });

    it('service 抛非 Error 值时 fail 返回 500 + 兜底文案', async () => {
      // 覆盖 catch 块三元 false 分支：reject 非 Error 值时使用兜底文案
      (leaderboardService.getUserRank as ReturnType<typeof vi.fn>).mockRejectedValue('管道断开');

      const res = await fetch(`${baseURL}/speed/me`);
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.message).toBe('获取排名失败');
    });
  });
});
