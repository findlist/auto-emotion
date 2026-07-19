import http from './http';
import { unwrap, unwrapField } from './unwrap';

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
  // unwrapField 一步完成「解包 + 取字段」，消除 await 中间变量
  list(): Promise<Pet[]> {
    return unwrapField(http.get<{ pets: Pet[] }>('/pets/list'), 'pets');
  },

  equip(petId: number): Promise<{ success: boolean; petId: number }> {
    return unwrap(http.post('/pets/equip', { petId }));
  },

  buy(petId: number): Promise<{ success: boolean; petId: number }> {
    return unwrap(http.post('/pets/buy', { petId }));
  },
};