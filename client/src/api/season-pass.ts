import http from './http';
import { unwrap } from './unwrap';

export interface SeasonReward {
  level: number;
  exp_required: number;
  free_reward_type: string;
  free_reward_id: number;
  free_reward_type_amount?: number;
  premium_reward_type: string;
  premium_reward_id: number;
  freeClaimed: boolean;
  premiumClaimed: boolean;
}

export interface SeasonPass {
  seasonId: number;
  seasonName: string;
  seasonStartedAt: string;
  seasonEndsAt: string;
  level: number;
  exp: number;
  isPremium: boolean;
  rewards: SeasonReward[];
}

export const seasonPassApi = {
  // 注：返回 Promise<T>，无需 async/await 临时变量
  get(): Promise<SeasonPass> {
    return unwrap(http.get('/season-pass'));
  },

  buy(): Promise<{ success: boolean }> {
    return unwrap(http.post('/season-pass/buy'));
  },

  claim(level: number, isPremium: boolean): Promise<{ success: boolean }> {
    return unwrap(http.post('/season-pass/claim', { level, isPremium }));
  },
};