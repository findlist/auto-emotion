// server/src/ai/level-generator.test.ts
// 动态关卡生成器单元测试
// 设计原因：generateLevel 内部分 AI 路径与规则兜底路径两条分支，
// 兜底路径为纯计算可确定性验证；AI 路径需 mock chat 与 env，验证成功/失败回退逻辑

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 使用 vi.hoisted 提升 mock，确保 vi.mock 工厂能引用
const mocks = vi.hoisted(() => ({
  // chat 函数 mock：默认抛错，单测按需覆盖返回值
  chatMock: vi.fn(),
}));

vi.mock('./client.js', () => ({
  chat: mocks.chatMock,
}));

import { generateLevel, type LevelLayout } from './level-generator.js';

describe('level-generator 关卡生成器', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认不配置 AI_API_KEY，走规则兜底路径
    delete process.env.AI_API_KEY;
    // 固定随机序列：Math.random 始终 0，randInt(min,max) 返回 min
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    // 清理环境变量，避免跨用例污染
    delete process.env.AI_API_KEY;
    vi.restoreAllMocks();
  });

  describe('规则兜底路径（无 AI_API_KEY）', () => {
    it('boss 模式：destructibles 数量等于难度档位下限，并附带 bossSpawn', async () => {
      // 难度 1：[10, 15]，Math.random=0 时 randInt 返回 10
      const layout = await generateLevel('boss', 1, ['工作压力']);
      expect(layout.mode).toBe('boss');
      expect(layout.difficulty).toBe(1);
      expect(layout.destructibles).toHaveLength(10);
      expect(layout.bossSpawn).toEqual({ x: 400, y: 150 });
      // spawnPoints 固定 2 个出生点
      expect(layout.spawnPoints).toEqual([
        { x: 400, y: 500 },
        { x: 600, y: 500 },
      ]);
    });

    it('brawl 模式：不带 bossSpawn', async () => {
      const layout = await generateLevel('brawl', 2, []);
      expect(layout.bossSpawn).toBeUndefined();
    });

    it('speed 模式：不带 bossSpawn', async () => {
      const layout = await generateLevel('speed', 3, []);
      expect(layout.bossSpawn).toBeUndefined();
    });

    it('难度档位 5：destructibles 数量上限 30', async () => {
      // 难度 5：[30, 40]，Math.random=0 时 randInt 返回 30
      const layout = await generateLevel('boss', 5, []);
      expect(layout.destructibles).toHaveLength(30);
    });

    it('难度不在表中：使用默认范围 [20, 25]，Math.random=0 返回 20', async () => {
      // 难度 99 不在 DESTRUCTIBLE_COUNTS 表中
      const layout = await generateLevel('boss', 99, []);
      expect(layout.destructibles).toHaveLength(20);
    });

    it('destructibles type 在 4 种类型中循环（box/bottle/glass/balloon）', async () => {
      const layout = await generateLevel('boss', 1, []);
      const types = layout.destructibles.map((d) => d.type);
      // 前 4 项依次为 box/bottle/glass/balloon
      expect(types.slice(0, 4)).toEqual(['box', 'bottle', 'glass', 'balloon']);
      // 第 5 项回到 box
      expect(types[4]).toBe('box');
    });

    it('destructibles id 格式为 d_{index}，索引从 0 递增', async () => {
      const layout = await generateLevel('boss', 1, []);
      expect(layout.destructibles[0].id).toBe('d_0');
      expect(layout.destructibles[9].id).toBe('d_9');
    });

    it('destructibles hp = baseHp + randInt(-5,5)，Math.random=0 时 randInt 返回 -5', async () => {
      // 难度 2：baseHp = 10 + 2*5 = 20，offset = -5，最终 hp = 15
      const layout = await generateLevel('boss', 2, []);
      expect(layout.destructibles[0].hp).toBe(15);
    });

    it('bottle 类型额外 +5 reward', async () => {
      // 难度 1：baseReward = 10 + 1*2 = 12
      // 索引 1 是 bottle，reward = 12 + 5 = 17
      const layout = await generateLevel('boss', 1, []);
      expect(layout.destructibles[0].type).toBe('box');
      expect(layout.destructibles[0].reward).toBe(12);
      expect(layout.destructibles[1].type).toBe('bottle');
      expect(layout.destructibles[1].reward).toBe(17);
    });

    it('destructibles 坐标按 8 列网格布局', async () => {
      const layout = await generateLevel('boss', 1, []);
      // 索引 0：x=100+0*80=100, y=100+0*80=100
      expect(layout.destructibles[0].x).toBe(100);
      expect(layout.destructibles[0].y).toBe(100);
      // 索引 8：x=100+0*80=100, y=100+1*80=180
      expect(layout.destructibles[8].x).toBe(100);
      expect(layout.destructibles[8].y).toBe(180);
    });

    it('返回结构满足 LevelLayout 接口', async () => {
      const layout = await generateLevel('boss', 1, ['工作压力']);
      // 类型断言验证：编译期保证结构合法
      const _check: LevelLayout = layout;
      expect(_check).toBeDefined();
    });
  });

  describe('AI 生成路径（有 AI_API_KEY）', () => {
    beforeEach(() => {
      process.env.AI_API_KEY = 'test-key';
    });

    it('AI 返回合法 JSON 且含必要字段时直接返回 AI 结果', async () => {
      const aiLayout: LevelLayout = {
        mode: 'boss',
        difficulty: 3,
        destructibles: [
          { id: 'ai_1', type: 'box', x: 1, y: 2, width: 60, height: 60, hp: 50, reward: 30 },
        ],
        spawnPoints: [{ x: 100, y: 100 }],
        bossSpawn: { x: 200, y: 200 },
      };
      mocks.chatMock.mockResolvedValue(JSON.stringify(aiLayout));

      const result = await generateLevel('boss', 3, ['工作压力']);

      expect(result).toEqual(aiLayout);
      expect(mocks.chatMock).toHaveBeenCalledOnce();
      // 验证 prompt 中包含模式与压力源
      const prompt = mocks.chatMock.mock.calls[0][0] as string;
      expect(prompt).toContain('boss');
      expect(prompt).toContain('工作压力');
    });

    it('AI 返回 JSON 缺 destructibles 字段时回退到规则兜底', async () => {
      // AI 返回的 JSON 仅含 spawnPoints，缺 destructibles，校验不通过走兜底
      mocks.chatMock.mockResolvedValue(JSON.stringify({ mode: 'boss', spawnPoints: [] }));

      const result = await generateLevel('boss', 1, []);

      // 兜底路径：destructibles 长度为 10（难度 1 下限）
      expect(result.destructibles).toHaveLength(10);
      // chat 被调用过
      expect(mocks.chatMock).toHaveBeenCalledOnce();
    });

    it('AI 返回 JSON 缺 spawnPoints 字段时回退到规则兜底', async () => {
      mocks.chatMock.mockResolvedValue(JSON.stringify({ mode: 'boss', destructibles: [] }));

      const result = await generateLevel('boss', 1, []);

      // 兜底路径：spawnPoints 为固定 2 个出生点
      expect(result.spawnPoints).toHaveLength(2);
    });

    it('AI 返回非 JSON 字符串时回退到规则兜底', async () => {
      mocks.chatMock.mockResolvedValue('not a json string');

      const result = await generateLevel('boss', 1, []);

      expect(result.destructibles).toHaveLength(10);
    });

    it('AI chat 抛错时静默回退到规则兜底', async () => {
      mocks.chatMock.mockRejectedValue(new Error('AI 服务不可用'));

      const result = await generateLevel('boss', 1, []);

      expect(result.destructibles).toHaveLength(10);
      expect(result.mode).toBe('boss');
    });

    it('AI 返回空 destructibles 数组时回退到规则兜底', async () => {
      // 结构合法但数组为空，无法构成有效关卡，应回退
      mocks.chatMock.mockResolvedValue(
        JSON.stringify({ mode: 'boss', difficulty: 1, destructibles: [], spawnPoints: [{ x: 100, y: 100 }] }),
      );

      const result = await generateLevel('boss', 1, []);

      expect(result.destructibles).toHaveLength(10);
    });

    it('AI 返回非法 type 的可破坏物时回退到规则兜底', async () => {
      // type 不在 box/bottle/glass/balloon 枚举内
      mocks.chatMock.mockResolvedValue(
        JSON.stringify({
          mode: 'boss',
          difficulty: 1,
          destructibles: [{ id: 'd1', type: 'rock', x: 100, y: 100, width: 60, height: 60, hp: 50, reward: 30 }],
          spawnPoints: [{ x: 100, y: 100 }],
        }),
      );

      const result = await generateLevel('boss', 1, []);

      // 兜底路径首项 type 为 box
      expect(result.destructibles[0].type).toBe('box');
    });

    it('AI 返回负数 hp 的可破坏物时回退到规则兜底', async () => {
      mocks.chatMock.mockResolvedValue(
        JSON.stringify({
          mode: 'boss',
          difficulty: 1,
          destructibles: [{ id: 'd1', type: 'box', x: 100, y: 100, width: 60, height: 60, hp: -10, reward: 30 }],
          spawnPoints: [{ x: 100, y: 100 }],
        }),
      );

      const result = await generateLevel('boss', 1, []);

      // 兜底路径 hp = baseHp(15) + randInt(-5,5) = 10
      expect(result.destructibles[0].hp).toBe(10);
    });

    it('AI 返回超出画布范围的坐标时回退到规则兜底', async () => {
      // x=9999 超出 800 画布宽度
      mocks.chatMock.mockResolvedValue(
        JSON.stringify({
          mode: 'boss',
          difficulty: 1,
          destructibles: [{ id: 'd1', type: 'box', x: 9999, y: 100, width: 60, height: 60, hp: 50, reward: 30 }],
          spawnPoints: [{ x: 100, y: 100 }],
        }),
      );

      const result = await generateLevel('boss', 1, []);

      // 兜底路径首项 x=100
      expect(result.destructibles[0].x).toBe(100);
    });

    it('AI 返回缺字段的可破坏物时回退到规则兜底', async () => {
      // 缺 reward 字段
      mocks.chatMock.mockResolvedValue(
        JSON.stringify({
          mode: 'boss',
          difficulty: 1,
          destructibles: [{ id: 'd1', type: 'box', x: 100, y: 100, width: 60, height: 60, hp: 50 }],
          spawnPoints: [{ x: 100, y: 100 }],
        }),
      );

      const result = await generateLevel('boss', 1, []);

      expect(result.destructibles).toHaveLength(10);
    });

    it('AI 返回非法 bossSpawn 时回退到规则兜底', async () => {
      // bossSpawn 坐标越界，整体校验失败
      mocks.chatMock.mockResolvedValue(
        JSON.stringify({
          mode: 'boss',
          difficulty: 1,
          destructibles: [{ id: 'd1', type: 'box', x: 100, y: 100, width: 60, height: 60, hp: 50, reward: 30 }],
          spawnPoints: [{ x: 100, y: 100 }],
          bossSpawn: { x: -50, y: 9999 },
        }),
      );

      const result = await generateLevel('boss', 1, []);

      // 回退兜底，bossSpawn 为固定 { x: 400, y: 150 }
      expect(result.bossSpawn).toEqual({ x: 400, y: 150 });
    });

    it('AI 返回合法数据且无 bossSpawn 时直接返回（非 boss 模式）', async () => {
      const aiLayout: LevelLayout = {
        mode: 'brawl',
        difficulty: 2,
        destructibles: [
          { id: 'ai_1', type: 'bottle', x: 200, y: 300, width: 40, height: 40, hp: 20, reward: 15 },
        ],
        spawnPoints: [{ x: 400, y: 500 }],
      };
      mocks.chatMock.mockResolvedValue(JSON.stringify(aiLayout));

      const result = await generateLevel('brawl', 2, []);

      expect(result).toEqual(aiLayout);
    });
  });
});
