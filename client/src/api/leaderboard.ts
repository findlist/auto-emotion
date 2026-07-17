import http from './http';
import { unwrap } from './unwrap';

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
  // 注：返回 Promise<LeaderboardResponse>，无需 async/await 临时变量
  getPower(page: number = 1, pageSize: number = 20): Promise<LeaderboardResponse> {
    return unwrap(http.get('/leaderboard/power', { params: { page, pageSize } }));
  },

  getBattle(page: number = 1, pageSize: number = 20): Promise<LeaderboardResponse> {
    return unwrap(http.get('/leaderboard/battle', { params: { page, pageSize } }));
  },

  getSpeed(page: number = 1, pageSize: number = 20): Promise<LeaderboardResponse> {
    return unwrap(http.get('/leaderboard/speed', { params: { page, pageSize } }));
  },

  getFriends(page: number = 1, pageSize: number = 20): Promise<LeaderboardResponse> {
    return unwrap(http.get('/leaderboard/friends', { params: { page, pageSize } }));
  },

  getUserRank(type: LeaderboardType): Promise<UserRank> {
    return unwrap(http.get(`/leaderboard/${type}/me`));
  },
};