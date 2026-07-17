import http from './http';
import { unwrap } from './unwrap';

export interface ShopItem {
  id: number;
  name: string;
  description: string;
  type: string;
  price: number;
  price_type: string;
  emoji: string;
}

export interface InventoryItem {
  id: number;
  item_type: string;
  item_id: number;
  quantity: number;
  name: string;
  emoji: string;
}

export const shopApi = {
  async getItems(type?: string): Promise<ShopItem[]> {
    const params = type ? { type } : {};
    const res = await http.get('/shop/items', { params });
    return res.data.items;
  },

  buy(itemId: number): Promise<{ success: boolean; item: ShopItem }> {
    return unwrap(http.post('/shop/buy', { itemId }));
  },

  async getInventory(): Promise<InventoryItem[]> {
    const res = await http.get('/shop/inventory');
    return res.data.inventory;
  },
};