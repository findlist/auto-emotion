import { Router, Request, Response } from 'express';
import { listPets, equipPet, buyPet } from '../services/pet-service.js';
import { success, fail } from '../utils/response.js';
import { checkIdempotency } from '../utils/idempotency.js';
import { AppError } from '../utils/error.js';

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
    const msg = err instanceof Error ? err.message : '获取宠物列表失败';
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
    const msg = err instanceof Error ? err.message : '装备宠物失败';
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
  try {
    await checkIdempotency(`pets:buy:${user.userId}:${petId}`);
  } catch (err) {
    if (err instanceof AppError) {
      fail(res, err.code, err.message);
      return;
    }
    // 非 AppError 表示 Redis 连接异常，按降级规则放行不阻塞核心业务
  }

  try {
    const result = await buyPet(user.userId, petId);
    success(res, result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '购买宠物失败';
    fail(res, 400, msg);
  }
});

export default router;