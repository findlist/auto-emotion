import { Router, Request, Response } from 'express';
import { listWeapons, upgradeWeapon, equipWeapon, buyWeapon } from '../services/weapon-service.js';
import { success, fail } from '../utils/response.js';
import { routeError, routeBusinessError } from '../utils/route-error.js';
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

// 文件内私有 helper：注册 weapons 单参数 POST 路由（upgrade/equip/buy）
// 设计原因：三个路由结构完全同构，仅 service 函数引用与错误文案不同；
// 抽取后消除"鉴权 → weaponId 校验 → 调 service → success/routeBusinessError"的重复样板
// 不导出：仅本文件内使用，list 路由因 GET 方法 + 无参数校验不在抽取范围
function registerWeaponPostRoute(
  path: string,
  serviceFn: (userId: string, weaponId: number) => Promise<unknown>,
  errorMsg: string
): void {
  router.post(path, async (req: Request, res: Response) => {
    const user = req.user;
    if (!requireUser(res, user)) return;

    const { weaponId } = req.body as { weaponId?: number };
    if (!weaponId) {
      fail(res, 400, '缺少 weaponId');
      return;
    }

    try {
      const result = await serviceFn(user.userId, weaponId);
      success(res, result);
    } catch (err) {
      // POST 路由业务异常统一降级 400（不透传 AppError.code，保持 POST 异常契约稳定）
      routeBusinessError(res, err, errorMsg);
    }
  });
}

// POST /api/weapons/upgrade - 升级武器
// POST /api/weapons/equip - 装备武器
// POST /api/weapons/buy - 购买武器
registerWeaponPostRoute('/upgrade', upgradeWeapon, '升级武器失败');
registerWeaponPostRoute('/equip', equipWeapon, '装备武器失败');
registerWeaponPostRoute('/buy', buyWeapon, '购买武器失败');

export default router;