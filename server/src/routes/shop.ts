import { Router, Request, Response } from 'express';
import { getShopItems, buyItem, getUserInventory } from '../services/shop-service.js';
import { success, fail } from '../utils/response.js';

const router = Router();

// GET /api/shop/items - 获取商品列表
router.get('/items', async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    fail(res, 401, '未授权');
    return;
  }

  const { type } = req.query;

  try {
    const items = await getShopItems(type as string | undefined);
    success(res, { items });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '获取商品列表失败';
    fail(res, 500, msg);
  }
});

// POST /api/shop/buy - 购买商品
router.post('/buy', async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    fail(res, 401, '未授权');
    return;
  }

  const { itemId } = req.body as { itemId?: number };
  if (!itemId) {
    fail(res, 400, '缺少商品ID');
    return;
  }

  try {
    const result = await buyItem(user.userId, itemId);
    success(res, result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '购买失败';
    fail(res, 400, msg);
  }
});

// GET /api/shop/inventory - 获取用户背包
router.get('/inventory', async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    fail(res, 401, '未授权');
    return;
  }

  try {
    const inventory = await getUserInventory(user.userId);
    success(res, { inventory });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '获取背包失败';
    fail(res, 500, msg);
  }
});

export default router;