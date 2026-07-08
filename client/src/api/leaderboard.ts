import http from './http';

export interface LeaderboardEntry {
  rank: number;
  userId: number;
  nickname: string;
  score: number;
}

export interface LeaderboardResponse {
  ranking: LeaderboardEntry[];
  total: number;
}

export interface UserRank {
  rank: number;
  score: number;
}

export type LeaderboardType = 'power' | 'battle' | 'speed' | 'friends';

export const leaderboardApi = {
  async getPower(page: number = 1, pageSize: number = 20): Promise<LeaderboardResponse> {
    const res = await http.get('/leaderboard/power', { params: { page, pageSize } });
    return res.data;
  },

  async getBattle(page: number = 1, pageSize: number = 20): Promise<LeaderboardResponse> {
    const res = await http.get('/leaderboard/battle', { params: { page, pageSize } });
    return res.data;
  },

  async getSpeed(page: number = 1, pageSize: number = 20): Promise<LeaderboardResponse> {
    const res = await http.get('/leaderboard/speed', { params: { page, pageSize } });
    return res.data;
  },

  async getFriends(page: number = 1, pageSize: number = 20): Promise<LeaderboardResponse> {
    const res = await http.get('/leaderboard/friends', { params: { page, pageSize } });
    return res.data;
  },

  async getUserRank(type: LeaderboardType): Promise<UserRank> {
    const res = await http.get(`/leaderboard/${type}/me`);
    return res.data;
  },
};