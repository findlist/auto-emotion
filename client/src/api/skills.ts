import http from './http';

export interface Skill {
  id: number;
  name: string;
  description: string;
  type: 'active' | 'passive';
  effect: Record<string, unknown>;
  unlock_condition: Record<string, unknown>;
  level?: number;
  is_active?: boolean;
}

export interface UpgradeResult {
  success: boolean;
  newLevel: number;
  cost: number;
}

export const skillApi = {
  async list(): Promise<Skill[]> {
    const res = await http.get('/skills/list');
    return res.data.skills;
  },

  async unlock(skillId: number): Promise<{ success: boolean; skillId: number }> {
    const res = await http.post('/skills/unlock', { skillId });
    return res.data;
  },

  async upgrade(skillId: number): Promise<UpgradeResult> {
    const res = await http.post('/skills/upgrade', { skillId });
    return res.data;
  },

  async activate(skillId: number, active: boolean): Promise<{ success: boolean; skillId: number; isActive: boolean }> {
    const res = await http.post('/skills/activate', { skillId, active });
    return res.data;
  },
};