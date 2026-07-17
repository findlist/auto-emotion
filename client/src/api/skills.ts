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
  // unwrap 解包后取 data.skills（响应拦截器已将 ApiResponse.data 挂到 response.data）
  async list(): Promise<Skill[]> {
    const data = await unwrap(http.get<{ skills: Skill[] }>('/skills/list'));
    return data.skills;
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