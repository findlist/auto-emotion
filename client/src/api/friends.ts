import http from './http';

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
  async getFriends(): Promise<Friend[]> {
    const res = await http.get('/friends');
    return res.data.friends;
  },

  async getRequests(): Promise<FriendRequest[]> {
    const res = await http.get('/friends/requests');
    return res.data.requests;
  },

  async sendRequest(targetUserId: number): Promise<{ success: boolean; requestId?: number; autoAccepted?: boolean }> {
    const res = await http.post('/friends/request', { targetUserId });
    return res.data;
  },

  async accept(requestId: number): Promise<{ success: boolean }> {
    const res = await http.post('/friends/accept', { requestId });
    return res.data;
  },

  async reject(requestId: number): Promise<{ success: boolean }> {
    const res = await http.post('/friends/reject', { requestId });
    return res.data;
  },

  async remove(friendId: number): Promise<{ success: boolean }> {
    const res = await http.delete(`/friends/${friendId}`);
    return res.data;
  },
};