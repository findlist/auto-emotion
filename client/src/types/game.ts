/**
 * AI 生成契约（与后端 server/src/ai 对齐）
 * 注：MonsterGenerateInput 已收敛到 server/src/ai/monster-generator.ts 单一源
 * （client 端零引用且后端已独立定义同名接口，避免双源维护漂移）
 */

/** 怪兽技能 */
export interface MonsterSkill {
  name: string;
  type: 'attack' | 'debuff' | 'summon';
  effect: string;
  cooldown: number;
}

/** 怪兽外观 */
export interface MonsterAppearance {
  color: string;
  shape: string;
  size: number;
}

/** 情绪怪兽配置 */
export interface MonsterConfig {
  name: string;
  avatar: string;
  hp: number;
  skills: MonsterSkill[];
  weakness: string;
  stressTags: string[];
  appearance: MonsterAppearance;
}

/** 可破坏物 */
export interface Destructible {
  type: 'glass' | 'bubble' | 'watermelon' | 'blocks';
  position: { x: number; y: number };
  score: number;
  stressTag?: string;
}

/** 关卡场景配置 */
export interface LevelScene {
  name: string;
  palette: string[];
  bgmStyle: string;
}

/** 动态关卡布局 */
export interface LevelLayout {
  seed: number;
  scene: LevelScene;
  destructibles: Destructible[];
  spawnPoints: Array<{ x: number; y: number }>;
  obstacles: Array<{ type: string; position: { x: number; y: number } }>;
}

/** 随机事件 */
export interface GameEvent {
  id: string;
  name: string;
  type: 'popup' | 'debuff' | 'buff' | 'spawn';
  triggerTime: number;
  duration: number;
  effect: string;
  payload: Record<string, unknown>;
}

/** 对战模式 */
export type GameMode = 'boss' | 'brawl' | 'speed';

/** 关卡下发完整配置 */
export interface LevelConfig {
  seed: number;
  monster: MonsterConfig;
  layout: LevelLayout;
  events: GameEvent[];
  mode: GameMode;
}
