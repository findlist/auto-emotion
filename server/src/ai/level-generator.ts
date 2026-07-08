// server/src/ai/level-generator.ts
// 动态关卡生成：根据模式、难度、压力源生成关卡布局

import { chat } from './client.js';

// 关卡布局 schema（服务端内部使用）
export interface DestructibleItem {
  id: string;
  type: 'box' | 'bottle' | 'glass' | 'balloon';
  x: number;
  y: number;
  width: number;
  height: number;
  hp: number;
  reward: number;
}

export interface SpawnPoint {
  x: number;
  y: number;
}

export interface BossSpawn {
  x: number;
  y: number;
}

export interface LevelLayout {
  mode: string;
  difficulty: number;
  destructibles: DestructibleItem[];
  spawnPoints: SpawnPoint[];
  bossSpawn?: BossSpawn;
}

// 难度对应的可破坏物数量范围
const DESTRUCTIBLE_COUNTS: Record<number, [number, number]> = {
  1: [10, 15],
  2: [15, 20],
  3: [20, 25],
  4: [25, 30],
  5: [30, 40],
};

// 随机整数 [min, max]
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 主入口：生成关卡布局
 * @param mode 游戏模式：boss / brawl / speed
 * @param difficulty 难度档位：1-5
 * @param stressSources 压力源列表
 * @returns 关卡布局
 */
export async function generateLevel(
  mode: string,
  difficulty: number,
  stressSources: string[],
): Promise<LevelLayout> {
  // 如果配置了 AI_API_KEY，尝试 AI 生成
  if (process.env.AI_API_KEY) {
    try {
      const prompt = buildPrompt(mode, difficulty, stressSources);
      const result = await chat(prompt);
      const parsed = JSON.parse(result) as LevelLayout;
      // 简单的校验，确保返回结构合理
      if (parsed.destructibles && parsed.spawnPoints) {
        return parsed;
      }
    } catch {
      // AI 失败，fallback 到规则化生成
    }
  }

  // 规则化兜底
  return generateFallbackLevel(mode, difficulty);
}

/**
 * 构建 AI prompt
 */
function buildPrompt(mode: string, difficulty: number, stressSources: string[]): string {
  const prompt = `生成《情绪爆破局》${mode}模式关卡。

压力源: ${stressSources.join(', ')}
难度: ${difficulty}

请返回JSON格式的关卡布局，包含：
- mode: 游戏模式
- difficulty: 难度
- destructibles: 可破坏物数组，每项包含 id, type, x, y, width, height, hp, reward
- spawnPoints: 玩家出生点数组
- bossSpawn: BOSS出生点（仅boss模式需要）

可破坏物类型：box, bottle, glass, balloon
游戏画布尺寸：800x600`;
  return prompt;
}

/**
 * 规则化兜底关卡生成
 */
function generateFallbackLevel(mode: string, difficulty: number): LevelLayout {
  const [minCount, maxCount] = DESTRUCTIBLE_COUNTS[difficulty] ?? [20, 25];
  const baseCount = randInt(minCount, maxCount);
  const baseHp = 10 + difficulty * 5;
  const baseReward = 10 + difficulty * 2;

  const types: Array<'box' | 'bottle' | 'glass' | 'balloon'> = ['box', 'bottle', 'glass', 'balloon'];

  // 生成可破坏物
  const destructibles: DestructibleItem[] = Array.from({ length: baseCount }, (_, i) => ({
    id: `d_${i}`,
    type: types[i % types.length],
    x: 100 + (i % 8) * 80,
    y: 100 + Math.floor(i / 8) * 80,
    width: 60,
    height: 60,
    hp: baseHp + randInt(-5, 5),
    reward: baseReward + (types[i % types.length] === 'bottle' ? 5 : 0),
  }));

  // 玩家出生点
  const spawnPoints: SpawnPoint[] = [
    { x: 400, y: 500 },
    { x: 600, y: 500 },
  ];

  const layout: LevelLayout = {
    mode,
    difficulty,
    destructibles,
    spawnPoints,
  };

  // Boss 模式额外添加 boss 出生点
  if (mode === 'boss') {
    layout.bossSpawn = { x: 400, y: 150 };
  }

  return layout;
}
