// server/src/routes/skills.test.ts
// 技能路由单元测试：复用 shop/tasks 范式（controllableAuth + handler 内 req.user 检查 + try/catch + fail 自处理错误）
// 设计原因：skills 路由不使用 authMiddleware 与 validate，handler 内部检查 req.user 并用 fail() 自处理错误。
// 因此测试 app 无需挂载 errorHandler，改用可控中间件按 header 决定是否注入 req.user。
// 4 个端点（list/unlock/upgrade/activate）均含 skillId 必填校验，activate 含 active 可选参数。

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Server } from 'http';

// mock 技能 service：route 测试聚焦参数校验与错误兜底，service 行为由 service 测试覆盖
vi.mock('../services/skill-service.js', () => ({
  listSkills: vi.fn(),
  unlockSkill: vi.fn(),
  upgradeSkill: vi.fn(),
  activateSkill: vi.fn(),
}));

import router from './skills.js';
import * as skillService from '../services/skill-service.js';

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
  app.use('/api/skills', router);
  server = app.listen(0);
  // 等待端口绑定完成再读取 address，避免并行测试时绑定未完成 address() 返回 null 导致 fetch "bad port"
  await new Promise<void>(resolve => server.once('listening', resolve));
  const port = (server.address() as { port: number }).port;
  baseURL = `http://localhost:${port}/api/skills`;
});

afterAll(() => server.close());

describe('skills 技能路由', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('GET /list 技能列表', () => {
    it('未授权返回 401', async () => {
      const res = await fetch(`${baseURL}/list`, {
        headers: { 'x-test-no-auth': '1' },
      });
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.message).toBe('未授权');
      expect(skillService.listSkills).not.toHaveBeenCalled();
    });

    it('已授权调用 listSkills(userId) 返回技能列表', async () => {
      (skillService.listSkills as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 1, name: '火焰冲击', level: 2, is_active: true },
      ]);

      const res = await fetch(`${baseURL}/list`);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({
        skills: [{ id: 1, name: '火焰冲击', level: 2, is_active: true }],
      });
      expect(skillService.listSkills).toHaveBeenCalledWith('u1');
    });

    it('service 抛错时 fail 返回 500 + 错误消息', async () => {
      (skillService.listSkills as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('技能数据查询失败')
      );

      const res = await fetch(`${baseURL}/list`);
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.message).toBe('技能数据查询失败');
    });

    it('service 抛非 Error 值时 fail 返回 500 + 兜底文案', async () => {
      // 覆盖 catch 块三元 false 分支：reject 非 Error 值时使用兜底文案
      (skillService.listSkills as ReturnType<typeof vi.fn>).mockRejectedValue('缓存击穿');

      const res = await fetch(`${baseURL}/list`);
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.message).toBe('获取技能列表失败');
    });
  });

  describe('POST /unlock 解锁技能', () => {
    it('未授权返回 401', async () => {
      const res = await fetch(`${baseURL}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-no-auth': '1' },
        body: JSON.stringify({ skillId: 1 }),
      });

      expect(res.status).toBe(401);
      expect(skillService.unlockSkill).not.toHaveBeenCalled();
    });

    it('缺少 skillId 返回 400 "缺少 skillId"', async () => {
      const res = await fetch(`${baseURL}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('缺少 skillId');
      expect(skillService.unlockSkill).not.toHaveBeenCalled();
    });

    it('参数齐全调用 unlockSkill(userId, skillId) 返回解锁结果', async () => {
      (skillService.unlockSkill as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        skillId: 3,
      });

      const res = await fetch(`${baseURL}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId: 3 }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({ success: true, skillId: 3 });
      expect(skillService.unlockSkill).toHaveBeenCalledWith('u1', 3);
    });

    it('service 抛错时 fail 返回 400 + 错误消息', async () => {
      (skillService.unlockSkill as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('等级不足')
      );

      const res = await fetch(`${baseURL}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId: 5 }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('等级不足');
    });

    it('service 抛非 Error 值时 fail 返回 400 + 兜底文案', async () => {
      // 覆盖 catch 块三元 false 分支：reject 非 Error 值时使用兜底文案
      (skillService.unlockSkill as ReturnType<typeof vi.fn>).mockRejectedValue('锁冲突');

      const res = await fetch(`${baseURL}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId: 5 }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('解锁技能失败');
    });
  });

  describe('POST /upgrade 升级技能', () => {
    it('未授权返回 401', async () => {
      const res = await fetch(`${baseURL}/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-no-auth': '1' },
        body: JSON.stringify({ skillId: 1 }),
      });

      expect(res.status).toBe(401);
      expect(skillService.upgradeSkill).not.toHaveBeenCalled();
    });

    it('缺少 skillId 返回 400', async () => {
      const res = await fetch(`${baseURL}/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('缺少 skillId');
    });

    it('参数齐全调用 upgradeSkill(userId, skillId) 返回升级结果', async () => {
      (skillService.upgradeSkill as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        newLevel: 3,
      });

      const res = await fetch(`${baseURL}/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId: 2 }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({ success: true, newLevel: 3 });
      expect(skillService.upgradeSkill).toHaveBeenCalledWith('u1', 2);
    });

    it('service 抛错时 fail 返回 400 + 错误消息', async () => {
      (skillService.upgradeSkill as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('金币不足')
      );

      const res = await fetch(`${baseURL}/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId: 2 }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('金币不足');
    });

    it('service 抛非 Error 值时 fail 返回 400 + 兜底文案', async () => {
      // 覆盖 catch 块三元 false 分支：reject 非 Error 值时使用兜底文案
      (skillService.upgradeSkill as ReturnType<typeof vi.fn>).mockRejectedValue('事务回滚');

      const res = await fetch(`${baseURL}/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId: 2 }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('升级技能失败');
    });
  });

  describe('POST /activate 激活/停用技能', () => {
    it('未授权返回 401', async () => {
      const res = await fetch(`${baseURL}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-no-auth': '1' },
        body: JSON.stringify({ skillId: 1 }),
      });

      expect(res.status).toBe(401);
      expect(skillService.activateSkill).not.toHaveBeenCalled();
    });

    it('缺少 skillId 返回 400', async () => {
      const res = await fetch(`${baseURL}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('缺少 skillId');
    });

    it('未传 active 时默认 true 透传至 service', async () => {
      (skillService.activateSkill as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        is_active: true,
      });

      const res = await fetch(`${baseURL}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId: 4 }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({ success: true, is_active: true });
      // active 未传时默认 true
      expect(skillService.activateSkill).toHaveBeenCalledWith('u1', 4, true);
    });

    it('显式 active=false 透传至 service 停用技能', async () => {
      (skillService.activateSkill as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        is_active: false,
      });

      const res = await fetch(`${baseURL}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId: 4, active: false }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({ success: true, is_active: false });
      expect(skillService.activateSkill).toHaveBeenCalledWith('u1', 4, false);
    });

    it('service 抛错时 fail 返回 400 + 错误消息', async () => {
      (skillService.activateSkill as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('技能未解锁')
      );

      const res = await fetch(`${baseURL}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId: 9 }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('技能未解锁');
    });

    it('service 抛非 Error 值时 fail 返回 400 + 兜底文案', async () => {
      // 覆盖 catch 块三元 false 分支：reject 非 Error 值时使用兜底文案
      (skillService.activateSkill as ReturnType<typeof vi.fn>).mockRejectedValue('管道断开');

      const res = await fetch(`${baseURL}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId: 9 }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('操作技能失败');
    });
  });
});
