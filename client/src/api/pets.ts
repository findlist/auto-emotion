import http from './http';
import { unwrap } from './unwrap';

export interface Pet {
  id: number;
  name: string;
  emoji: string;
  description: string;
  stat_bonus: Record<string, unknown>;
  unlock_cost_gold: number;
  is_equipped?: boolean;
}

export const petApi = {
  // unwrap 解包后取 data.pets（响应拦截器已将 ApiResponse.data 挂到 response.data）
  async list(): Promise<Pet[]> {
    const data = await unwrap(http.get<{ pets: Pet[] }>('/pets/list'));
    return data.pets;
  },

  equip(petId: number): Promise<{ success: boolean; petId: number }> {
    return unwrap(http.post('/pets/equip', { petId }));
  },

  buy(petId: number): Promise<{ success: boolean; petId: number }> {
    return unwrap(http.post('/pets/buy', { petId }));
  },
};