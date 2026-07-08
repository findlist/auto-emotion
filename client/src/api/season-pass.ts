import http from './http';

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
  async get(): Promise<SeasonPass> {
    const res = await http.get('/season-pass');
    return res.data;
  },

  async buy(): Promise<{ success: boolean }> {
    const res = await http.post('/season-pass/buy');
    return res.data;
  },

  async claim(level: number, isPremium: boolean): Promise<{ success: boolean }> {
    const res = await http.post('/season-pass/claim', { level, isPremium });
    return res.data;
  },
};