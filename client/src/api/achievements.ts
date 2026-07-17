import http from './http';
import { unwrap } from './unwrap';

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
  async getAchievements(): Promise<Achievement[]> {
    const res = await http.get('/achievements');
    return res.data.achievements;
  },

  claimReward(achievementId: number): Promise<{ success: boolean; reward_type: string; reward_id: number }> {
    return unwrap(http.post(`/achievements/${achievementId}/claim`));
  },
};