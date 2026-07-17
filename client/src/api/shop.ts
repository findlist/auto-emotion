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
  // unwrap 解包后取 data.items（响应拦截器已将 ApiResponse.data 挂到 response.data）
  async getItems(type?: string): Promise<ShopItem[]> {
    const params = type ? { type } : {};
    const data = await unwrap(http.get<{ items: ShopItem[] }>('/shop/items', { params }));
    return data.items;
  },

  buy(itemId: number): Promise<{ success: boolean; item: ShopItem }> {
    return unwrap(http.post('/shop/buy', { itemId }));
  },

  // unwrap 解包后取 data.inventory（响应拦截器已将 ApiResponse.data 挂到 response.data）
  async getInventory(): Promise<InventoryItem[]> {
    const data = await unwrap(http.get<{ inventory: InventoryItem[] }>('/shop/inventory'));
    return data.inventory;
  },
};