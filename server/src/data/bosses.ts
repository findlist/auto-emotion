/**
 * Boss 配置数据
 * 4个经典 Boss 的属性和技能
 */

export interface BossConfig {
  id: number;
  name: string;
  description: string;
  hp: number;
  attack: number;
  skills: string[];
  icon_key: string;
}

export const BOSSES: BossConfig[] = [
  {
    id: 1,
    name: '加班魔',
    description: '深夜出没的加班恶魔',
    hp: 500,
    attack: 15,
    skills: ['连续加班', '通宵突袭'],
    icon_key: 'boss_overtime',
  },
  {
    id: 2,
    name: 'KPI 领主',
    description: '数字的化身',
    hp: 800,
    attack: 20,
    skills: ['数字轰炸', '末位淘汰'],
    icon_key: 'boss_kpi',
  },
  {
    id: 3,
    name: '甲方幽灵',
    description: '需求变更无常',
    hp: 1000,
    attack: 25,
    skills: ['需求变更', '明天上线'],
    icon_key: 'boss_client',
  },
  {
    id: 4,
    name: '焦虑巨龙',
    description: '所有压力的总和',
    hp: 2000,
    attack: 40,
    skills: ['裁员危机', '35岁门槛', '中年危机'],
    icon_key: 'boss_anxiety',
  },
];
