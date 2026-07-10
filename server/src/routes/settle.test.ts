// server/src/routes/settle.test.ts
// 结算路由单元测试：复用 controllableAuth 范式（handler 内 req.user 检查 + try/catch + fail 自处理错误）
// 设计原因：settle 路由不挂 authMiddleware，handler 内部检查 req.user 并用 fail() 自行兜底错误，
// 测试 app 不挂 errorHandler。路由职责是参数校验 + 透传 service 返回的权威奖励数据，
// 不再自行计算 rewards（原实现与 service 实际入库公式不一致已修复），
// 测试聚焦参数兜底（durationSeconds/damage/stressKeywords）与 service 返回值原样透传契约。

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Server } from 'http';

// mock 结算 service：route 测试聚焦参数校验与 rewards 计算，service 行为由 service 测试覆盖
vi.mock('../services/settle-service.js', () => ({
  settleGame: vi.fn(),
}));

import router from './settle.js';
import * as settleService from '../services/settle-service.js';

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
  app.use('/api/settle', router);
  // settle 路由内部已 try/catch + fail 自处理错误，无需额外 errorHandler
  server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  baseURL = `http://localhost:${port}/api/settle`;
});

afterAll(() => server.close());

describe('settle 结算路由', () => {
  beforeEach(() => vi.clearAllMocks());

  it('未授权（无 req.user）返回 401', async () => {
    const res = await fetch(`${baseURL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-test-no-auth': '1' },
      body: JSON.stringify({ roomId: 'r1', mode: 'brawl', players: [] }),
    });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe(401);
    expect(body.message).toBe('未授权');
    expect(settleService.settleGame).not.toHaveBeenCalled();
  });

  it('缺 roomId 返回 400 "缺少参数"', async () => {
    const res = await fetch(`${baseURL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'brawl', players: [] }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.message).toBe('缺少参数');
    expect(settleService.settleGame).not.toHaveBeenCalled();
  });

  it('缺 mode 返回 400 "缺少参数"', async () => {
    const res = await fetch(`${baseURL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: 'r1', players: [] }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.message).toBe('缺少参数');
  });

  it('缺 players 返回 400 "缺少参数"', async () => {
    const res = await fetch(`${baseURL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: 'r1', mode: 'brawl' }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.message).toBe('缺少参数');
  });

  it('成功路径：默认 durationSeconds=180，damage/stressKeywords 兜底，直接透传 service 返回的 rewards', async () => {
    // mock service 返回权威奖励数据（与实际入库一致），路由应原样透传不再自行计算
    // 设计原因：原实现路由按数组索引名次阶梯计算奖励，与 service 实际入库公式不一致，已改为 service 返回权威值
    const mockResult = {
      success: true as const,
      recordId: 'rec-1',
      rewards: [
        { userId: 'u1', rank: 1, isMvp: true, exp: 112, gold: 67, points: 1 },
        { userId: 'u2', rank: 2, isMvp: false, exp: 75, gold: 45, points: 0 },
        { userId: 'u3', rank: 3, isMvp: false, exp: 75, gold: 45, points: 0 },
      ],
    };
    (settleService.settleGame as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

    const res = await fetch(`${baseURL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId: 'r1',
        mode: 'brawl',
        players: [
          { userId: 'u1', nickname: '玩家1', score: 100 },
          { userId: 'u2', nickname: '玩家2', score: 80 },
          { userId: 'u3', nickname: '玩家3', score: 60 },
        ],
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    // 验证 settleGame 调用参数：durationSeconds 默认 180，damage 兜底 0，isMvp 固定 false，stressKeywords 兜底 []
    expect(settleService.settleGame).toHaveBeenCalledWith({
      roomId: 'r1',
      mode: 'brawl',
      durationSeconds: 180,
      players: [
        { userId: 'u1', nickname: '玩家1', score: 100, damage: 0, isMvp: false, stressKeywords: [] },
        { userId: 'u2', nickname: '玩家2', score: 80, damage: 0, isMvp: false, stressKeywords: [] },
        { userId: 'u3', nickname: '玩家3', score: 60, damage: 0, isMvp: false, stressKeywords: [] },
      ],
    });
    // 路由直接透传 service 返回值，不再自行计算 rewards
    expect(body.data).toEqual(mockResult);
  });

  it('成功路径：显式 durationSeconds 与 damage/stressKeywords 透传，4 个 players 透传 service 返回值', async () => {
    const mockResult = {
      success: true as const,
      recordId: 'rec-2',
      rewards: [
        { userId: 'u1', rank: 1, isMvp: true, exp: 150, gold: 90, points: 1 },
        { userId: 'u2', rank: 2, isMvp: false, exp: 100, gold: 60, points: 0 },
        { userId: 'u3', rank: 3, isMvp: false, exp: 100, gold: 60, points: 0 },
        { userId: 'u4', rank: 4, isMvp: false, exp: 100, gold: 60, points: 0 },
      ],
    };
    (settleService.settleGame as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

    const res = await fetch(`${baseURL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId: 'r2',
        mode: 'boss',
        durationSeconds: 240,
        players: [
          { userId: 'u1', nickname: '玩家1', score: 100, damage: 500, stressKeywords: ['加班'] },
          { userId: 'u2', nickname: '玩家2', score: 80, damage: 400 },
          { userId: 'u3', nickname: '玩家3', score: 60, damage: 300 },
          { userId: 'u4', nickname: '玩家4', score: 40, damage: 200 },
        ],
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    // 验证 durationSeconds 显式透传，damage/stressKeywords 透传与兜底
    expect(settleService.settleGame).toHaveBeenCalledWith({
      roomId: 'r2',
      mode: 'boss',
      durationSeconds: 240,
      players: [
        { userId: 'u1', nickname: '玩家1', score: 100, damage: 500, isMvp: false, stressKeywords: ['加班'] },
        { userId: 'u2', nickname: '玩家2', score: 80, damage: 400, isMvp: false, stressKeywords: [] },
        { userId: 'u3', nickname: '玩家3', score: 60, damage: 300, isMvp: false, stressKeywords: [] },
        { userId: 'u4', nickname: '玩家4', score: 40, damage: 200, isMvp: false, stressKeywords: [] },
      ],
    });
    // 路由直接透传 service 返回值
    expect(body.data).toEqual(mockResult);
  });

  it('service 抛非 AppError 错误时 fail 返回 500 + 错误消息（服务端异常）', async () => {
    (settleService.settleGame as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('结算锁冲突')
    );

    const res = await fetch(`${baseURL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId: 'r1',
        mode: 'brawl',
        players: [{ userId: 'u1', nickname: '玩家1', score: 100 }],
      }),
    });
    const body = await res.json();

    // 非 AppError 错误视为服务端异常返回 500，AppError 则按 ErrorCode 映射 HTTP 状态码
    expect(res.status).toBe(500);
    expect(body.message).toBe('结算锁冲突');
  });

  it('service 抛非 Error 值时 fail 返回 500 + 兜底文案', async () => {
    // 覆盖 catch 块三元 false 分支：reject 非 Error 值时使用兜底文案
    (settleService.settleGame as ReturnType<typeof vi.fn>).mockRejectedValue('事务回滚');

    const res = await fetch(`${baseURL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId: 'r1',
        mode: 'brawl',
        players: [{ userId: 'u1', nickname: '玩家1', score: 100 }],
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.message).toBe('结算失败');
  });
});
