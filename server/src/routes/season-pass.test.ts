// server/src/routes/season-pass.test.ts
// 赛季通行证路由单元测试：复用 shop/tasks 范式（controllableAuth + handler 内 req.user 检查 + try/catch + fail 自处理错误）
// 设计原因：season-pass 路由不使用 authMiddleware 与 validate，handler 内部检查 req.user 并用 fail() 自处理错误。
// 因此测试 app 无需挂载 errorHandler，改用可控中间件按 header 决定是否注入 req.user，
// 同时覆盖已授权正常流程与未授权 401 兜底两条路径。

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Server } from 'http';

// mock 赛季通行证 service：route 测试聚焦参数校验与错误兜底，service 行为由 service 测试覆盖
vi.mock('../services/season-pass-service.js', () => ({
  getCurrentSeason: vi.fn(),
  buySeasonPass: vi.fn(),
  claimSeasonReward: vi.fn(),
}));

// mock 幂等控制：buy/claim 路由用 checkIdempotency 防重复提交，
// 默认放行（返回 true），单测按需 mockRejectedValueOnce 覆盖幂等拦截场景
vi.mock('../utils/idempotency.js', () => ({
  checkIdempotency: vi.fn().mockResolvedValue(true),
}));

import router from './season-pass.js';
import * as seasonPassService from '../services/season-pass-service.js';
import { AppError, ErrorCode } from '../utils/error.js';
import { checkIdempotency } from '../utils/idempotency.js';

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

let server: Server;
let baseURL: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(controllableAuth);
  app.use('/api/season-pass', router);
  // season-pass 路由内部已 try/catch + fail 自处理错误，无需额外 errorHandler
  server = app.listen(0);
  // 等待端口绑定完成再读取 address，避免并行测试时绑定未完成 address() 返回 null 导致 fetch "bad port"
  await new Promise<void>(resolve => server.once('listening', resolve));
  const port = (server.address() as { port: number }).port;
  baseURL = `http://localhost:${port}/api/season-pass`;
});

afterAll(() => server.close());

