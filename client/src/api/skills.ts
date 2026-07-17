import http from './http';
import { unwrap } from './unwrap';

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

  unlock(skillId: number): Promise<{ success: boolean; skillId: number }> {
    return unwrap(http.post('/skills/unlock', { skillId }));
  },

  upgrade(skillId: number): Promise<UpgradeResult> {
    return unwrap(http.post('/skills/upgrade', { skillId }));
  },

  activate(skillId: number, active: boolean): Promise<{ success: boolean; skillId: number; isActive: boolean }> {
    return unwrap(http.post('/skills/activate', { skillId, active }));
  },
};