// server/src/routes/ai.test.ts
// AI 路由单元测试：ai 路由无认证，使用 zod 校验请求体 + 二次校验生成结果
// 设计原因：ai 路由流程为「请求体校验 → generate 生成 → monsterSchema 二次校验 → 响应」，
// mock generate 以隔离词典依赖，同时覆盖「生成结果不合法」的 500 分支。
// 1 个端点：POST /monster。

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';

// mock 怪兽生成器：route 测试聚焦参数校验与二次校验逻辑，generate 行为由生成器单测覆盖
vi.mock('../ai/monster-generator.js', () => ({
  generate: vi.fn(),
}));

import router from './ai.js';
import { generate } from '../ai/monster-generator.js';

let server: Server;
let baseURL: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/ai', router);
  // ai 路由为同步处理，无 try/catch，但内部逻辑不会抛错（safeParse + 条件返回）
  server = app.listen(0);
  // 等待端口绑定完成再读取 address，避免并行测试时绑定未完成 address() 返回 null 导致 fetch "bad port"
  await new Promise<void>(resolve => server.once('listening', resolve));
  const port = (server.address() as { port: number }).port;
  baseURL = `http://localhost:${port}/api/ai`;
});

afterAll(() => server.close());

describe('ai 怪兽生成路由', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('POST /monster 生成怪兽', () => {
    it('参数校验失败（缺 stressKeywords）返回 422', async () => {
      const res = await fetch(`${baseURL}/monster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ difficulty: 3 }),
      });
      const body = await res.json();

      expect(res.status).toBe(422);
      expect(body.code).toBe(422);
      expect(body.message).toBe('参数校验失败');
      // zod 校验失败应附带 issues 明细
      expect(body.errors).toBeDefined();
      // 校验失败不应调用 generate
      expect(generate).not.toHaveBeenCalled();
    });

    it('参数校验失败（stressKeywords 空数组）返回 422', async () => {
      const res = await fetch(`${baseURL}/monster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stressKeywords: [], difficulty: 3 }),
      });

      expect(res.status).toBe(422);
      expect(generate).not.toHaveBeenCalled();
    });

    it('参数校验失败（difficulty 超过 5）返回 422', async () => {
      const res = await fetch(`${baseURL}/monster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stressKeywords: ['加班'], difficulty: 6 }),
      });

      expect(res.status).toBe(422);
      expect(generate).not.toHaveBeenCalled();
    });

    it('参数校验失败（difficulty 小于 1）返回 422', async () => {
      const res = await fetch(`${baseURL}/monster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stressKeywords: ['加班'], difficulty: 0 }),
      });

      expect(res.status).toBe(422);
    });

    it('参数合法调用 generate 并返回符合 schema 的怪兽配置', async () => {
      // 构造合法怪兽配置（符合 monsterSchema）
      const mockMonster = {
        name: '加班 噩梦兽',
        avatar: '👹',
        hp: 3000,
        skills: [
          { name: '无尽任务', type: 'attack', effect: '造成 500 点伤害', cooldown: 3 },
        ],
        weakness: '按时下班',
        stressTags: ['加班'],
        appearance: { color: '#333', shape: 'cube', size: 2.0 },
      };
      (generate as ReturnType<typeof vi.fn>).mockReturnValue(mockMonster);

      const res = await fetch(`${baseURL}/monster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stressKeywords: ['加班'], difficulty: 3 }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      // 验证怪兽配置完整透传
      expect(body.data).toEqual(mockMonster);
      // 验证 generate 调用参数：{ stressKeywords, difficulty } 透传
      expect(generate).toHaveBeenCalledWith({ stressKeywords: ['加班'], difficulty: 3 });
    });

    it('多关键词 + 高难度档位参数透传', async () => {
      const mockMonster = {
        name: '加班 KPI 噩梦兽',
        avatar: '💀',
        hp: 5200,
        skills: [
          { name: '技能1', type: 'attack', effect: '效果1', cooldown: 2 },
          { name: '技能2', type: 'debuff', effect: '效果2', cooldown: 4 },
          { name: '技能3', type: 'summon', effect: '效果3', cooldown: 6 },
        ],
        weakness: '升职加薪',
        stressTags: ['加班', 'KPI'],
        appearance: { color: '#000', shape: 'sphere', size: 3.0 },
      };
      (generate as ReturnType<typeof vi.fn>).mockReturnValue(mockMonster);

      const res = await fetch(`${baseURL}/monster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stressKeywords: ['加班', 'KPI'], difficulty: 5 }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data.skills).toHaveLength(3);
      expect(generate).toHaveBeenCalledWith({ stressKeywords: ['加班', 'KPI'], difficulty: 5 });
    });

    it('generate 返回不符合 schema 的结果时返回 500 "怪兽配置生成异常"', async () => {
      // 构造非法怪兽配置：hp 为负数（违反 positive 约束）
      const invalidMonster = {
        name: '非法怪兽',
        avatar: '👹',
        hp: -100, // 违反 z.number().int().positive()
        skills: [],
        weakness: '',
        stressTags: [],
        appearance: { color: '', shape: '', size: 0 },
      };
      (generate as ReturnType<typeof vi.fn>).mockReturnValue(invalidMonster);

      const res = await fetch(`${baseURL}/monster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stressKeywords: ['加班'], difficulty: 3 }),
      });
      const body = await res.json();

      // 二次校验失败：fail(res, 500, '怪兽配置生成异常', issues)
      expect(res.status).toBe(500);
      expect(body.code).toBe(500);
      expect(body.message).toBe('怪兽配置生成异常');
      expect(body.errors).toBeDefined();
    });
  });
});
