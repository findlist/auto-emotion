import http from './http';
import { unwrap, unwrapField } from './unwrap';

export interface Achievement {
  id: number;
  code: string;
  name: string;
  description: string;
  type: number;
  target: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
  reward_type: string;
  reward_id: number;
}

export const achievementApi = {
  // unwrapField 一步完成「解包 + 取字段」，消除 await 中间变量
  getAchievements(): Promise<Achievement[]> {
    return unwrapField(http.get<{ achievements: Achievement[] }>('/achievements'), 'achievements');
  },

  claimReward(achievementId: number): Promise<{ success: boolean; reward_type: string; reward_id: number }> {
    return unwrap(http.post(`/achievements/${achievementId}/claim`));
  },
};