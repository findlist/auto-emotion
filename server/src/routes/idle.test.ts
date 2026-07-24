// server/src/routes/idle.test.ts
// 挂机路由单元测试：idle 路由使用 authMiddleware + zod 校验 + try/catch + fail 自处理错误
// 设计原因：idle 路由挂载 authMiddleware（与 shop/pets 范式不同），需 mock auth.js 让其按 header 决定是否注入 req.user。
// 6 个端点：GET /status、GET /areas、POST /settle、POST /claim、POST /switch-area、POST /upgrade。
// 异常处理分两类：switch-area/upgrade 区分 AppError（业务码）与普通错误（500）；status/areas/settle/claim 统一 500。
// 注意：fail() 对 code>=1000 的业务码会降级为 HTTP 400，body.code 保留原业务码。

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Server } from 'http';
import { getServerPort, mockIdempotencyConflict } from './__helpers__/test-server.js';

// mock 挂机 service：route 测试聚焦参数校验与错误兜底，service 行为由 service 测试覆盖
vi.mock('../services/idle-service.js', () => ({
  getStatus: vi.fn(),
  settle: vi.fn(),
  claimOffline: vi.fn(),
  switchArea: vi.fn(),
  upgradeCharacter: vi.fn(),
}));

// mock 挂机区域 service：/areas 路由调用 listAreas，service 行为由 area-service.test.ts 覆盖
vi.mock('../services/area-service.js', () => ({
  listAreas: vi.fn(),
  getArea: vi.fn(),
}));

// mock authMiddleware：通过请求头 x-test-no-auth 模拟未授权场景，未授权时直接返回 401 响应（与真实 authMiddleware 抛 AppError 后被 errorHandler 处理的效果一致）
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

// mock idempotency：settle 路由用 withIdempotency 防重复提交，
// 默认放行（返回 true）；幂等拦截场景用 mockImplementationOnce 调真实 fail 返回 409
// 真实 withIdempotency 行为（含 try/catch + fail 调用）由 idempotency.test.ts 单测覆盖
vi.mock('../utils/idempotency.js', () => ({
  withIdempotency: vi.fn().mockResolvedValue(true),
  checkIdempotency: vi.fn().mockResolvedValue(true),
}));

import router from './idle.js';
import * as idleService from '../services/idle-service.js';
import { listAreas } from '../services/area-service.js';
import { AppError, ErrorCode } from '../utils/error.js';
import { withIdempotency } from '../utils/idempotency.js';

let server: Server;
let baseURL: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/idle', router);
  // idle 路由内部已 try/catch + fail 自处理错误，未授权由 mock authMiddleware 直接返回 401
  server = app.listen(0);
  // 等待端口绑定完成再读取 address，避免并行测试时绑定未完成 address() 返回 null 导致 fetch "bad port"
  const port = await getServerPort(server);
  baseURL = `http://localhost:${port}/api/idle`;
});

afterAll(() => server.close());

