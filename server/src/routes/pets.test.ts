// server/src/routes/pets.test.ts
// 宠物路由单元测试：复用 shop 范式（controllableAuth + handler 内 req.user 检查 + try/catch + fail 自处理错误）
// 设计原因：pets 路由不挂 authMiddleware，handler 内部检查 req.user 并用 fail() 自行兜底错误，
// 测试 app 不挂 errorHandler，用可控中间件按 header 决定是否注入 req.user，同时覆盖已授权正常流程与未授权 401 兜底。

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { controllableAuth, getServerPort, mockIdempotencyConflict } from './__helpers__/test-server.js';

// mock 宠物 service：route 测试聚焦参数校验与错误兜底，service 行为由 service 测试覆盖
vi.mock('../services/pet-service.js', () => ({
  listPets: vi.fn(),
  equipPet: vi.fn(),
  buyPet: vi.fn(),
}));

// mock 幂等控制：buy 路由用 withIdempotency 防重复提交，
// 默认放行（返回 true）；幂等拦截场景用 mockImplementationOnce 调真实 fail 返回 409
// 真实 withIdempotency 行为（含 try/catch + fail 调用）由 idempotency.test.ts 单测覆盖
// 设计原因：原测试未 mock idempotency 依赖真实 Redis 连接，切换为 mock 后测试隔离稳定
vi.mock('../utils/idempotency.js', () => ({
  withIdempotency: vi.fn().mockResolvedValue(true),
  checkIdempotency: vi.fn().mockResolvedValue(true),
}));

import router from './pets.js';
import * as petService from '../services/pet-service.js';
import { ErrorCode } from '../utils/error.js';
import { withIdempotency } from '../utils/idempotency.js';

let server: Server;
let baseURL: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(controllableAuth);
  app.use('/api/pets', router);
  // pets 路由内部已 try/catch + fail 自处理错误，无需额外 errorHandler
  server = app.listen(0);
  const port = await getServerPort(server);
  baseURL = `http://localhost:${port}/api/pets`;
});

afterAll(() => server.close());

