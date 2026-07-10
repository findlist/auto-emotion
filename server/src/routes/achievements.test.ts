// server/src/routes/achievements.test.ts
// 成就路由单元测试：复用 shop/tasks 范式（handler 内 req.user 检查 + try/catch + fail 自处理错误）
// 设计原因：achievements.ts 与 tasks.ts 路由结构完全一致——不使用 authMiddleware，
// handler 内部检查 req.user + try/catch + fail 自处理错误。
// 成就列表包装为 { achievements: [...] }，领取奖励路径参数校验 NaN 兜底。

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Server } from 'http';

// mock 成就 service：route 测试聚焦参数校验与错误兜底
vi.mock('../services/achievement-service.js', () => ({
  getAchievements: vi.fn(),
  claimAchievementReward: vi.fn(),
}));

// mock 幂等控制：claim 路由用 checkIdempotency 防重复提交，
// 默认放行（返回 true），单测按需 mockRejectedValueOnce 覆盖幂等拦截场景
vi.mock('../utils/idempotency.js', () => ({
  checkIdempotency: vi.fn().mockResolvedValue(true),
}));

import router from './achievements.js';
import * as achievementService from '../services/achievement-service.js';
import { AppError, ErrorCode } from '../utils/error.js';
import { checkIdempotency } from '../utils/idempotency.js';

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

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(controllableAuth);
  app.use('/api/achievements', router);
  // achievements 路由内部已 try/catch + fail 自处理错误，无需额外 errorHandler
  server = app.listen(0);
  // 等待端口绑定完成再读取 address，避免并行测试时绑定未完成 address() 返回 null 导致 fetch "bad port"
  await new Promise<void>(resolve => server.once('listening', resolve));
  const port = (server.address() as { port: number }).port;
  baseURL = `http://localhost:${port}/api/achievements`;
});

afterAll(() => server.close());

describe('achievements 成就路由', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('GET / 成就列表', () => {
    it('未授权（无 req.user）返回 401', async () => {
      const res = await fetch(`${baseURL}/`, {
        headers: { 'x-test-no-auth': '1' },
      });
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.code).toBe(401);
      expect(body.message).toBe('未授权');
      expect(achievementService.getAchievements).not.toHaveBeenCalled();
    });

    it('已授权调用 getAchievements(userId) 返回 { achievements: [...] }', async () => {
      (achievementService.getAchievements as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 1, type: 1, title: '初出茅庐', completed: true, claimed: false },
      ]);

      const res = await fetch(`${baseURL}/`);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({
        code: 200,
        message: 'ok',
        data: {
          achievements: [
            { id: 1, type: 1, title: '初出茅庐', completed: true, claimed: false },
          ],
        },
      });
      expect(achievementService.getAchievements).toHaveBeenCalledWith('u1');
    });

    it('service 抛错时 fail 返回 500 + 错误消息', async () => {
      (achievementService.getAchievements as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('成就查询失败')
      );

      const res = await fetch(`${baseURL}/`);
      const body = await res.json();

      // achievements 路由 GET / 异常路径固定 fail(res, 500, msg)
      expect(res.status).toBe(500);
      expect(body.code).toBe(500);
      expect(body.message).toBe('成就查询失败');
    });

    it('service 抛非 Error 值时 fail 返回 500 + 兜底文案', async () => {
      // 覆盖 catch 块三元 false 分支：reject 非 Error 值时使用兜底文案
      (achievementService.getAchievements as ReturnType<typeof vi.fn>).mockRejectedValue('连接池耗尽');

      const res = await fetch(`${baseURL}/`);
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.message).toBe('获取成就失败');
    });
  });

  describe('POST /:id/claim 领取成就奖励', () => {
    it('未授权返回 401', async () => {
      const res = await fetch(`${baseURL}/3/claim`, {
        method: 'POST',
        headers: { 'x-test-no-auth': '1' },
      });

      expect(res.status).toBe(401);
      expect(achievementService.claimAchievementReward).not.toHaveBeenCalled();
    });

    it('无效 ID（非数字）返回 400 "无效的成就ID"', async () => {
      const res = await fetch(`${baseURL}/xyz/claim`, { method: 'POST' });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.code).toBe(400);
      expect(body.message).toBe('无效的成就ID');
      expect(achievementService.claimAchievementReward).not.toHaveBeenCalled();
    });

    it('幂等拦截命中（5秒内重复提交）时返回 409，不调用 claimAchievementReward', async () => {
      // checkIdempotency 抛 AppError(CONFLICT) 模拟 Redis SET NX 返回 null（key 已存在）
      (checkIdempotency as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new AppError(ErrorCode.CONFLICT, '请求已存在，请稍后重试')
      );

      const res = await fetch(`${baseURL}/3/claim`, { method: 'POST' });
      const body = await res.json();

      // CONFLICT 按 ErrorCode 语义映射为 HTTP 409
      expect(res.status).toBe(409);
      expect(body.code).toBe(ErrorCode.CONFLICT);
      expect(body.message).toBe('请求已存在，请稍后重试');
      // 幂等拦截命中时不应调用 claimAchievementReward 发奖
      expect(achievementService.claimAchievementReward).not.toHaveBeenCalled();
    });

    it('合法 ID 调用 claimAchievementReward(userId, achievementId) 返回领取结果', async () => {
      (achievementService.claimAchievementReward as ReturnType<typeof vi.fn>).mockResolvedValue({
        achievementId: 3,
        reward: { gold: 500, title: '成就大师' },
      });

      const res = await fetch(`${baseURL}/3/claim`, { method: 'POST' });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({
        achievementId: 3,
        reward: { gold: 500, title: '成就大师' },
      });
      // 验证 userId 来自 req.user，achievementId 来自路径参数解析
      expect(achievementService.claimAchievementReward).toHaveBeenCalledWith('u1', 3);
    });

    it('service 抛错时 fail 返回 400 + 错误消息（领取失败降级码）', async () => {
      (achievementService.claimAchievementReward as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('成就未完成')
      );

      const res = await fetch(`${baseURL}/7/claim`, { method: 'POST' });
      const body = await res.json();

      // achievements 路由 POST /:id/claim 异常路径固定 fail(res, 400, msg)
      expect(res.status).toBe(400);
      expect(body.message).toBe('成就未完成');
    });

    it('service 抛非 Error 值时 fail 返回 400 + 兜底文案', async () => {
      // 覆盖 catch 块三元 false 分支：reject 非 Error 值时使用兜底文案
      (achievementService.claimAchievementReward as ReturnType<typeof vi.fn>).mockRejectedValue('连接断开');

      const res = await fetch(`${baseURL}/7/claim`, { method: 'POST' });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('领取奖励失败');
    });
  });
});
