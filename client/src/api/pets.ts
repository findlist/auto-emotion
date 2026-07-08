import http from './http';

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

  async equip(petId: number): Promise<{ success: boolean; petId: number }> {
    const res = await http.post('/pets/equip', { petId });
    return res.data;
  },

  async buy(petId: number): Promise<{ success: boolean; petId: number }> {
    const res = await http.post('/pets/buy', { petId });
    return res.data;
  },
};