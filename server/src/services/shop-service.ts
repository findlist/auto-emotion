// server/src/services/shop-service.ts
// 商城服务

import pool from '../config/database.js';
import { AppError, ErrorCode } from '../utils/error.js';
import { logger } from '../utils/logger.js';

interface ShopItem {
  id: number;
  name: string;
  description: string;
  type: string;
  price: number;
  price_type: string; // gold 或 gems
  emoji: string;
}

// 用户背包项：聚合 user_inventory 与多张商品/成就/宠物/武器表的名称
interface InventoryItem {
  id: number;
  item_type: string;
  item_id: number;
  quantity: number;
  name: string | null; // LEFT JOIN 可能无匹配，设为 nullable
  emoji: string;
}

// 商品模板
const SHOP_ITEMS: Omit<ShopItem, 'id'>[] = [
  { name: '挂机加速卡(1小时)', description: '挂机效率提升50%', type: 'item', price: 100, price_type: 'gold', emoji: '⚡' },
  { name: '挂机加速卡(1天)', description: '挂机效率提升100%', type: 'item', price: 500, price_type: 'gold', emoji: '🚀' },
  { name: '经验药水', description: '使用后获得1000经验', type: 'item', price: 200, price_type: 'gold', emoji: '🧪' },
  { name: '体力恢复药水', description: '恢复50体力', type: 'item', price: 150, price_type: 'gold', emoji: '❤️' },
  { name: '泡泡枪皮肤', description: '可爱的泡泡枪外观', type: 'weapon_skin', price: 1000, price_type: 'gold', emoji: '🔫' },
  { name: '彩虹泡泡皮肤', description: '彩虹色的泡泡枪', type: 'weapon_skin', price: 2000, price_type: 'gold', emoji: '🌈' },
  { name: '小喵宠物蛋', description: '可孵化出小喵宠物', type: 'pet', price: 3000, price_type: 'gold', emoji: '🥚' },
  { name: '小柴宠物蛋', description: '可孵化出小柴宠物', type: 'pet', price: 3000, price_type: 'gold', emoji: '🥚' },
  { name: '传说宠物蛋', description: '可孵化出传说宠物', type: 'pet', price: 10000, price_type: 'gold', emoji: '💎' },
];

/**
 * 初始化商品（如果不存在）
 */
async function ensureItemsExist(): Promise<void> {
  const existing = await pool.query('SELECT COUNT(*) as count FROM shop_items');
  if (parseInt(existing.rows[0].count, 10) > 0) {
    return;
  }

  for (const item of SHOP_ITEMS) {
    // shop_items 表实际列为 price_gold/effect_type/effect_value（无 price/price_type/emoji 列）
    // SHOP_ITEMS 模板用 price 表示金币价、price_type 表示货币类型，此处映射到 schema 的 price_gold
    // effect_type/effect_value 模板未定义，统一填 NULL；预填数据已由 001_init.sql 完成，本分支仅在空表时执行
    await pool.query(
      `INSERT INTO shop_items (name, description, type, price_gold, effect_type, effect_value)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING`,
      [item.name, item.description, item.type, item.price, null, null]
    );
  }
}

/**
 * 获取商品列表
 */
// SQL 通过 AS 别名将 price_gold 等真实列映射到 ShopItem 字段，需 as 断言对接接口契约
export async function getShopItems(type?: string): Promise<ShopItem[]> {
  await ensureItemsExist();

  // shop_items 表无 price/price_type/emoji 列：实际为 price_gold/price_real/effect_type/effect_value
  // 通过 AS 别名暴露 price/price_type/emoji 字段以保持 ShopItem 接口与前端兼容
  // price_real=0 表示金币商品（预填数据全部如此），故 price_type 固定 'gold'；emoji 用占位符
  let query = `SELECT id, name, description, type, price_gold AS price, 'gold' AS price_type, '🛒' AS emoji FROM shop_items WHERE 1=1`;
  const params: unknown[] = [];

  if (type) {
    query += ' AND type = $1';
    params.push(type);
  }

  query += ' ORDER BY price_gold';

  const result = await pool.query(query, params);
  // SQL 通过 AS 别名构造 ShopItem 兼容结构，断言保证类型契约可追溯
  return result.rows as ShopItem[];
}

