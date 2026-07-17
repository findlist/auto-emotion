// server/src/routes/weapons.test.ts
// 武器路由单元测试：复用 shop/tasks 范式（controllableAuth + handler 内 req.user 检查 + try/catch + fail 自处理错误）
// 设计原因：weapons 路由不使用 authMiddleware 与 validate，handler 内部检查 req.user 并用 fail() 自处理错误。
// 4 个端点（list/upgrade/equip/buy）均含 weaponId 必填校验，结构与 skills 路由高度一致。

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { controllableAuth, getServerPort } from './__helpers__/test-server.js';

// mock 武器 service：route 测试聚焦参数校验与错误兜底，service 行为由 service 测试覆盖
vi.mock('../services/weapon-service.js', () => ({
  listWeapons: vi.fn(),
  upgradeWeapon: vi.fn(),
  equipWeapon: vi.fn(),
  buyWeapon: vi.fn(),
}));

import router from './weapons.js';
import * as weaponService from '../services/weapon-service.js';

let server: Server;
let baseURL: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(controllableAuth);
  app.use('/api/weapons', router);
  server = app.listen(0);
  const port = await getServerPort(server);
  baseURL = `http://localhost:${port}/api/weapons`;
});

afterAll(() => server.close());

describe('weapons 武器路由', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('GET /list 武器列表', () => {
    it('未授权返回 401', async () => {
      const res = await fetch(`${baseURL}/list`, {
        headers: { 'x-test-no-auth': '1' },
      });
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.message).toBe('未授权');
      expect(weaponService.listWeapons).not.toHaveBeenCalled();
    });

    it('已授权调用 listWeapons(userId) 返回武器列表', async () => {
      (weaponService.listWeapons as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 1, name: '木剑', level: 1, is_equipped: true },
      ]);

      const res = await fetch(`${baseURL}/list`);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({
        weapons: [{ id: 1, name: '木剑', level: 1, is_equipped: true }],
      });
      expect(weaponService.listWeapons).toHaveBeenCalledWith('u1');
    });

    it('service 抛错时 fail 返回 500 + 错误消息', async () => {
      (weaponService.listWeapons as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('武器数据查询失败')
      );

      const res = await fetch(`${baseURL}/list`);
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.message).toBe('武器数据查询失败');
    });

    it('service 抛非 Error 值时 fail 返回 500 + 兜底文案', async () => {
      // 覆盖 catch 块三元 false 分支：reject 非 Error 值时使用兜底文案
      (weaponService.listWeapons as ReturnType<typeof vi.fn>).mockRejectedValue('序列化异常');

      const res = await fetch(`${baseURL}/list`);
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.message).toBe('获取武器列表失败');
    });
  });

  describe('POST /upgrade 升级武器', () => {
    it('未授权返回 401', async () => {
      const res = await fetch(`${baseURL}/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-no-auth': '1' },
        body: JSON.stringify({ weaponId: 1 }),
      });

      expect(res.status).toBe(401);
      expect(weaponService.upgradeWeapon).not.toHaveBeenCalled();
    });

    it('缺少 weaponId 返回 400 "缺少 weaponId"', async () => {
      const res = await fetch(`${baseURL}/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('缺少 weaponId');
      expect(weaponService.upgradeWeapon).not.toHaveBeenCalled();
    });

    it('参数齐全调用 upgradeWeapon(userId, weaponId) 返回升级结果', async () => {
      (weaponService.upgradeWeapon as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        newLevel: 3,
      });

      const res = await fetch(`${baseURL}/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weaponId: 2 }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({ success: true, newLevel: 3 });
      expect(weaponService.upgradeWeapon).toHaveBeenCalledWith('u1', 2);
    });

    it('service 抛错时 fail 返回 400 + 错误消息', async () => {
      (weaponService.upgradeWeapon as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('金币不足')
      );

      const res = await fetch(`${baseURL}/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weaponId: 2 }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('金币不足');
    });

    it('service 抛非 Error 值时 fail 返回 400 + 兜底文案', async () => {
      // 覆盖 catch 块三元 false 分支：reject 非 Error 值时使用兜底文案
      (weaponService.upgradeWeapon as ReturnType<typeof vi.fn>).mockRejectedValue('事务死锁');

      const res = await fetch(`${baseURL}/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weaponId: 2 }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('升级武器失败');
    });
  });

  describe('POST /equip 装备武器', () => {
    it('未授权返回 401', async () => {
      const res = await fetch(`${baseURL}/equip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-no-auth': '1' },
        body: JSON.stringify({ weaponId: 1 }),
      });

      expect(res.status).toBe(401);
      expect(weaponService.equipWeapon).not.toHaveBeenCalled();
    });

    it('缺少 weaponId 返回 400', async () => {
      const res = await fetch(`${baseURL}/equip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('缺少 weaponId');
    });

    it('参数齐全调用 equipWeapon(userId, weaponId) 返回装备结果', async () => {
      (weaponService.equipWeapon as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        weaponId: 2,
      });

      const res = await fetch(`${baseURL}/equip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weaponId: 2 }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({ success: true, weaponId: 2 });
      expect(weaponService.equipWeapon).toHaveBeenCalledWith('u1', 2);
    });

    it('service 抛错时 fail 返回 400 + 错误消息', async () => {
      (weaponService.equipWeapon as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('未拥有该武器')
      );

      const res = await fetch(`${baseURL}/equip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weaponId: 9 }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('未拥有该武器');
    });

    it('service 抛非 Error 值时 fail 返回 400 + 兜底文案', async () => {
      // 覆盖 catch 块三元 false 分支：reject 非 Error 值时使用兜底文案
      (weaponService.equipWeapon as ReturnType<typeof vi.fn>).mockRejectedValue('连接断开');

      const res = await fetch(`${baseURL}/equip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weaponId: 9 }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('装备武器失败');
    });
  });

  describe('POST /buy 购买武器', () => {
    it('未授权返回 401', async () => {
      const res = await fetch(`${baseURL}/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-no-auth': '1' },
        body: JSON.stringify({ weaponId: 1 }),
      });

      expect(res.status).toBe(401);
      expect(weaponService.buyWeapon).not.toHaveBeenCalled();
    });

    it('缺少 weaponId 返回 400', async () => {
      const res = await fetch(`${baseURL}/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('缺少 weaponId');
    });

    it('参数齐全调用 buyWeapon(userId, weaponId) 返回购买结果', async () => {
      (weaponService.buyWeapon as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        weaponId: 5,
        remainingGold: 500,
      });

      const res = await fetch(`${baseURL}/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weaponId: 5 }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({ success: true, weaponId: 5, remainingGold: 500 });
      expect(weaponService.buyWeapon).toHaveBeenCalledWith('u1', 5);
    });

    it('service 抛错时 fail 返回 400 + 错误消息', async () => {
      (weaponService.buyWeapon as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('金币不足')
      );

      const res = await fetch(`${baseURL}/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weaponId: 99 }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('金币不足');
    });

    it('service 抛非 Error 值时 fail 返回 400 + 兜底文案', async () => {
      // 覆盖 catch 块三元 false 分支：reject 非 Error 值时使用兜底文案
      (weaponService.buyWeapon as ReturnType<typeof vi.fn>).mockRejectedValue('事务回滚');

      const res = await fetch(`${baseURL}/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weaponId: 99 }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('购买武器失败');
    });
  });
});
