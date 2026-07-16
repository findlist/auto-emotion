import { Router, Request, Response } from 'express';
import { listPets, equipPet, buyPet } from '../services/pet-service.js';
import { success, fail } from '../utils/response.js';
import { withIdempotency } from '../utils/idempotency.js';
import { getErrorMessage } from '../utils/error.js';

const router = Router();

router.get('/list', async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    fail(res, 401, '未授权');
    return;
  }

  try {
    const pets = await listPets(user.userId);
    success(res, { pets });
  } catch (err) {
    const msg = getErrorMessage(err, '获取宠物列表失败');
    fail(res, 500, msg);
  }
});

router.post('/equip', async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    fail(res, 401, '未授权');
    return;
  }

  const { petId } = req.body as { petId?: number };
  if (!petId) {
    fail(res, 400, '缺少 petId');
    return;
  }

  try {
    const result = await equipPet(user.userId, petId);
    success(res, result);
  } catch (err) {
    const msg = getErrorMessage(err, '装备宠物失败');
    fail(res, 400, msg);
  }
});

router.post('/buy', async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    fail(res, 401, '未授权');
    return;
  }

  const { petId } = req.body as { petId?: number };
  if (!petId) {
    fail(res, 400, '缺少 petId');
    return;
  }

  // 幂等控制：5秒窗口防重复提交，避免高频调用重复扣款（与 shop/buy 一致）
  // 命中拦截（CONFLICT）返回 409；Redis 异常按降级规则放行不阻塞核心业务
  if (!(await withIdempotency(res, `pets:buy:${user.userId}:${petId}`))) {
    return;
  }

  try {
    const result = await buyPet(user.userId, petId);
    success(res, result);
  } catch (err) {
    const msg = getErrorMessage(err, '购买宠物失败');
    fail(res, 400, msg);
  }
});

export default router;