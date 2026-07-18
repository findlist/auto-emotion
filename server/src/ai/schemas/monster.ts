// server/src/ai/schemas/monster.ts
// 怪兽配置 zod schema：用于校验生成结果与请求体
// 生成器输出与 API 响应均需通过此 schema 校验

import { z } from 'zod';

// 设计原因：以下三个 schema（skillTypeSchema/skillSchema/appearanceSchema）全仓零外部引用，
// 仅在同文件 monsterSchema 内部组合使用，按 YAGNI 原则不暴露 export，避免外部误用形成耦合
// 技能类型枚举：attack 直接伤害、debuff 减益、summon 召唤
const skillTypeSchema = z.enum(['attack', 'debuff', 'summon']);

// 单个技能 schema
const skillSchema = z.object({
  name: z.string().min(1, '技能名称不能为空'),
  type: skillTypeSchema,
  effect: z.string().min(1, '技能效果不能为空'),
  cooldown: z.number().positive('冷却时间必须为正数'),
});

// 外观 schema
const appearanceSchema = z.object({
  color: z.string().min(1, '颜色不能为空'),
  shape: z.string().min(1, '形状不能为空'),
  size: z.number().positive('尺寸必须为正数'),
});

// 怪兽配置 schema：生成器输出的完整结构
export const monsterSchema = z.object({
  name: z.string().min(1, '名称不能为空'),
  avatar: z.string().min(1, '头像不能为空'),
  hp: z.number().int().positive('生命值必须为正整数'),
  skills: z.array(skillSchema),
  weakness: z.string().min(1, '弱点不能为空'),
  stressTags: z.array(z.string()),
  appearance: appearanceSchema,
});

// 请求体 schema：POST /api/ai/monster 的入参校验
export const monsterGenerateBodySchema = z.object({
  stressKeywords: z
    .array(z.string().min(1))
    .min(1, '至少需要 1 个压力关键词')
    .max(10, '最多支持 10 个压力关键词'),
  difficulty: z.number().int().min(1).max(5, '难度档位为 1-5'),
});

// 设计原因：原 z.infer 推导的 MonsterSchema/MonsterGenerateBody 类型全仓零引用
// （生成器 monster-generator.ts 自定义 MonsterGenerateInput/MonsterConfig/MonsterAppearance
// 接口，路由 ai.ts 仅用 schema 常量做 safeParse 不取推导类型），按 YAGNI 原则删除
// 避免双源维护漂移；如未来需要类型注解应直接复用 schema 推导或 generator 现有接口
