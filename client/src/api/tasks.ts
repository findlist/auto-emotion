import http from './http';

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

  async claimReward(taskId: number): Promise<{ success: boolean; reward_exp: number; reward_gold: number }> {
    const res = await http.post(`/tasks/${taskId}/claim`);
    return res.data;
  },
};