/**
 * 购买商品
 */
export async function buyItem(userId: string, itemId: number): Promise<{ success: true; item: ShopItem }> {
  // 获取商品信息：SELECT * 会返回 schema 真实列(price_gold/effect_type 等)但无 price/price_type/emoji
  // 后续依赖 item.price 和 item.price_type 判断货币类型，缺失会导致都走 else 钻石分支（P0 修复）
  const itemResult = await pool.query(
    `SELECT id, name, description, type, price_gold AS price, 'gold' AS price_type, '🛒' AS emoji
     FROM shop_items WHERE id = $1`,
    [itemId]
  );

  if (itemResult.rows.length === 0) {
    throw new AppError(ErrorCode.NOT_FOUND, '商品不存在');
  }

  // SQL 通过 AS 别名构造 ShopItem 兼容结构，断言保证类型契约可追溯
  const item = itemResult.rows[0] as ShopItem;

  // 获取用户余额
  const userResult = await pool.query(
    `SELECT gold, gems FROM users WHERE id = $1`,
    [userId]
  );

  if (userResult.rows.length === 0) {
    throw new AppError(ErrorCode.NOT_FOUND, '用户不存在');
  }

  const user = userResult.rows[0];

  // 检查余额
  if (item.price_type === 'gold' && user.gold < item.price) {
    throw new AppError(ErrorCode.BAD_REQUEST, '金币不足');
  }
  if (item.price_type === 'gems' && user.gems < item.price) {
    throw new AppError(ErrorCode.BAD_REQUEST, '钻石不足');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 扣除货币（原子守卫：WHERE 余额 >= 价格 防止并发购买导致余额变负，RETURNING 验证扣减成功）
    // 设计原因：事务外的余额检查只读快照，并发请求都读到充足余额后各自进入事务，
    // 若 UPDATE 无 AND gold >= $1 守卫，串行执行会使金币变负。RETURNING 返回 0 行表示余额已不足
    if (item.price_type === 'gold') {
      const deductResult = await client.query(
        `UPDATE users SET gold = gold - $1 WHERE id = $2 AND gold >= $1 RETURNING gold`,
        [item.price, userId]
      );
      if (deductResult.rows.length === 0) {
        throw new AppError(ErrorCode.BAD_REQUEST, '金币不足');
      }
    } else {
      const deductResult = await client.query(
        `UPDATE users SET gems = gems - $1 WHERE id = $2 AND gems >= $1 RETURNING gems`,
        [item.price, userId]
      );
      if (deductResult.rows.length === 0) {
        throw new AppError(ErrorCode.BAD_REQUEST, '钻石不足');
      }
    }

    // 添加到背包
    await client.query(
      `INSERT INTO user_inventory (user_id, item_type, item_id, quantity)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (user_id, item_type, item_id)
       DO UPDATE SET quantity = user_inventory.quantity + 1`,
      [userId, item.type, item.id]
    );

    await client.query('COMMIT');
    return { success: true, item };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (rbErr) {
      logger.error('ROLLBACK 失败', { error: (rbErr as Error).message });
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 获取用户背包
 */
export async function getUserInventory(userId: string): Promise<InventoryItem[]> {
  // shop_items/achievements/pets/weapons 表均无 emoji 列，原 COALESCE 引用会报 column does not exist
  // 改为字面量占位 emoji，保持返回结构与前端兼容（前端 shop.tsx 第 261 行依赖 item.emoji）
  const result = await pool.query(
    `SELECT ui.id, ui.item_type, ui.item_id, ui.quantity,
            COALESCE(si.name, ai.name, pi.name, wi.name) as name,
            '🛒' as emoji
     FROM user_inventory ui
     LEFT JOIN shop_items si ON si.type = ui.item_type AND si.id = ui.item_id
     LEFT JOIN achievements ai ON ai.type = ui.item_type AND ai.id = ui.item_id
     LEFT JOIN pets pi ON pi.id = ui.item_id
     LEFT JOIN weapons wi ON wi.id = ui.item_id
     WHERE ui.user_id = $1 AND ui.quantity > 0
     ORDER BY ui.item_type, ui.id`,
    [userId]
  );

  // LEFT JOIN 聚合多表 name 字段，断言对接 InventoryItem 接口契约
  return result.rows as InventoryItem[];
}