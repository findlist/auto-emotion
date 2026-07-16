import { Router, Request, Response } from 'express';
import { getShopItems, buyItem, getUserInventory } from '../services/shop-service.js';
import { success, fail } from '../utils/response.js';
import { checkIdempotency } from '../utils/idempotency.js';
import { AppError, getErrorMessage } from '../utils/error.js';

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
    const msg = getErrorMessage(err, '获取商品列表失败');
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

  // 幂等控制：5秒窗口防重复提交，避免高频调用重复扣款
  // key 含 itemId 避免不同商品互相拦截
  try {
    await checkIdempotency(`shop:buy:${user.userId}:${itemId}`);
  } catch (err) {
    // AppError(CONFLICT) 表示命中幂等拦截（重复请求），返回 409 拒绝
    if (err instanceof AppError) {
      fail(res, err.code, err.message);
      return;
    }
    // 非 AppError 表示 Redis 连接异常，按降级规则放行不阻塞核心业务
  }

  try {
    const result = await buyItem(user.userId, itemId);
    success(res, result);
  } catch (err) {
    const msg = getErrorMessage(err, '购买失败');
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
    const msg = getErrorMessage(err, '获取背包失败');
    fail(res, 500, msg);
  }
});

export default router;