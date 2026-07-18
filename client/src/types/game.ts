/**
 * 游戏通用类型契约
 *
 * 设计说明：
 * - AI 生成相关类型（MonsterSkill / MonsterAppearance / MonsterConfig / Destructible /
 *   LevelScene / LevelLayout / GameEvent / LevelConfig）已统一收敛到 server/src/ai/*
 *   各模块独立定义并实际使用；client 端原定义因长期零外部引用，保留会形成双源
 *   维护漂移反模式，按 YAGNI 原则删除。若未来前端某页面需要显式类型注解，
 *   应通过后端共享类型或显式 import server 端类型，避免重新复制结构。
 * - MonsterGenerateInput 同样已收敛到 server/src/ai/monster-generator.ts 单一源。
 * - GameMode 是前后端共享的对战模式字面量联合类型，保留为唯一导出。
 */

/** 对战模式 */
export type GameMode = 'boss' | 'brawl' | 'speed';
