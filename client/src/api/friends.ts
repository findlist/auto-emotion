import http from './http';
import { unwrap } from './unwrap';

export interface Friend {
  id: number;
  nickname: string;
  avatar_url: string;
  status: number;
  online: boolean;
}

export interface FriendRequest {
  id: number;
  from_user_id: number;
  nickname: string;
  avatar_url: string;
  created_at: string;
}

export const friendApi = {
  // 带字段访问场景：unwrap 解包后取 data.friends（响应拦截器已将 ApiResponse.data 挂到 response.data）
  async getFriends(): Promise<Friend[]> {
    const data = await unwrap(http.get<{ friends: Friend[] }>('/friends'));
    return data.friends;
  },

  async getRequests(): Promise<FriendRequest[]> {
    const data = await unwrap(http.get<{ requests: FriendRequest[] }>('/friends/requests'));
    return data.requests;
  },

  // 无字段访问场景：unwrap 直接返回业务数据
  sendRequest(targetUserId: number): Promise<{ success: boolean; requestId?: number; autoAccepted?: boolean }> {
    return unwrap(http.post('/friends/request', { targetUserId }));
  },

  accept(requestId: number): Promise<{ success: boolean }> {
    return unwrap(http.post('/friends/accept', { requestId }));
  },

  reject(requestId: number): Promise<{ success: boolean }> {
    return unwrap(http.post('/friends/reject', { requestId }));
  },

  remove(friendId: number): Promise<{ success: boolean }> {
    return unwrap(http.delete(`/friends/${friendId}`));
  },
};
