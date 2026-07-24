import http from './http';
import { unwrap, unwrapField } from './unwrap';

export interface Friend {
  // friendships.id 为 UUID，与 server 端 friend-service.ts 对齐
  id: string;
  nickname: string;
  avatar_url: string;
  status: number;
  online: boolean;
}

export interface FriendRequest {
  id: string;
  // 发起者用户 ID，与 users.id UUID 类型对齐
  from_user_id: string;
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
    return unwrapField(http.get<{ requests: FriendRequest[] }>('/requests'), 'requests');
  },

  // 无字段访问场景：unwrap 直接返回业务数据
  // targetUserId 为 UUID 字符串，server 端 friend-service.ts 已声明 string 类型
  sendRequest(targetUserId: string): Promise<{ success: boolean; requestId?: string; autoAccepted?: boolean }> {
    return unwrap(http.post('/friends/request', { targetUserId }));
  },

  accept(requestId: string): Promise<{ success: boolean }> {
    return unwrap(http.post('/friends/accept', { requestId }));
  },

  reject(requestId: string): Promise<{ success: boolean }> {
    return unwrap(http.post('/friends/reject', { requestId }));
  },

  remove(friendId: string): Promise<{ success: boolean }> {
    return unwrap(http.delete(`/friends/${friendId}`));
  },
};
