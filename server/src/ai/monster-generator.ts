// server/src/ai/monster-generator.ts
// 怪兽生成器：根据压力关键词与难度档位生成怪兽配置
// 核心流程：关键词匹配 → 多关键词融合 → 难度档位计算 → 技能随机选取

import {
  stressKeywords,
  fallbackEntry,
  type StressKeywordEntry,
  type SkillTemplate,
} from './dict/stress-keywords.js';

// 生成器输入
export interface MonsterGenerateInput {
  stressKeywords: string[];
  difficulty: number; // 1-5
}

// 怪兽外观
export interface MonsterAppearance {
  color: string;
  shape: string;
  size: number;
}

// 生成器输出：完整怪兽配置
export interface MonsterConfig {
  name: string;
  avatar: string;
  hp: number;
  skills: SkillTemplate[];
  weakness: string;
  stressTags: string[];
  appearance: MonsterAppearance;
}

// 主入口：生成怪兽配置
export function generate(input: MonsterGenerateInput): MonsterConfig {
  const { stressKeywords: keywords, difficulty } = input;

  // 1. 关键词匹配：已知词用模板，未知词用兜底
  const entries = matchEntries(keywords);

  // 2. 多关键词融合：name / avatar / weakness / appearance 取首个匹配条目
  const firstEntry = entries[0] ?? fallbackEntry;
  const name = buildName(keywords, firstEntry);
  const avatar = firstEntry.avatar;
  const weakness = firstEntry.weaknessTemplate;

  // 3. 难度档位：hp 与技能数
  const hp = calcHp(difficulty);
  const skillCount = getSkillCount(difficulty);
  const skills = pickSkills(entries, skillCount);

  // 4. stressTags 合并所有输入关键词
  const stressTags = [...keywords];

  // 5. 外观：颜色与形状取首个条目，尺寸随难度增长
  const appearance = buildAppearance(firstEntry, difficulty);

  return { name, avatar, hp, skills, weakness, stressTags, appearance };
}

// 关键词匹配：逐个查找词典，未命中则用兜底条目（保留原关键词）
function matchEntries(keywords: string[]): StressKeywordEntry[] {
  return keywords.map((kw) => {
    const found = stressKeywords.find((e) => e.keyword === kw);
    if (found) return found;
    // 兜底：复制兜底模板并写入原关键词，便于 stressTags 追溯
    return { ...fallbackEntry, keyword: kw };
  });
}

// 名称融合：关键词空格拼接 + 首个匹配条目的 nameSuffix
// 示例：["加班","KPI"] + nameSuffix "噩梦兽" → "加班 KPI 噩梦兽"
function buildName(keywords: string[], firstEntry: StressKeywordEntry): string {
  return `${keywords.join(' ')} ${firstEntry.nameSuffix}`;
}

// hp 计算：difficulty × 1000 + random(-200, 200)，最小 100
function calcHp(difficulty: number): number {
  const base = difficulty * 1000;
  const offset = Math.floor(Math.random() * 401) - 200; // -200 ~ 200
  return Math.max(100, base + offset);
}

// 技能数档位：1→1，2-3→2，4-5→3
function getSkillCount(difficulty: number): number {
  if (difficulty <= 1) return 1;
  if (difficulty <= 3) return 2;
  return 3;
}

// 技能选取：合并所有匹配条目的技能池，按 name 去重后随机选取指定数量
function pickSkills(entries: StressKeywordEntry[], count: number): SkillTemplate[] {
  const pool = collectUniqueSkills(entries);
  // 池子不足时用兜底模板补充
  if (pool.length < count) {
    for (const skill of fallbackEntry.skillTemplates) {
      if (pool.length >= count) break;
      if (!pool.some((s) => s.name === skill.name)) {
        pool.push(skill);
      }
    }
  }
  return shuffle(pool).slice(0, count);
}

// 收集去重技能：按 name 去重，保留首次出现
function collectUniqueSkills(entries: StressKeywordEntry[]): SkillTemplate[] {
  const result: SkillTemplate[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    for (const skill of entry.skillTemplates) {
      if (seen.has(skill.name)) continue;
      seen.add(skill.name);
      result.push(skill);
    }
  }
  return result;
}

// 外观构建：颜色与形状取首个条目，尺寸随难度线性增长（1.0 ~ 3.0）
function buildAppearance(
  firstEntry: StressKeywordEntry,
  difficulty: number,
): MonsterAppearance {
  return {
    color: firstEntry.color,
    shape: firstEntry.shape,
    size: 0.5 + difficulty * 0.5,
  };
}

// Fisher-Yates 洗牌：原地打乱数组顺序
function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