describe('season-pass 赛季通行证路由', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('GET / 获取赛季通行证信息', () => {
    it('未授权（无 req.user）返回 401', async () => {
      const res = await fetch(`${baseURL}`, {
        headers: { 'x-test-no-auth': '1' },
      });
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.code).toBe(401);
      expect(body.message).toBe('未授权');
      expect(seasonPassService.getCurrentSeason).not.toHaveBeenCalled();
    });

    it('已授权调用 getCurrentSeason(userId) 并返回赛季信息', async () => {
      (seasonPassService.getCurrentSeason as ReturnType<typeof vi.fn>).mockResolvedValue({
        seasonId: 1,
        level: 5,
        isPremium: false,
      });

      const res = await fetch(`${baseURL}`);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({
        code: 200,
        message: 'ok',
        data: { seasonId: 1, level: 5, isPremium: false },
      });
      expect(seasonPassService.getCurrentSeason).toHaveBeenCalledWith('u1');
    });

    it('service 抛错时 fail 返回 500 + 错误消息', async () => {
      (seasonPassService.getCurrentSeason as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('赛季数据查询失败')
      );

      const res = await fetch(`${baseURL}`);
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.code).toBe(500);
      expect(body.message).toBe('赛季数据查询失败');
    });

    it('service 抛非 Error 值时 fail 返回 500 + 兜底文案', async () => {
      // 覆盖 catch 块三元 false 分支：reject 非 Error 值时使用兜底文案
      (seasonPassService.getCurrentSeason as ReturnType<typeof vi.fn>).mockRejectedValue('缓存穿透');

      const res = await fetch(`${baseURL}`);
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.message).toBe('获取赛季通行证失败');
    });
  });

  describe('POST /buy 购买通行证', () => {
    it('未授权返回 401', async () => {
      const res = await fetch(`${baseURL}/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-no-auth': '1' },
      });

      expect(res.status).toBe(401);
      expect(seasonPassService.buySeasonPass).not.toHaveBeenCalled();
    });

    it('幂等拦截命中（5秒内重复提交）时返回 409，不调用 buySeasonPass', async () => {
      // checkIdempotency 抛 AppError(CONFLICT) 模拟 Redis SET NX 返回 null（key 已存在）
      (checkIdempotency as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new AppError(ErrorCode.CONFLICT, '请求已存在，请稍后重试')
      );

      const res = await fetch(`${baseURL}/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const body = await res.json();

      // CONFLICT 按 ErrorCode 语义映射为 HTTP 409
      expect(res.status).toBe(409);
      expect(body.code).toBe(ErrorCode.CONFLICT);
      expect(body.message).toBe('请求已存在，请稍后重试');
      // 幂等拦截命中时不应调用 buySeasonPass 扣款
      expect(seasonPassService.buySeasonPass).not.toHaveBeenCalled();
    });

    it('已授权调用 buySeasonPass(userId) 返回购买结果', async () => {
      (seasonPassService.buySeasonPass as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        isPremium: true,
        remainingGold: 800,
      });

      const res = await fetch(`${baseURL}/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({ success: true, isPremium: true, remainingGold: 800 });
      expect(seasonPassService.buySeasonPass).toHaveBeenCalledWith('u1');
    });

    it('service 抛错时 fail 返回 400 + 错误消息（购买失败降级码）', async () => {
      (seasonPassService.buySeasonPass as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('金币不足')
      );

      const res = await fetch(`${baseURL}/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('金币不足');
    });

    it('service 抛非 Error 值时 fail 返回 400 + 兜底文案', async () => {
      // 覆盖 catch 块三元 false 分支：reject 非 Error 值时使用兜底文案
      (seasonPassService.buySeasonPass as ReturnType<typeof vi.fn>).mockRejectedValue('事务死锁');

      const res = await fetch(`${baseURL}/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('购买失败');
    });
  });

  describe('POST /claim 领取奖励', () => {
    it('未授权返回 401', async () => {
      const res = await fetch(`${baseURL}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-no-auth': '1' },
        body: JSON.stringify({ level: 1 }),
      });

      expect(res.status).toBe(401);
      expect(seasonPassService.claimSeasonReward).not.toHaveBeenCalled();
    });

    it('缺少 level 返回 400 "缺少等级"', async () => {
      const res = await fetch(`${baseURL}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.code).toBe(400);
      expect(body.message).toBe('缺少等级');
      expect(seasonPassService.claimSeasonReward).not.toHaveBeenCalled();
    });

    it('level=0 视为缺参返回 400（!level 隐式转换陷阱）', async () => {
      // 源码 `if (!level)` 对 0 视为 falsy，这是既定行为，测试锁定该语义
      const res = await fetch(`${baseURL}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: 0 }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('缺少等级');
      expect(seasonPassService.claimSeasonReward).not.toHaveBeenCalled();
    });

    it('幂等拦截命中（5秒内重复提交）时返回 409，不调用 claimSeasonReward', async () => {
      // checkIdempotency 抛 AppError(CONFLICT) 模拟 Redis SET NX 返回 null（key 已存在）
      (checkIdempotency as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new AppError(ErrorCode.CONFLICT, '请求已存在，请稍后重试')
      );

      const res = await fetch(`${baseURL}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: 5 }),
      });
      const body = await res.json();

      // CONFLICT 按 ErrorCode 语义映射为 HTTP 409
      expect(res.status).toBe(409);
      expect(body.code).toBe(ErrorCode.CONFLICT);
      expect(body.message).toBe('请求已存在，请稍后重试');
      // 幂等拦截命中时不应调用 claimSeasonReward 发奖
      expect(seasonPassService.claimSeasonReward).not.toHaveBeenCalled();
    });

    it('参数齐全调用 claimSeasonReward(userId, level, isPremium ?? false) 默认免费档', async () => {
      (seasonPassService.claimSeasonReward as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        reward: { gold: 100 },
      });

      const res = await fetch(`${baseURL}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: 5 }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({ success: true, reward: { gold: 100 } });
      // isPremium 未传时默认 false
      expect(seasonPassService.claimSeasonReward).toHaveBeenCalledWith('u1', 5, false);
    });

    it('显式 isPremium=true 透传至 service', async () => {
      (seasonPassService.claimSeasonReward as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        reward: { gold: 500, diamond: 10 },
      });

      const res = await fetch(`${baseURL}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: 10, isPremium: true }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({ success: true, reward: { gold: 500, diamond: 10 } });
      expect(seasonPassService.claimSeasonReward).toHaveBeenCalledWith('u1', 10, true);
    });

    it('service 抛错时 fail 返回 400 + 错误消息', async () => {
      (seasonPassService.claimSeasonReward as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('奖励已领取')
      );

      const res = await fetch(`${baseURL}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: 5 }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('奖励已领取');
    });

    it('service 抛非 Error 值时 fail 返回 400 + 兜底文案', async () => {
      // 覆盖 catch 块三元 false 分支：reject 非 Error 值时使用兜底文案
      (seasonPassService.claimSeasonReward as ReturnType<typeof vi.fn>).mockRejectedValue('锁冲突');

      const res = await fetch(`${baseURL}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: 5 }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('领取奖励失败');
    });
  });
});
