/**
 * 武器配置数据
 * 5款武器的基础属性和解锁费用
 */

export interface WeaponConfig {
  id: number;
  name: string;
  description: string;
  base_attack: number;
  base_crit_rate: number;
  base_crit_damage: number;
  unlock_cost_gold: number;
  icon_key: string;
}

export const WEAPONS: WeaponConfig[] = [
  {
    id: 1,
    name: '泡泡枪',
    description: '发射彩色泡泡，击中目标时轻微击退',
    base_attack: 10,
    base_crit_rate: 0.15,
    base_crit_damage: 1.3,
    unlock_cost_gold: 0,
    icon_key: 'weapon_bubble_gun',
  },
  {
    id: 2,
    name: '西瓜锤',
    description: '沉重的一击，暴击伤害极高',
    base_attack: 20,
    base_crit_rate: 0.10,
    base_crit_damage: 2.0,
    unlock_cost_gold: 500,
    icon_key: 'weapon_watermelon_hammer',
  },
  {
    id: 3,
    name: 'PPT粉碎炮',
    description: '发射幻灯片，每3秒额外伤害',
    base_attack: 15,
    base_crit_rate: 0.12,
    base_crit_damage: 1.5,
    unlock_cost_gold: 1000,
    icon_key: 'weapon_ppt_cannon',
  },
  {
    id: 4,
    name: '闹钟飞镖',
    description: '快速连续攻击，攻速提升50%',
    base_attack: 8,
    base_crit_rate: 0.20,
    base_crit_damage: 1.2,
    unlock_cost_gold: 2000,
    icon_key: 'weapon_alarm_dart',
  },
  {
    id: 5,
    name: '社交盾牌',
    description: '防御型武器，减少受到的伤害30%',
    base_attack: 5,
    base_crit_rate: 0.05,
    base_crit_damage: 1.0,
    unlock_cost_gold: 3000,
    icon_key: 'weapon_social_shield',
  },
];

/**
 * 初始化武器数据到数据库（占位）
 */
export function initWeapons(_pool: unknown): void {
  // TODO: 实现武器数据的数据库初始化
  // 目前使用纯内存对象，不需要数据库连接
  console.log('Weapons initialized:', WEAPONS.length);
}
