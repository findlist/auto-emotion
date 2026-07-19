import http from './http';
import { unwrap, unwrapField } from './unwrap';

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
  // unwrapField 一步完成「解包 + 取字段」，消除 await 中间变量
  list(): Promise<Skill[]> {
    return unwrapField(http.get<{ skills: Skill[] }>('/skills/list'), 'skills');
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