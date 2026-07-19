import { Router, Request, Response } from 'express';
import { listPets, equipPet, buyPet } from '../services/pet-service.js';
import { success, fail } from '../utils/response.js';
import { withIdempotency } from '../utils/idempotency.js';
import { routeError, routeBusinessError } from '../utils/route-error.js';
import { requireUser } from '../utils/auth-guard.js';

const router = Router();

router.get('/list', async (req: Request, res: Response) => {
  const user = req.user;
  if (!requireUser(res, user)) return;

  try {
    const pets = await listPets(user.userId);
    success(res, { pets });
  } catch (err) {
    // GET 路由异常透传 AppError 错误码，普通 Error 兜底 500，与 leaderboard 路由同模式
    routeError(res, err, '获取宠物列表失败');
  }
});

// 文件内私有 helper：注册 pets 单参数 POST 路由（equip/buy）
// 设计原因：两个路由结构同构，仅 service 函数引用、错误文案、是否启用幂等不同；
// 抽取后消除"鉴权 → petId 校验 → [可选幂等] → 调 service → success/routeBusinessError"的重复样板
// 不导出：仅本文件内使用，list 路由因 GET 方法 + 无参数校验不在抽取范围
// 幂等设计：buy 路由扣款需防重复提交（与 shop/buy、weapons/buy 一致），equip 路由是状态切换无需幂等
function registerPetPostRoute(
  path: string,
  serviceFn: (userId: string, petId: number) => Promise<unknown>,
  errorMsg: string,
  idempotencyKey?: string
): void {
  router.post(path, async (req: Request, res: Response) => {
    const user = req.user;
    if (!requireUser(res, user)) return;

    const { petId } = req.body as { petId?: number };
    if (!petId) {
      fail(res, 400, '缺少 petId');
      return;
    }

    // 幂等控制（可选）：5秒窗口防重复提交，避免高频调用重复扣款
    // 命中拦截（CONFLICT）返回 409；Redis 异常按降级规则放行不阻塞核心业务
    if (idempotencyKey) {
      if (!(await withIdempotency(res, `${idempotencyKey}:${user.userId}:${petId}`))) {
        return;
      }
    }

    try {
      const result = await serviceFn(user.userId, petId);
      success(res, result);
    } catch (err) {
      // POST 路由业务异常统一降级 400（不透传 AppError.code，保持 POST 异常契约稳定）
      routeBusinessError(res, err, errorMsg);
    }
  });
}

// POST /api/pets/equip - 装备宠物（状态切换，无需幂等）
registerPetPostRoute('/equip', equipPet, '装备宠物失败');

// POST /api/pets/buy - 购买宠物（扣款需防重复提交，幂等 key 与 shop/weapons buy 路由同模式）
registerPetPostRoute('/buy', buyPet, '购买宠物失败', 'pets:buy');

export default router;
