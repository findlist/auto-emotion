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
  async getDailyTasks(): Promise<DailyTask[]> {
    const res = await http.get('/tasks/daily');
    return res.data.tasks;
  },

  claimReward(taskId: number): Promise<{ success: boolean; reward_exp: number; reward_gold: number }> {
    return unwrap(http.post(`/tasks/${taskId}/claim`));
  },
};