describe('idle 挂机路由', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('GET /status 查询角色状态', () => {
    it('未授权返回 401', async () => {
      const res = await fetch(`${baseURL}/status`, {
        headers: { 'x-test-no-auth': '1' },
      });
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.code).toBe(401);
      expect(idleService.getStatus).not.toHaveBeenCalled();
    });

    it('角色不存在返回 404 "角色不存在"', async () => {
      (idleService.getStatus as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const res = await fetch(`${baseURL}/status`);
      const body = await res.json();

      expect(res.status).toBe(404);
      expect(body.code).toBe(404);
      expect(body.message).toBe('角色不存在');
      expect(idleService.getStatus).toHaveBeenCalledWith('u1');
    });

    it('角色存在返回状态数据', async () => {
      const mockData = { level: 5, areaId: 1, gold: 1000, efficiency: 1.5 };
      (idleService.getStatus as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

      const res = await fetch(`${baseURL}/status`);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual(mockData);
    });

    it('service 抛错时 fail 返回 500 + 错误消息', async () => {
      (idleService.getStatus as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('数据库不可用')
      );

      const res = await fetch(`${baseURL}/status`);
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.message).toBe('数据库不可用');
    });
  });

  describe('POST /settle 在线结算', () => {
    it('未授权返回 401', async () => {
      const res = await fetch(`${baseURL}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-no-auth': '1' },
        body: JSON.stringify({ durationSeconds: 60 }),
      });

      expect(res.status).toBe(401);
      expect(idleService.settle).not.toHaveBeenCalled();
    });

    it('参数校验失败（缺 durationSeconds）返回 422', async () => {
      const res = await fetch(`${baseURL}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json();

      expect(res.status).toBe(422);
      expect(body.code).toBe(422);
      expect(body.message).toBe('参数校验失败');
      // zod 校验失败应附带 issues 明细
      expect(body.errors).toBeDefined();
      expect(idleService.settle).not.toHaveBeenCalled();
    });

    it('参数校验失败（durationSeconds 非正数）返回 422', async () => {
      const res = await fetch(`${baseURL}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationSeconds: -10 }),
      });

      expect(res.status).toBe(422);
    });

    it('幂等拦截命中（5秒内重复提交）时返回 409 "请求已存在，请稍后重试"', async () => {
      // mock withIdempotency 命中拦截：调用 fail 返回 409 + 返回 false 让路由 return
      // 真实 withIdempotency 行为（catch AppError → 调 fail → 返回 false）由 idempotency.test.ts 覆盖
      mockIdempotencyConflict(withIdempotency);

      const res = await fetch(`${baseURL}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationSeconds: 60 }),
      });
      const body = await res.json();

      // CONFLICT(1005) 按 ErrorCode 语义映射为 HTTP 409
      expect(res.status).toBe(409);
      expect(body.code).toBe(ErrorCode.CONFLICT);
      expect(body.message).toBe('请求已存在，请稍后重试');
      // 幂等拦截命中时不应调用 settle 发放收益
      expect(idleService.settle).not.toHaveBeenCalled();
    });

    it('参数合法调用 settle(userId, durationSeconds) 返回结算结果', async () => {
      const mockResult = { exp: 100, gold: 50, durationSeconds: 60 };
      (idleService.settle as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

      const res = await fetch(`${baseURL}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationSeconds: 60 }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual(mockResult);
      // 验证 userId 与 durationSeconds 透传
      expect(idleService.settle).toHaveBeenCalledWith('u1', 60);
    });

    it('service 抛错时 fail 返回 500 + 错误消息', async () => {
      (idleService.settle as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('结算失败')
      );

      const res = await fetch(`${baseURL}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationSeconds: 60 }),
      });
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.message).toBe('结算失败');
    });
  });

  describe('POST /claim 领取离线收益', () => {
    it('未授权返回 401', async () => {
      const res = await fetch(`${baseURL}/claim`, {
        method: 'POST',
        headers: { 'x-test-no-auth': '1' },
      });

      expect(res.status).toBe(401);
      expect(idleService.claimOffline).not.toHaveBeenCalled();
    });

    it('已授权调用 claimOffline(userId) 返回离线收益', async () => {
      const mockResult = { exp: 200, gold: 100 };
      (idleService.claimOffline as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

      const res = await fetch(`${baseURL}/claim`, { method: 'POST' });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual(mockResult);
      expect(idleService.claimOffline).toHaveBeenCalledWith('u1');
    });

    it('service 抛错时 fail 返回 500 + 错误消息', async () => {
      (idleService.claimOffline as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('离线收益计算失败')
      );

      const res = await fetch(`${baseURL}/claim`, { method: 'POST' });
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.message).toBe('离线收益计算失败');
    });
  });

  describe('POST /switch-area 切换挂机区域', () => {
    it('未授权返回 401', async () => {
      const res = await fetch(`${baseURL}/switch-area`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-no-auth': '1' },
        body: JSON.stringify({ areaId: 1 }),
      });

      expect(res.status).toBe(401);
      expect(idleService.switchArea).not.toHaveBeenCalled();
    });

    it('参数校验失败（缺 areaId）返回 422', async () => {
      const res = await fetch(`${baseURL}/switch-area`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json();

      expect(res.status).toBe(422);
      expect(body.message).toBe('参数校验失败');
      expect(body.errors).toBeDefined();
    });

    it('参数合法调用 switchArea(userId, areaId) 返回成功', async () => {
      (idleService.switchArea as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

      const res = await fetch(`${baseURL}/switch-area`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ areaId: 2 }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({ success: true });
      expect(idleService.switchArea).toHaveBeenCalledWith('u1', 2);
    });

    it('service 抛 AppError(NOT_FOUND) 时返回业务码 1004（HTTP 映射 404）', async () => {
      (idleService.switchArea as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AppError(ErrorCode.NOT_FOUND, '区域不存在')
      );

      const res = await fetch(`${baseURL}/switch-area`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ areaId: 999 }),
      });
      const body = await res.json();

      // fail() 对 ErrorCode 按语义映射 HTTP 状态码，NOT_FOUND → 404，body.code 保留原业务码
      expect(res.status).toBe(404);
      expect(body.code).toBe(ErrorCode.NOT_FOUND);
      expect(body.message).toBe('区域不存在');
    });

    it('service 抛 AppError(FORBIDDEN) 时返回业务码 1003（HTTP 映射 403）', async () => {
      (idleService.switchArea as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AppError(ErrorCode.FORBIDDEN, '需要等级 10 才能进入此区域')
      );

      const res = await fetch(`${baseURL}/switch-area`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ areaId: 5 }),
      });
      const body = await res.json();

      // FORBIDDEN 按 ErrorCode 语义映射为 HTTP 403
      expect(res.status).toBe(403);
      expect(body.code).toBe(ErrorCode.FORBIDDEN);
      expect(body.message).toBe('需要等级 10 才能进入此区域');
    });

    it('service 抛普通错误时 fail 返回 500 + 错误消息', async () => {
      (idleService.switchArea as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('数据库异常')
      );

      const res = await fetch(`${baseURL}/switch-area`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ areaId: 1 }),
      });
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.message).toBe('数据库异常');
    });
  });

  describe('POST /upgrade 升级角色属性', () => {
    it('未授权返回 401', async () => {
      const res = await fetch(`${baseURL}/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-no-auth': '1' },
        body: JSON.stringify({ field: 'hp' }),
      });

      expect(res.status).toBe(401);
      expect(idleService.upgradeCharacter).not.toHaveBeenCalled();
    });

    it('参数校验失败（field 非枚举值）返回 422', async () => {
      const res = await fetch(`${baseURL}/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'invalid_field' }),
      });
      const body = await res.json();

      expect(res.status).toBe(422);
      expect(body.message).toBe('参数校验失败');
      expect(body.errors).toBeDefined();
    });

    it('参数合法调用 upgradeCharacter(userId, field, itemType) 返回升级结果', async () => {
      const mockResult = { success: true, newLevel: 6, field: 'attack', value: 120 };
      (idleService.upgradeCharacter as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

      const res = await fetch(`${baseURL}/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'attack', itemType: 'weapon' }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual(mockResult);
      // 验证 userId / field / itemType 三参数透传
      expect(idleService.upgradeCharacter).toHaveBeenCalledWith('u1', 'attack', 'weapon');
    });

    it('参数合法但未传 itemType 时 itemType 为 undefined', async () => {
      (idleService.upgradeCharacter as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

      const res = await fetch(`${baseURL}/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'hp' }),
      });

      expect(res.status).toBe(200);
      // 验证 itemType 默认 undefined 透传
      expect(idleService.upgradeCharacter).toHaveBeenCalledWith('u1', 'hp', undefined);
    });

    it('service 抛 AppError(FORBIDDEN) 时返回业务码 1003（HTTP 映射 403）', async () => {
      (idleService.upgradeCharacter as ReturnType<typeof vi.fn>).mockRejectedValue(
        new AppError(ErrorCode.FORBIDDEN, '金币不足')
      );

      const res = await fetch(`${baseURL}/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'hp' }),
      });
      const body = await res.json();

      // FORBIDDEN 按 ErrorCode 语义映射为 HTTP 403
      expect(res.status).toBe(403);
      expect(body.code).toBe(ErrorCode.FORBIDDEN);
      expect(body.message).toBe('金币不足');
    });

    it('service 抛普通错误时 fail 返回 500 + 错误消息', async () => {
      (idleService.upgradeCharacter as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('升级失败')
      );

      const res = await fetch(`${baseURL}/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'hp' }),
      });
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.message).toBe('升级失败');
    });
  });

  describe('GET /areas 获取挂机区域列表', () => {
    it('未授权返回 401', async () => {
      const res = await fetch(`${baseURL}/areas`, {
        headers: { 'x-test-no-auth': '1' },
      });

      expect(res.status).toBe(401);
      expect(listAreas).not.toHaveBeenCalled();
    });

    it('返回区域列表并将 DECIMAL 字段 string 转为 number、null 转为空串', async () => {
      // service 返回 IdleAreaRow（DECIMAL 为 string、可空字段为 null）
      // route 层应转换为客户端 IdleArea 契约（number + string）
      (listAreas as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 1, name: '职场焦虑区', description: null, required_level: 1,
          exp_rate: '1.20', gold_rate: '1.10', drop_rate: '0.10',
          stress_reduction: '0.20', bg_color: null, created_at: new Date(),
        },
      ]);

      const res = await fetch(`${baseURL}/areas`);
      const body = await res.json();

      expect(res.status).toBe(200);
      // 验证类型转换：exp_rate/gold_rate/drop_rate/stress_reduction 为 number，description/bg_color 为空串
      expect(body.data).toEqual([
        {
          id: 1, name: '职场焦虑区', description: '', required_level: 1,
          exp_rate: 1.2, gold_rate: 1.1, drop_rate: 0.1,
          stress_reduction: 0.2, bg_color: '',
        },
      ]);
    });

    it('service 抛错时 fail 返回 500 + 错误消息', async () => {
      (listAreas as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('数据库不可用')
      );

      const res = await fetch(`${baseURL}/areas`);
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.message).toBe('数据库不可用');
    });
  });
});
