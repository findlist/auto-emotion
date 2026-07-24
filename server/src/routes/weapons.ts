import { Router, Request, Response } from 'express';
import { listWeapons, upgradeWeapon, equipWeapon, buyWeapon } from '../services/weapon-service.js';
import { success, fail } from '../utils/response.js';
import { routeError, routeBusinessError } from '../utils/route-error.js';
import { requireUser } from '../utils/auth-guard.js';
import { withIdempotency } from '../utils/idempotency.js';

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
// idempotencyKey：付费/升级类接口按规范 7.1 启用 5 秒幂等去重，equip 无金币消耗不传
function registerWeaponPostRoute(
  path: string,
  serviceFn: (userId: string, weaponId: number) => Promise<unknown>,
  errorMsg: string,
  idempotencyKey?: string
): void {
  router.post(path, async (req: Request, res: Response) => {
    const user = req.user;
    if (!requireUser(res, user)) return;

    const { weaponId } = req.body as { weaponId?: number };
    if (!weaponId) {
      fail(res, 400, '缺少 weaponId');
      return;
    }

    // 幂等控制（可选）：付费/升级接口按规范 7.1 防 5 秒内重复提交，Redis 异常自动降级放行
    if (idempotencyKey && !(await withIdempotency(res, `${idempotencyKey}:${user.userId}`))) {
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

// POST /api/weapons/upgrade - 升级武器（消耗金币，启用幂等）
// POST /api/weapons/equip - 装备武器（无金币消耗，不启用幂等）
// POST /api/weapons/buy - 购买武器（消耗金币，启用幂等）
registerWeaponPostRoute('/upgrade', upgradeWeapon, '升级武器失败', 'weapon:upgrade');
registerWeaponPostRoute('/equip', equipWeapon, '装备武器失败');
registerWeaponPostRoute('/buy', buyWeapon, '购买武器失败', 'weapon:buy');

export default router;