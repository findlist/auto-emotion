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
  // unwrap 解包后取 data.achievements（响应拦截器已将 ApiResponse.data 挂到 response.data）
  async getAchievements(): Promise<Achievement[]> {
    const data = await unwrap(http.get<{ achievements: Achievement[] }>('/achievements'));
    return data.achievements;
  },

  claimReward(achievementId: number): Promise<{ success: boolean; reward_type: string; reward_id: number }> {
    return unwrap(http.post(`/achievements/${achievementId}/claim`));
  },
};