import { Router, Request, Response } from 'express';
import { getShopItems, buyItem, getUserInventory } from '../services/shop-service.js';
import { success, fail } from '../utils/response.js';
import { withIdempotency } from '../utils/idempotency.js';
import { getErrorMessage } from '../utils/error.js';
import { routeError } from '../utils/route-error.js';
import { requireUser } from '../utils/auth-guard.js';

const router = Router();

// GET /api/shop/items - 获取商品列表
router.get('/items', async (req: Request, res: Response) => {
  const user = req.user;
  if (!requireUser(res, user)) return;

  const { type } = req.query;

  try {
    const items = await getShopItems(type as string | undefined);
    success(res, { items });
  } catch (err) {
    // GET 路由异常透传 AppError 错误码，普通 Error 兜底 500，与 leaderboard 路由同模式
    routeError(res, err, '获取商品列表失败');
  }
});

// POST /api/shop/buy - 购买商品
router.post('/buy', async (req: Request, res: Response) => {
  const user = req.user;
  if (!requireUser(res, user)) return;

  const { itemId } = req.body as { itemId?: number };
  if (!itemId) {
    fail(res, 400, '缺少商品ID');
    return;
  }

  // 幂等控制：5秒窗口防重复提交，避免高频调用重复扣款
  // key 含 itemId 避免不同商品互相拦截
  // 命中拦截（CONFLICT）返回 409；Redis 异常按降级规则放行不阻塞核心业务
  if (!(await withIdempotency(res, `shop:buy:${user.userId}:${itemId}`))) {
    return;
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
  if (!requireUser(res, user)) return;

  try {
    const inventory = await getUserInventory(user.userId);
    success(res, { inventory });
  } catch (err) {
    // GET 路由异常透传 AppError 错误码，普通 Error 兜底 500，与 leaderboard 路由同模式
    routeError(res, err, '获取背包失败');
  }
});

export default router;