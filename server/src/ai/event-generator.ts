// server/src/ai/event-generator.ts
// 随机事件生成：预设事件池 + 随机抽取

import { shuffle } from '../utils/shuffle.js';

// 游戏事件结构
export interface GameEvent {
  id: string;
  name: string;
  type: 'popup' | 'debuff' | 'buff' | 'spawn';
  triggerTime: number; // 事件触发时间（秒）
  duration: number;    // 持续时间（秒），0 表示即时
  effect: string;      // 效果描述
  payload: Record<string, unknown>; // 附加数据
}

// 预设事件池（10个通用办公压力事件）
const PRESET_EVENTS: Omit<GameEvent, 'id' | 'triggerTime'>[] = [
  {
    type: 'buff',
    name: '老板弹窗',
    effect: '老板突然@你，攻击力+20%',
    duration: 10,
    payload: { attackMultiplier: 1.2 },
  },
  {
    type: 'debuff',
    name: '广告弹窗',
    effect: '右下角弹出广告，移速-30%',
    duration: 8,
    payload: { speedMultiplier: 0.7 },
  },
  {
    type: 'buff',
    name: '咖啡时间',
    effect: '喝杯咖啡，暴击率+15%',
    duration: 15,
    payload: { critRateBonus: 0.15 },
  },
  {
    type: 'buff',
    name: '减压球',
    effect: '获得减压球，大招充能+50%',
    duration: 0,
    payload: { ultimateCharge: 50 },
  },
  {
    type: 'debuff',
    name: '加班通知',
    effect: '收到加班通知，攻击-20%',
    duration: 12,
    payload: { attackMultiplier: 0.8 },
  },
  {
    type: 'buff',
    name: '准时下班',
    effect: '今天准时！全属性+10%',
    duration: 20,
    payload: { allStatsMultiplier: 1.1 },
  },
  {
    type: 'buff',
    name: '能量饮料',
    effect: '喝下饮料，攻速翻倍',
    duration: 10,
    payload: { attackSpeedMultiplier: 2 },
  },
  {
    type: 'debuff',
    name: 'PPT 改版',
    effect: 'PPT要大改！屏幕抖动',
    duration: 5,
    payload: { screenShake: 0.5 },
  },
  {
    type: 'buff',
    name: '好消息',
    effect: '项目获奖！经验+50%',
    duration: 0,
    payload: { expMultiplier: 1.5 },
  },
  {
    type: 'debuff',
    name: '系统崩溃',
    effect: '编译失败了！所有技能冷却+3秒',
    duration: 0,
    payload: { cooldownPenalty: 3 },
  },
];

/**
 * 生成随机事件列表
 * @param count 需要的事件数量，默认 3 个
 * @param startTime 首个事件的触发时间（秒），默认 30
 * @param interval 事件之间的时间间隔（秒），默认 20
 * @returns 事件数组
 */
export function generateEvents(
  count: number = 3,
  startTime: number = 30,
  interval: number = 20,
): GameEvent[] {
  // Fisher-Yates 洗牌：抽取到 utils/shuffle.ts，保证均匀分布
  const shuffled = shuffle(PRESET_EVENTS);
  const selected = shuffled.slice(0, count);

  return selected.map((event, i) => ({
    ...event,
    id: `event_${Date.now()}_${i}`,
    triggerTime: startTime + i * interval,
  }));
}
