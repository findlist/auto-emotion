// server/src/routes/shop.test.ts
// 商城路由单元测试：复用 game-record 范式，覆盖未授权/参数校验/成功/异常分支
// 设计原因：shop 路由与 game-record 风格不同——不使用 authMiddleware，
// 而是在每个 handler 内部检查 req.user 并用 fail() 自行处理错误（try/catch）。
// 因此测试 app 无需挂载 errorHandler，改用可控中间件按 header 决定是否注入 req.user，
// 同时覆盖已授权正常流程与未授权 401 兜底两条路径。

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Server } from 'http';

// mock 商城 service：route 测试聚焦参数校验与错误兜底，service 行为由 service 测试覆盖
vi.mock('../services/shop-service.js', () => ({
  getShopItems: vi.fn(),
  buyItem: vi.fn(),
  getUserInventory: vi.fn(),
}));

// mock 幂等控制：buy 路由用 withIdempotency 防重复提交，
// 默认放行（返回 true）；幂等拦截场景用 mockImplementationOnce 调真实 fail 返回 409
// 真实 withIdempotency 行为（含 try/catch + fail 调用）由 idempotency.test.ts 单测覆盖
vi.mock('../utils/idempotency.js', () => ({
  withIdempotency: vi.fn().mockResolvedValue(true),
  checkIdempotency: vi.fn().mockResolvedValue(true),
}));

import router from './shop.js';
import * as shopService from '../services/shop-service.js';
import { ErrorCode } from '../utils/error.js';
import { fail } from '../utils/response.js';
import { withIdempotency } from '../utils/idempotency.js';

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
  app.use('/api/shop', router);
  // shop 路由内部已 try/catch + fail 自处理错误，无需额外 errorHandler
  server = app.listen(0);
  // 等待端口绑定完成再读取 address，避免并行测试时绑定未完成 address() 返回 null 导致 fetch "bad port"
  await new Promise<void>(resolve => server.once('listening', resolve));
  const port = (server.address() as { port: number }).port;
  baseURL = `http://localhost:${port}/api/shop`;
});

afterAll(() => server.close());

