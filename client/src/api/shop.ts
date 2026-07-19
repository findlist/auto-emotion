import http from './http';
import { unwrap, unwrapField } from './unwrap';

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
  // unwrapField 一步完成「解包 + 取字段」，消除 await 中间变量
  getItems(type?: string): Promise<ShopItem[]> {
    const params = type ? { type } : {};
    return unwrapField(http.get<{ items: ShopItem[] }>('/shop/items', { params }), 'items');
  },

  buy(itemId: number): Promise<{ success: boolean; item: ShopItem }> {
    return unwrap(http.post('/shop/buy', { itemId }));
  },

  // unwrapField 一步完成「解包 + 取字段」，消除 await 中间变量
  getInventory(): Promise<InventoryItem[]> {
    return unwrapField(http.get<{ inventory: InventoryItem[] }>('/shop/inventory'), 'inventory');
  },
};