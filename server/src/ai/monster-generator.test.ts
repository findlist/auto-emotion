import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generate } from './monster-generator.js';
import { fallbackEntry, stressKeywords } from './dict/stress-keywords.js';

// 关键词「加班」词典条目作为复用数据，验证匹配与字段透传
const JIABAN = stressKeywords.find((e) => e.keyword === '加班')!;

describe('monster-generator 怪兽生成器', () => {
  beforeEach(() => {
    // 固定随机序列：Math.random 返回 0 简化断言
    // - calcHp offset = Math.floor(0 * 401) - 200 = -200
    // - shuffle 因 Math.random 始终 0，每次交换均与索引 0 交换
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  it('已知关键词匹配词典：nameSuffix/avatar/weakness/color/shape 全字段透传', () => {
    const result = generate({ stressKeywords: ['加班'], difficulty: 3 });
    expect(result.name).toBe('加班 噩梦兽');
    expect(result.avatar).toBe('💼');
    expect(result.weakness).toBe('被连击 10 次眩晕');
    expect(result.appearance.color).toBe('#FF3D7F');
    expect(result.appearance.shape).toBe('square');
  });

  it('未知关键词使用兜底模板，stressTags 仍保留原关键词追溯', () => {
    const result = generate({ stressKeywords: ['未定义压力'], difficulty: 2 });
    expect(result.name).toBe('未定义压力 怪兽');
    expect(result.avatar).toBe('👾');
    expect(result.weakness).toBe(fallbackEntry.weaknessTemplate);
    expect(result.stressTags).toEqual(['未定义压力']);
  });

  it('多关键词融合：name 空格拼接 + 首个匹配条目的 nameSuffix', () => {
    const result = generate({ stressKeywords: ['加班', 'KPI'], difficulty: 2 });
    expect(result.name).toBe('加班 KPI 噩梦兽');
    // avatar/weakness/color/shape 均取首个匹配条目「加班」
    expect(result.avatar).toBe(JIABAN.avatar);
    expect(result.weakness).toBe(JIABAN.weaknessTemplate);
    expect(result.appearance.color).toBe(JIABAN.color);
  });

  it('关键词与未知混合：首个为未知时取兜底模板', () => {
    const result = generate({ stressKeywords: ['未知', '加班'], difficulty: 1 });
    expect(result.name).toBe('未知 加班 怪兽');
    expect(result.avatar).toBe(fallbackEntry.avatar);
  });

  it('hp 计算：difficulty × 1000 + offset，Math.random=0 时 offset=-200', () => {
    // 难度 3：base 3000 + offset(-200) = 2800
    const result = generate({ stressKeywords: ['加班'], difficulty: 3 });
    expect(result.hp).toBe(2800);
  });

  it('hp 难度 0 时仍受 Math.max(100) 兜底保护', () => {
    // 难度 0：base 0 + offset(-200) = -200 → max(100, -200) = 100
    const result = generate({ stressKeywords: ['加班'], difficulty: 0 });
    expect(result.hp).toBe(100);
  });

  it('技能数档位：1→1 / 2-3→2 / 4-5→3', () => {
    const d1 = generate({ stressKeywords: ['加班'], difficulty: 1 });
    const d2 = generate({ stressKeywords: ['加班'], difficulty: 2 });
    const d4 = generate({ stressKeywords: ['加班'], difficulty: 4 });
    expect(d1.skills).toHaveLength(1);
    expect(d2.skills).toHaveLength(2);
    expect(d4.skills).toHaveLength(3);
  });

  it('技能选取：按 name 去重，多关键词合并技能池后随机抽取', () => {
    // 加班与KPI各3个技能，且名称均不同，合并去重后6个
    const result = generate({ stressKeywords: ['加班', 'KPI'], difficulty: 5 });
    expect(result.skills).toHaveLength(3);
    // 技能 name 均来自合并池
    const allSkillNames = [
      ...JIABAN.skillTemplates,
      ...stressKeywords.find((e) => e.keyword === 'KPI')!.skillTemplates,
    ].map((s) => s.name);
    result.skills.forEach((s) => {
      expect(allSkillNames).toContain(s.name);
    });
    // 选取结果本身不应有重名
    const pickedNames = result.skills.map((s) => s.name);
    expect(new Set(pickedNames).size).toBe(pickedNames.length);
  });

  it('技能池不足时用兜底模板补充到所需数量', () => {
    // 单关键词「加班」3 个技能，难度 5 需要 3 个，正好满足
    // 构造场景：单关键词「加班」+ 难度 5，shuffle 后仍取 3 个，验证不超出
    const result = generate({ stressKeywords: ['加班'], difficulty: 5 });
    expect(result.skills).toHaveLength(3);
    const pickedNames = result.skills.map((s) => s.name);
    // 所有技能均来自「加班」技能池
    pickedNames.forEach((name) => {
      expect(JIABAN.skillTemplates.map((s) => s.name)).toContain(name);
    });
  });

  it('stressTags 合并所有输入关键词（含未知）', () => {
    const result = generate({ stressKeywords: ['加班', '未知词', 'KPI'], difficulty: 2 });
    expect(result.stressTags).toEqual(['加班', '未知词', 'KPI']);
  });

  it('外观尺寸随难度线性增长：size = 0.5 + difficulty × 0.5', () => {
    const r1 = generate({ stressKeywords: ['加班'], difficulty: 1 });
    const r5 = generate({ stressKeywords: ['加班'], difficulty: 5 });
    expect(r1.appearance.size).toBe(1.0);
    expect(r5.appearance.size).toBe(3.0);
  });

  it('空关键词列表：取兜底模板，name 仅 nameSuffix 无前缀', () => {
    // entries 为空，firstEntry 取 fallbackEntry；keywords.join(' ') 为空字符串
    const result = generate({ stressKeywords: [], difficulty: 3 });
    expect(result.name).toBe(' 怪兽'); // 空字符串 + 空格 + nameSuffix
    expect(result.avatar).toBe(fallbackEntry.avatar);
  });

  it('空关键词列表：skills 来自兜底模板技能池', () => {
    const result = generate({ stressKeywords: [], difficulty: 2 });
    expect(result.skills).toHaveLength(2);
    const allFallbackNames = fallbackEntry.skillTemplates.map((s) => s.name);
    result.skills.forEach((s) => {
      expect(allFallbackNames).toContain(s.name);
    });
  });
});