describe('pets 宠物路由', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('GET /list 宠物列表', () => {
    it('未授权（无 req.user）返回 401', async () => {
      const res = await fetch(`${baseURL}/list`, {
        headers: { 'x-test-no-auth': '1' },
      });
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.code).toBe(401);
      expect(body.message).toBe('未授权');
      // 未授权不应调用 service
      expect(petService.listPets).not.toHaveBeenCalled();
    });

    it('已授权调用 listPets(userId) 并返回宠物列表', async () => {
      (petService.listPets as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 1, name: '萌宠', level: 1, isEquipped: true },
      ]);

      const res = await fetch(`${baseURL}/list`);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({
        code: 200,
        message: 'ok',
        data: { pets: [{ id: 1, name: '萌宠', level: 1, isEquipped: true }] },
      });
      // 验证 userId 透传
      expect(petService.listPets).toHaveBeenCalledWith('u1');
    });

    it('service 抛错时 fail 返回 500 + 错误消息', async () => {
      (petService.listPets as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('数据库连接失败')
      );

      const res = await fetch(`${baseURL}/list`);
      const body = await res.json();

      // pets 路由 GET /list 异常路径固定 fail(res, 500, msg)
      expect(res.status).toBe(500);
      expect(body.code).toBe(500);
      expect(body.message).toBe('数据库连接失败');
    });

    it('service 抛非 Error 值时 fail 返回 500 + 兜底文案', async () => {
      // 覆盖 catch 块三元 false 分支：reject 非 Error 值时使用兜底文案
      (petService.listPets as ReturnType<typeof vi.fn>).mockRejectedValue('序列化失败');

      const res = await fetch(`${baseURL}/list`);
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.message).toBe('获取宠物列表失败');
    });
  });

  describe('POST /equip 装备宠物', () => {
    it('未授权返回 401', async () => {
      const res = await fetch(`${baseURL}/equip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-no-auth': '1' },
        body: JSON.stringify({ petId: 1 }),
      });

      expect(res.status).toBe(401);
      expect(petService.equipPet).not.toHaveBeenCalled();
    });

    it('缺少 petId 返回 400 "缺少 petId"', async () => {
      const res = await fetch(`${baseURL}/equip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.code).toBe(400);
      expect(body.message).toBe('缺少 petId');
      expect(petService.equipPet).not.toHaveBeenCalled();
    });

    it('参数齐全调用 equipPet(userId, petId) 返回装备结果', async () => {
      (petService.equipPet as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        petId: 3,
      });

      const res = await fetch(`${baseURL}/equip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ petId: 3 }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({ success: true, petId: 3 });
      // 验证 userId 来自 req.user，petId 来自 body
      expect(petService.equipPet).toHaveBeenCalledWith('u1', 3);
    });

    it('service 抛错时 fail 返回 400 + 错误消息（装备失败降级码）', async () => {
      (petService.equipPet as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('宠物不存在')
      );

      const res = await fetch(`${baseURL}/equip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ petId: 99 }),
      });
      const body = await res.json();

      // pets 路由 POST /equip 异常路径固定 fail(res, 400, msg)
      expect(res.status).toBe(400);
      expect(body.message).toBe('宠物不存在');
    });

    it('service 抛非 Error 值时 fail 返回 400 + 兜底文案', async () => {
      // 覆盖 catch 块三元 false 分支：reject 非 Error 值时使用兜底文案
      (petService.equipPet as ReturnType<typeof vi.fn>).mockRejectedValue('事务回滚');

      const res = await fetch(`${baseURL}/equip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ petId: 99 }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('装备宠物失败');
    });
  });

  describe('POST /buy 购买宠物', () => {
    it('未授权返回 401', async () => {
      const res = await fetch(`${baseURL}/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-no-auth': '1' },
        body: JSON.stringify({ petId: 1 }),
      });

      expect(res.status).toBe(401);
      expect(petService.buyPet).not.toHaveBeenCalled();
    });

    it('缺少 petId 返回 400 "缺少 petId"', async () => {
      const res = await fetch(`${baseURL}/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('缺少 petId');
      expect(petService.buyPet).not.toHaveBeenCalled();
    });

    it('幂等拦截命中（5秒内重复提交）时返回 409，不调用 buyPet', async () => {
      // mock withIdempotency 命中拦截：调用 fail 返回 409 + 返回 false 让路由 return
      // 真实 withIdempotency 行为（catch AppError → 调 fail → 返回 false）由 idempotency.test.ts 覆盖
      mockIdempotencyConflict(withIdempotency);

      const res = await fetch(`${baseURL}/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ petId: 7 }),
      });
      const body = await res.json();

      // CONFLICT 按 ErrorCode 语义映射为 HTTP 409
      expect(res.status).toBe(409);
      expect(body.code).toBe(ErrorCode.CONFLICT);
      expect(body.message).toBe('请求已存在，请稍后重试');
      // 幂等拦截命中时不应调用 buyPet 扣款发奖
      expect(petService.buyPet).not.toHaveBeenCalled();
    });

    it('参数齐全调用 buyPet(userId, petId) 返回购买结果', async () => {
      (petService.buyPet as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        petId: 7,
        remainingGold: 800,
      });

      const res = await fetch(`${baseURL}/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ petId: 7 }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({ success: true, petId: 7, remainingGold: 800 });
      expect(petService.buyPet).toHaveBeenCalledWith('u1', 7);
    });

    it('service 抛错时 fail 返回 400 + 错误消息（购买失败降级码）', async () => {
      (petService.buyPet as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('金币不足')
      );

      const res = await fetch(`${baseURL}/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ petId: 99 }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('金币不足');
    });

    it('service 抛非 Error 值时 fail 返回 400 + 兜底文案', async () => {
      // 覆盖 catch 块三元 false 分支：reject 非 Error 值时使用兜底文案
      (petService.buyPet as ReturnType<typeof vi.fn>).mockRejectedValue('事务死锁');

      const res = await fetch(`${baseURL}/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ petId: 99 }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('购买宠物失败');
    });
  });
});
