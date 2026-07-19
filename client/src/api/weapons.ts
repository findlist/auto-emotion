import http from './http';
import { unwrap, unwrapField } from './unwrap';

export interface Weapon {
  id: number;
  name: string;
  description: string;
  base_attack: number;
  base_crit_rate: number;
  base_crit_damage: number;
  unlock_cost_gold: number;
  icon_key: string;
  level?: number;
  is_equipped?: boolean;
  current_exp?: number;
}

export interface UpgradeResult {
  success: boolean;
  newLevel: number;
  cost: { gold: number; fragments: number };
}

export const weaponApi = {
  // unwrapField 一步完成「解包 + 取字段」，消除 await 中间变量
  list(): Promise<Weapon[]> {
    return unwrapField(http.get<{ weapons: Weapon[] }>('/weapons/list'), 'weapons');
  },

  upgrade(weaponId: number): Promise<UpgradeResult> {
    return unwrap(http.post('/weapons/upgrade', { weaponId }));
  },

  equip(weaponId: number): Promise<{ success: boolean; weaponId: number }> {
    return unwrap(http.post('/weapons/equip', { weaponId }));
  },

  buy(weaponId: number): Promise<{ success: boolean; weaponId: number }> {
    return unwrap(http.post('/weapons/buy', { weaponId }));
  },
};