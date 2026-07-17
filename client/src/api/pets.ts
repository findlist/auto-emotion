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
  async list(): Promise<Pet[]> {
    const res = await http.get('/pets/list');
    return res.data.pets;
  },

  equip(petId: number): Promise<{ success: boolean; petId: number }> {
    return unwrap(http.post('/pets/equip', { petId }));
  },

  buy(petId: number): Promise<{ success: boolean; petId: number }> {
    return unwrap(http.post('/pets/buy', { petId }));
  },
};