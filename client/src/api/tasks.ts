import http from './http';
import { unwrap, unwrapField } from './unwrap';

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
  // unwrapField 一步完成「解包 + 取字段」，消除 await 中间变量
  getDailyTasks(): Promise<DailyTask[]> {
    return unwrapField(http.get<{ tasks: DailyTask[] }>('/tasks/daily'), 'tasks');
  },

  claimReward(taskId: number): Promise<{ success: boolean; reward_exp: number; reward_gold: number }> {
    return unwrap(http.post(`/tasks/${taskId}/claim`));
  },
};