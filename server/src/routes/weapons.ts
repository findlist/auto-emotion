import { Router, Request, Response } from 'express';
import { listWeapons, upgradeWeapon, equipWeapon, buyWeapon } from '../services/weapon-service.js';
import { success, fail } from '../utils/response.js';

const router = Router();

router.get('/list', async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    fail(res, 401, '未授权');
    return;
  }

  try {
    const weapons = await listWeapons(user.userId);
    success(res, { weapons });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '获取武器列表失败';
    fail(res, 500, msg);
  }
});

router.post('/upgrade', async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    fail(res, 401, '未授权');
    return;
  }

  const { weaponId } = req.body as { weaponId?: number };
  if (!weaponId) {
    fail(res, 400, '缺少 weaponId');
    return;
  }

  try {
    const result = await upgradeWeapon(user.userId, weaponId);
    success(res, result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '升级武器失败';
    fail(res, 400, msg);
  }
});

router.post('/equip', async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    fail(res, 401, '未授权');
    return;
  }

  const { weaponId } = req.body as { weaponId?: number };
  if (!weaponId) {
    fail(res, 400, '缺少 weaponId');
    return;
  }

  try {
    const result = await equipWeapon(user.userId, weaponId);
    success(res, result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '装备武器失败';
    fail(res, 400, msg);
  }
});

router.post('/buy', async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    fail(res, 401, '未授权');
    return;
  }

  const { weaponId } = req.body as { weaponId?: number };
  if (!weaponId) {
    fail(res, 400, '缺少 weaponId');
    return;
  }

  try {
    const result = await buyWeapon(user.userId, weaponId);
    success(res, result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '购买武器失败';
    fail(res, 400, msg);
  }
});

export default router;