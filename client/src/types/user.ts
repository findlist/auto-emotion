/**
 * 用户相关类型
 */
export interface User {
  // 后端 users.id 为 PostgreSQL UUID，server 端 user-service.ts 已声明 id: string
  // 客户端历史误用 number 导致 friends.tsx parseInt 截断 UUID、leaderboard.tsx 需 String() 绕路比较
  id: string;
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