describe('shop 商城路由', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('GET /items 商品列表', () => {
    it('未授权（无 req.user）返回 401', async () => {
      const res = await fetch(`${baseURL}/items`, {
        headers: { 'x-test-no-auth': '1' },
      });
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.code).toBe(401);
      expect(body.message).toBe('未授权');
      // 未授权不应调用 service
      expect(shopService.getShopItems).not.toHaveBeenCalled();
    });

    it('已授权调用 getShopItems(type) 并返回商品列表', async () => {
      (shopService.getShopItems as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 1, name: '挂机加速卡', price: 100 },
      ]);

      const res = await fetch(`${baseURL}/items?type=item`);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({
        code: 200,
        message: 'ok',
        data: { items: [{ id: 1, name: '挂机加速卡', price: 100 }] },
      });
      // 验证 type query 透传
      expect(shopService.getShopItems).toHaveBeenCalledWith('item');
    });

    it('service 抛错时 fail 返回 500 + 错误消息', async () => {
      (shopService.getShopItems as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('数据库连接失败')
      );

      const res = await fetch(`${baseURL}/items`);
      const body = await res.json();

      // shop 路由 GET /items 异常路径固定 fail(res, 500, msg)
      expect(res.status).toBe(500);
      expect(body.code).toBe(500);
      expect(body.message).toBe('数据库连接失败');
    });

    it('service 抛非 Error 值时 fail 返回 500 + 兜底文案', async () => {
      // 覆盖 catch 块三元 false 分支：reject 非 Error 值时使用兜底文案
      (shopService.getShopItems as ReturnType<typeof vi.fn>).mockRejectedValue('连接池耗尽');

      const res = await fetch(`${baseURL}/items`);
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.message).toBe('获取商品列表失败');
    });
  });

  describe('POST /buy 购买商品', () => {
    it('未授权返回 401', async () => {
      const res = await fetch(`${baseURL}/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-no-auth': '1' },
        body: JSON.stringify({ itemId: 1 }),
      });

      expect(res.status).toBe(401);
      expect(shopService.buyItem).not.toHaveBeenCalled();
    });

    it('缺少 itemId 返回 400 "缺少商品ID"', async () => {
      const res = await fetch(`${baseURL}/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.code).toBe(400);
      expect(body.message).toBe('缺少商品ID');
      expect(shopService.buyItem).not.toHaveBeenCalled();
    });

    it('幂等拦截命中（5秒内重复提交）时返回 409，不调用 buyItem', async () => {
      // mock withIdempotency 命中拦截行为：调 fail 返回 409 + 返回 false 让路由 return
      // 真实 withIdempotency 行为（catch AppError → 调 fail → 返回 false）由 idempotency.test.ts 覆盖
      (withIdempotency as ReturnType<typeof vi.fn>).mockImplementationOnce(async res => {
        fail(res, ErrorCode.CONFLICT, '请求已存在，请稍后重试');
        return false;
      });

      const res = await fetch(`${baseURL}/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: 5 }),
      });
      const body = await res.json();

      // CONFLICT 按 ErrorCode 语义映射为 HTTP 409
      expect(res.status).toBe(409);
      expect(body.code).toBe(ErrorCode.CONFLICT);
      expect(body.message).toBe('请求已存在，请稍后重试');
      // 幂等拦截命中时不应调用 buyItem 扣款
      expect(shopService.buyItem).not.toHaveBeenCalled();
    });

    it('参数齐全调用 buyItem(userId, itemId) 返回购买结果', async () => {
      (shopService.buyItem as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        itemId: 5,
        remainingGold: 900,
      });

      const res = await fetch(`${baseURL}/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: 5 }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({ success: true, itemId: 5, remainingGold: 900 });
      // 验证 userId 来自 req.user，itemId 来自 body
      expect(shopService.buyItem).toHaveBeenCalledWith('u1', 5);
    });

    it('service 抛错时 fail 返回 400 + 错误消息（购买失败降级码）', async () => {
      (shopService.buyItem as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('金币不足')
      );

      const res = await fetch(`${baseURL}/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: 99 }),
      });
      const body = await res.json();

      // shop 路由 POST /buy 异常路径固定 fail(res, 400, msg)
      expect(res.status).toBe(400);
      expect(body.message).toBe('金币不足');
    });

    it('service 抛非 Error 值时 fail 返回 400 + 兜底文案', async () => {
      // 覆盖 catch 块三元 false 分支：reject 非 Error 值时使用兜底文案
      (shopService.buyItem as ReturnType<typeof vi.fn>).mockRejectedValue('事务死锁');

      const res = await fetch(`${baseURL}/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: 5 }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('购买失败');
    });
  });

  describe('GET /inventory 用户背包', () => {
    it('未授权返回 401', async () => {
      const res = await fetch(`${baseURL}/inventory`, {
        headers: { 'x-test-no-auth': '1' },
      });
      expect(res.status).toBe(401);
      expect(shopService.getUserInventory).not.toHaveBeenCalled();
    });

    it('已授权调用 getUserInventory(userId) 返回背包', async () => {
      (shopService.getUserInventory as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 1, itemId: 5, quantity: 2 },
      ]);

      const res = await fetch(`${baseURL}/inventory`);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({ inventory: [{ id: 1, itemId: 5, quantity: 2 }] });
      expect(shopService.getUserInventory).toHaveBeenCalledWith('u1');
    });

    it('service 抛错时 fail 返回 500 + 错误消息', async () => {
      (shopService.getUserInventory as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('背包查询失败')
      );

      const res = await fetch(`${baseURL}/inventory`);
      const body = await res.json();

      // shop 路由 GET /inventory 异常路径固定 fail(res, 500, msg)
      expect(res.status).toBe(500);
      expect(body.message).toBe('背包查询失败');
    });

    it('service 抛非 Error 值时 fail 返回 500 + 兜底文案', async () => {
      // 覆盖 catch 块三元 false 分支：reject 非 Error 值时使用兜底文案
      (shopService.getUserInventory as ReturnType<typeof vi.fn>).mockRejectedValue('序列化异常');

      const res = await fetch(`${baseURL}/inventory`);
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.message).toBe('获取背包失败');
    });
  });
});
