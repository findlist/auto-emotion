import { Router, Request, Response } from 'express';
import { listWeapons, upgradeWeapon, equipWeapon, buyWeapon } from '../services/weapon-service.js';
import { success, fail } from '../utils/response.js';
import { getErrorMessage } from '../utils/error.js';
import { routeError } from '../utils/route-error.js';
import { requireUser } from '../utils/auth-guard.js';

const router = Router();

router.get('/list', async (req: Request, res: Response) => {
  const user = req.user;
  if (!requireUser(res, user)) return;

  try {
    const weapons = await listWeapons(user.userId);
    success(res, { weapons });
  } catch (err) {
    // GET 路由异常透传 AppError 错误码，普通 Error 兜底 500，与 leaderboard 路由同模式
    routeError(res, err, '获取武器列表失败');
  }
});

router.post('/upgrade', async (req: Request, res: Response) => {
  const user = req.user;
  if (!requireUser(res, user)) return;

  const { weaponId } = req.body as { weaponId?: number };
  if (!weaponId) {
    fail(res, 400, '缺少 weaponId');
    return;
  }

  try {
    const result = await upgradeWeapon(user.userId, weaponId);
    success(res, result);
  } catch (err) {
    const msg = getErrorMessage(err, '升级武器失败');
    fail(res, 400, msg);
  }
});

router.post('/equip', async (req: Request, res: Response) => {
  const user = req.user;
  if (!requireUser(res, user)) return;

  const { weaponId } = req.body as { weaponId?: number };
  if (!weaponId) {
    fail(res, 400, '缺少 weaponId');
    return;
  }

  try {
    const result = await equipWeapon(user.userId, weaponId);
    success(res, result);
  } catch (err) {
    const msg = getErrorMessage(err, '装备武器失败');
    fail(res, 400, msg);
  }
});

router.post('/buy', async (req: Request, res: Response) => {
  const user = req.user;
  if (!requireUser(res, user)) return;

  const { weaponId } = req.body as { weaponId?: number };
  if (!weaponId) {
    fail(res, 400, '缺少 weaponId');
    return;
  }

  try {
    const result = await buyWeapon(user.userId, weaponId);
    success(res, result);
  } catch (err) {
    const msg = getErrorMessage(err, '购买武器失败');
    fail(res, 400, msg);
  }
});

export default router;