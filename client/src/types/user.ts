/**
 * 用户相关类型
 */
export interface User {
  id: number;
  phone: string;
  nickname: string;
  avatarUrl: string;
  signature: string;
  coins: number;
  gems: number;
  level: number;
  exp: number;
  power: number;
  pvp_points: number;
  battleScore: number;
  status: number;
  lastLoginAt: string;
  createdAt: string;
}

export interface LoginResult {
  token: string;
  refreshToken: string;
  user: User;
}

export interface UpdateProfilePayload {
  nickname?: string;
  avatarUrl?: string;
  signature?: string;
}
