import { Router, Request, Response } from 'express';
import { listSkills, unlockSkill, upgradeSkill, activateSkill } from '../services/skill-service.js';
import { success, fail } from '../utils/response.js';
import { routeError, routeBusinessError } from '../utils/route-error.js';
import { requireUser } from '../utils/auth-guard.js';

const router = Router();

/**
 * skillId 缺失校验文案——registerSkillPostRoute helper 内（unlock/upgrade）+ activate
 * 路由独立分支共 2 处共用。helper 抽取了 unlock/upgrade 但 activate 因 active 可选参数
 * 未纳入 helper，导致校验文案被复制；抽取为常量确保两处永远同步，延续 user-service
 * 错误文案常量抽取模式（USER_NOT_FOUND_MSG 同模式）。
 */
const MISSING_SKILL_ID_MSG = '缺少 skillId';

router.get('/list', async (req: Request, res: Response) => {
  const user = req.user;
  if (!requireUser(res, user)) return;

  try {
    const skills = await listSkills(user.userId);
    success(res, { skills });
  } catch (err) {
    // GET 路由异常透传 AppError 错误码，普通 Error 兜底 500，与 leaderboard 路由同模式
    routeError(res, err, '获取技能列表失败');
  }
});

// 文件内私有 helper：注册 skills 单参数 POST 路由（unlock/upgrade）
// 设计原因：两个路由结构完全同构，仅 service 函数引用与错误文案不同；
// 抽取后消除"鉴权 → skillId 校验 → 调 service → success/routeBusinessError"的重复样板
// 不导出：仅本文件内使用，activate 路由含 active 可选参数不在抽取范围
function registerSkillPostRoute(
  path: string,
  serviceFn: (userId: string, skillId: number) => Promise<unknown>,
  errorMsg: string
): void {
  router.post(path, async (req: Request, res: Response) => {
    const user = req.user;
    if (!requireUser(res, user)) return;

    const { skillId } = req.body as { skillId?: number };
    if (!skillId) {
      fail(res, 400, MISSING_SKILL_ID_MSG);
      return;
    }

    try {
      const result = await serviceFn(user.userId, skillId);
      success(res, result);
    } catch (err) {
      // POST 路由业务异常统一降级 400（不透传 AppError.code，保持 POST 异常契约稳定）
      routeBusinessError(res, err, errorMsg);
    }
  });
}

// POST /api/skills/unlock - 解锁技能
// POST /api/skills/upgrade - 升级技能
registerSkillPostRoute('/unlock', unlockSkill, '解锁技能失败');
registerSkillPostRoute('/upgrade', upgradeSkill, '升级技能失败');

router.post('/activate', async (req: Request, res: Response) => {
  const user = req.user;
  if (!requireUser(res, user)) return;

  const { skillId, active } = req.body as { skillId?: number; active?: boolean };
  if (!skillId) {
    fail(res, 400, MISSING_SKILL_ID_MSG);
    return;
  }

  try {
    const result = await activateSkill(user.userId, skillId, active ?? true);
    success(res, result);
  } catch (err) {
    // POST 路由业务异常统一降级 400（不透传 AppError.code，保持 POST 异常契约稳定）
    routeBusinessError(res, err, '操作技能失败');
  }
});

export default router;