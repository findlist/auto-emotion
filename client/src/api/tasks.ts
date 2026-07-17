import http from './http';
import { unwrap } from './unwrap';

export interface DailyTask {
  id: number;
  code: string;
  name: string;
  type: number;
  target: number;
  progress: number;
  claimed: boolean;
  reward_exp: number;
  reward_gold: number;
}

export const taskApi = {
  // unwrap 解包后取 data.tasks（响应拦截器已将 ApiResponse.data 挂到 response.data）
  async getDailyTasks(): Promise<DailyTask[]> {
    const data = await unwrap(http.get<{ tasks: DailyTask[] }>('/tasks/daily'));
    return data.tasks;
  },

  claimReward(taskId: number): Promise<{ success: boolean; reward_exp: number; reward_gold: number }> {
    return unwrap(http.post(`/tasks/${taskId}/claim`));
  },
};