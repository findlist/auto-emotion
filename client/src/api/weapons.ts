import http from './http';

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
  async list(): Promise<Weapon[]> {
    const res = await http.get('/weapons/list');
    return res.data.weapons;
  },

  async upgrade(weaponId: number): Promise<UpgradeResult> {
    const res = await http.post('/weapons/upgrade', { weaponId });
    return res.data;
  },

  async equip(weaponId: number): Promise<{ success: boolean; weaponId: number }> {
    const res = await http.post('/weapons/equip', { weaponId });
    return res.data;
  },

  async buy(weaponId: number): Promise<{ success: boolean; weaponId: number }> {
    const res = await http.post('/weapons/buy', { weaponId });
    return res.data;
  },
};