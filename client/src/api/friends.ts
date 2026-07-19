import http from './http';
import { unwrap, unwrapField } from './unwrap';

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
  // unwrapField 一步完成「解包 + 取字段」，消除 await 中间变量
  getFriends(): Promise<Friend[]> {
    return unwrapField(http.get<{ friends: Friend[] }>('/friends'), 'friends');
  },

  getRequests(): Promise<FriendRequest[]> {
    return unwrapField(http.get<{ requests: FriendRequest[] }>('/friends/requests'), 'requests');
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
