import http from './http';
import { unwrap } from './unwrap';

export interface LeaderboardEntry {
  rank: number;
  // 后端 leaderboard-service.ts RankingItem.userId 为 string（users.id UUID），
  // 客户端历史误用 number 导致调用方需 String() 绕路比较，收敛后可直接 ===
  userId: string;
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
  // 合并 4 个具名方法为单一泛型方法：URL 路径直接由 type 字面量拼接
  // 设计原因：原 getPower/getBattle/getSpeed/getFriends 4 个方法仅 URL 路径不同，其余完全一致；
  // 调用方 leaderboard.tsx 通过 apiMap 反向映射 type → method，形成冗余往返；
  // 合并后与 server 端 leaderboard-service.ts getLeaderboard(type, ...) 形状对称，
  // 新增榜单类型只需扩展 LeaderboardType 联合，无需在 api 模块加方法
  get(type: LeaderboardType, page: number = 1, pageSize: number = 20): Promise<LeaderboardResponse> {
    return unwrap(http.get(`/leaderboard/${type}`, { params: { page, pageSize } }));
  },

  getUserRank(type: LeaderboardType): Promise<UserRank> {
    return unwrap(http.get(`/leaderboard/${type}/me`));
  },
};