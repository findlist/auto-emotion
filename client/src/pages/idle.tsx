// client/src/pages/idle.tsx
// 挂机空间页面
// - 区域切换（5个按钮）
// - 离线收益领取按钮（显示可领取数量）
// - 战力展示（等级/攻击/防御/血量）
// - 武器/技能/宠物切换入口

import { useCallback, useEffect, useState } from 'react';
import { useUserStore } from '@/stores/user-store';
import { idleApi, type CharacterStatus, type IdleArea, type OfflineResult } from '@/api/idle';
import { weaponApi, type Weapon } from '@/api/weapons';
import { skillApi, type Skill } from '@/api/skills';
import { petApi, type Pet } from '@/api/pets';
import { showToast } from '@/utils/toast';
import { showApiError } from '@/utils/api-error';
import { showConfirm } from '@/utils/confirm';
import { logger } from '@/utils/logger';
import { handleTabKeyDown } from '@/utils/a11y';

interface IdlePageProps {
  onBack: () => void;
}

/** 升级属性配置 */
const UPGRADE_FIELDS = [
  { key: 'hp', label: '生命', icon: '❤️', unit: '' },
  { key: 'attack', label: '攻击', icon: '⚔️', unit: '' },
  { key: 'defense', label: '防御', icon: '🛡️', unit: '' },
  { key: 'crit_rate', label: '暴击率', icon: '💥', unit: '%' },
  { key: 'crit_damage', label: '暴击伤害', icon: '🔥', unit: '%' },
  { key: 'efficiency', label: '挂机效率', icon: '⏰', unit: '%' },
] as const;

type UpgradeField = (typeof UPGRADE_FIELDS)[number]['key'];

/* 挂机功能 tab 配置：与 UPGRADE_FIELDS 同源，"配置数组 + 派生类型"模式
   设计原因：原 useState 类型字面量、onKeyDown 键盘导航数组、map 内联 tab 配置三处重复
   key 字面量，新增/删除 tab 时易漏改。抽取后单点维护，与 leaderboard.tsx TAB_CONFIG 风格对齐 */
const IDLE_TABS = [
  { key: 'main', label: '升级' },
  { key: 'weapons', label: '武器' },
  { key: 'skills', label: '技能' },
  { key: 'pets', label: '宠物' },
] as const;

type IdleTab = (typeof IDLE_TABS)[number]['key'];

function IdlePage({ onBack }: IdlePageProps) {
  const user = useUserStore((s) => s.user);
  // User.id 已是 string 类型，无需 toString() 绕路转换
  const userId = user?.id;

  const [status, setStatus] = useState<CharacterStatus | null>(null);
  const [areas, setAreas] = useState<IdleArea[]>([]);
  const [offlineResult, setOfflineResult] = useState<OfflineResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<IdleTab>('main');
  const [weapons, setWeapons] = useState<Weapon[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);

  // 加载挂机核心数据：useCallback 保证引用稳定，依赖 userId 变化时重建
  // 设计原因：原函数声明在 useEffect 内引用触发 react-hooks/exhaustive-deps 警告，
  // useCallback 让函数引用显式纳入依赖数组，符合 React 19 严格模式要求
  const loadData = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);
      const [statusData, areasData, offlineData, weaponsData, skillsData, petsData] = await Promise.all([
        idleApi.getStatus().catch(() => null),
        idleApi.listAreas().catch(() => []),
        idleApi.claim().catch(() => null),
        weaponApi.list().catch(() => []),
        skillApi.list().catch(() => []),
        petApi.list().catch(() => []),
      ]);
      setStatus(statusData);
      setAreas(areasData);
      setOfflineResult(offlineData);
      setWeapons(weaponsData);
      setSkills(skillsData);
      setPets(petsData);
    } catch (err) {
      logger.error('加载挂机数据失败', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loadData 为 useCallback 共享给 7 个升级处理器（handleUpgradeWeapon 等），内联 IIFE 会重复 6 个并行 API 调用；userId 变化罕发（仅登录切换），级联渲染影响可忽略
    void loadData();
  }, [userId, loadData]);

  // 通用列表加载 helper：消除 loadWeapons/loadSkills/loadPets 三处 try/catch/logger.error 样板
  // 设计原因：三处函数体逐字同构，仅 API 方法、setter、错误日志标签不同；
  // 泛型 T 让 helper 适配 Weapon[]/Skill[]/Pet[] 等不同列表类型，参数化 errMsg 保持日志文案不变
  async function loadList<T>(
    apiCall: () => Promise<T[]>,
    setter: (data: T[]) => void,
    errMsg: string,
  ): Promise<void> {
    try {
      const data = await apiCall();
      setter(data);
    } catch (err) {
      logger.error(errMsg, err);
    }
  }

  // 加载武器数据
  const loadWeapons = () => loadList(weaponApi.list, setWeapons, '加载武器失败');

  // 升级武器
  async function handleUpgradeWeapon(weapon: Weapon) {
    // 升级消耗金币，需二次确认
    const cost = 50 * (weapon.level ?? 0) * (weapon.level ?? 0);
    const ok = await showConfirm({
      type: 'warning',
      title: '升级武器',
      message: `确认花费 ${cost} 金币升级「${weapon.name}」？`,
      confirmText: '升级',
    });
    if (!ok) return;

    try {
      setLoading(true);
      await weaponApi.upgrade(weapon.id);
      showToast('success', '武器升级成功');
      await loadWeapons();
      await loadData();
    } catch (err) {
      showApiError(err, '升级武器失败');
    } finally {
      setLoading(false);
    }
  }

  // 装备武器
  async function handleEquipWeapon(weaponId: number) {
    try {
      setLoading(true);
      await weaponApi.equip(weaponId);
      showToast('success', '装备成功');
      await loadWeapons();
    } catch (err) {
      showApiError(err, '装备武器失败');
    } finally {
      setLoading(false);
    }
  }

  // 购买武器
  async function handleBuyWeapon(weapon: Weapon) {
    const ok = await showConfirm({
      type: 'warning',
      title: '购买武器',
      message: `确认花费 ${weapon.unlock_cost_gold} 金币购买「${weapon.name}」？`,
      confirmText: '购买',
    });
    if (!ok) return;

    try {
      setLoading(true);
      await weaponApi.buy(weapon.id);
      showToast('success', '购买成功');
      await loadWeapons();
      await loadData();
    } catch (err) {
      showApiError(err, '购买武器失败');
    } finally {
      setLoading(false);
    }
  }

  // 加载技能数据
  const loadSkills = () => loadList(skillApi.list, setSkills, '加载技能失败');

  // 解锁技能
  async function handleUnlockSkill(skill: Skill) {
    const ok = await showConfirm({
      type: 'warning',
      title: '解锁技能',
      message: `确认解锁「${skill.name}」？`,
      confirmText: '解锁',
    });
    if (!ok) return;

    try {
      setLoading(true);
      await skillApi.unlock(skill.id);
      showToast('success', '技能解锁成功');
      await loadSkills();
    } catch (err) {
      showApiError(err, '解锁技能失败');
    } finally {
      setLoading(false);
    }
  }

  // 升级技能
  async function handleUpgradeSkill(skill: Skill) {
    const cost = 100 * (skill.level ?? 0);
    const ok = await showConfirm({
      type: 'warning',
      title: '升级技能',
      message: `确认花费 ${cost} 金币升级「${skill.name}」？`,
      confirmText: '升级',
    });
    if (!ok) return;

    try {
      setLoading(true);
      await skillApi.upgrade(skill.id);
      showToast('success', '技能升级成功');
      await loadSkills();
      await loadData();
    } catch (err) {
      showApiError(err, '升级技能失败');
    } finally {
      setLoading(false);
    }
  }

  // 激活/停用技能：补二次确认，避免误触停用导致挂机效率下降，与升级操作保持一致体验
  async function handleActivateSkill(skill: Skill, active: boolean) {
    const ok = await showConfirm({
      type: 'warning',
      title: active ? '激活技能' : '停用技能',
      message: `确认${active ? '激活' : '停用'}「${skill.name}」？`,
      confirmText: active ? '激活' : '停用',
    });
    if (!ok) return;

    try {
      setLoading(true);
      await skillApi.activate(skill.id, active);
      showToast('success', active ? '技能已激活' : '技能已停用');
      await loadSkills();
    } catch (err) {
      showApiError(err, '操作技能失败');
    } finally {
      setLoading(false);
    }
  }

  // 加载宠物数据
  const loadPets = () => loadList(petApi.list, setPets, '加载宠物失败');

  // 装备宠物：补二次确认，装备会替换当前宠物配置，避免误触改变战力
  async function handleEquipPet(pet: Pet) {
    const ok = await showConfirm({
      type: 'warning',
      title: '装备宠物',
      message: `确认装备「${pet.name}」？将替换当前出战宠物`,
      confirmText: '装备',
    });
    if (!ok) return;

    try {
      setLoading(true);
      await petApi.equip(pet.id);
      showToast('success', '装备成功');
      await loadPets();
    } catch (err) {
      showApiError(err, '装备宠物失败');
    } finally {
      setLoading(false);
    }
  }

  // 购买宠物
  async function handleBuyPet(pet: Pet) {
    const ok = await showConfirm({
      type: 'warning',
      title: '购买宠物',
      message: `确认花费 ${pet.unlock_cost_gold} 金币购买「${pet.name}」？`,
      confirmText: '购买',
    });
    if (!ok) return;

    try {
      setLoading(true);
      await petApi.buy(pet.id);
      showToast('success', '购买成功');
      await loadPets();
      await loadData();
    } catch (err) {
      // 统一走 showApiError：按 HTTP 状态码差异化选 Toast 类型（403 金币不足→warning、404 宠物不存在→info）
      showApiError(err, '购买宠物失败');
    } finally {
      setLoading(false);
    }
  }

  // 领取离线收益
  async function handleClaim() {
    if (!userId) return;
    try {
      setLoading(true);
      const result = await idleApi.claim();
      setOfflineResult(null); // 领取后清零
      await loadData();
      showToast('success', `领取成功！经验 +${result.exp}，金币 +${result.gold}`);
    } catch (err) {
      // 统一走 showApiError：领取离线收益失败时按 HTTP 语义提示（404 角色不存在→info、5xx→error）
      showApiError(err, '领取失败');
    } finally {
      setLoading(false);
    }
  }

  // 切换区域
  async function handleSwitchArea(areaId: number) {
    if (!userId) return;
    try {
      setLoading(true);
      await idleApi.switchArea(areaId);
      showToast('success', '区域已切换');
      await loadData();
    } catch (err) {
      showApiError(err, '切换区域失败');
    } finally {
      setLoading(false);
    }
  }

  // 升级属性
  async function handleUpgrade(field: UpgradeField) {
    if (!userId) return;
    // 属性升级消耗金币，需二次确认
    // 费用公式与后端 idle-engine.upgradeCharacter 保持一致：50 * 角色等级^2
    const fieldInfo = UPGRADE_FIELDS.find((f) => f.key === field);
    const upgradeCost = 50 * (status?.level ?? 1) * (status?.level ?? 1);
    const ok = await showConfirm({
      type: 'warning',
      title: '升级属性',
      message: `确认花费 ${upgradeCost} 金币升级「${fieldInfo?.label ?? field}」？`,
      confirmText: '升级',
    });
    if (!ok) return;

    try {
      setLoading(true);
      await idleApi.upgrade(field);
      showToast('success', '升级成功');
      await loadData();
    } catch (err) {
      showApiError(err, '升级失败');
    } finally {
      setLoading(false);
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-ink font-mono">请先登录</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-cream max-w-2xl mx-auto scrollbar-brutal">
      {/* 顶部导航 */}
      <header className="bg-ink text-cream px-4 py-3 flex items-center gap-4 bg-glow-pink">
        {/* 设计原因:aria-label 覆盖按钮内"← 返回"文本,避免屏幕阅读器朗读"左箭头 返回" */}
        <button
          onClick={onBack}
          aria-label="返回"
          className="bg-pink text-cream px-3 py-1 font-mono text-sm hover:bg-cream hover:text-ink transition-all shadow-[2px_2px_0_#1a1a1a] hover:shadow-[1px_1px_0_#1a1a1a] hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          ← 返回
        </button>
        <h1 className="font-cn text-xl flex-1 text-center drop-shadow-[2px_2px_0_rgba(255,61,127,0.4)]">挂机空间</h1>
        <div className="flex items-center gap-2 bg-ink/40 px-3 py-1.5 rounded-full ring-1 ring-cream/15">
          {/* 装饰性 emoji,aria-hidden 避免屏幕阅读器冗余朗读"硬币" */}
          <span className="text-yellow" aria-hidden="true">💰</span>
          <span className="font-mono text-sm">{status?.gold ?? 0}</span>
        </div>
      </header>

      {/* 离线收益领取：加 slideDown 动画吸引注意 */}
      {offlineResult && offlineResult.exp > 0 && (
        <div className="bg-yellow text-ink px-4 py-3 flex items-center justify-between animate-slideDown border-b-2 border-ink">
          <div className="font-mono text-sm">
            <p>离线 {offlineResult.cappedHours} 小时</p>
            <p>
              {/* 装饰性 emoji aria-hidden,避免与后跟文字"EXP/金币"语义重复 */}
              收益: <span aria-hidden="true">✨</span>{offlineResult.exp} EXP / <span aria-hidden="true">💰</span>{offlineResult.gold} 金币
            </p>
          </div>
          <button
            onClick={handleClaim}
            disabled={loading}
            className="bg-ink text-cream px-4 py-2 font-mono text-sm font-bold hover:bg-pink transition-all shadow-[2px_2px_0_#1a1a1a] hover:shadow-[1px_1px_0_#1a1a1a] hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50 disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[2px_2px_0_#1a1a1a]"
          >
            领取
          </button>
        </div>
      )}

      {/* 战力展示：交错入场 */}
      <div className="bg-ink text-cream px-4 py-3 animate-stagger">
        <div className="flex items-center gap-4 mb-2">
          <div className="w-12 h-12 rounded-full bg-pink flex items-center justify-center font-bold text-lg ring-3 ring-cream/20">
            {user.nickname?.[0] ?? '游'}
          </div>
          <div>
            <p className="font-cn text-lg">{user.nickname}</p>
            <p className="font-mono text-xs text-cream/60">
              Lv.{status?.level ?? 1} · {status?.exp ?? 0} EXP
            </p>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 font-mono text-xs">
          {/* 属性框：bg-cream/10 浅色底在深色父级上形成可见层次（原 bg-ink/80 与父级同色不可辨） */}
          <div className="bg-cream/10 px-2.5 py-1.5 rounded border border-cream/20">
            <span className="text-cream/60">攻击</span>
            <span className="ml-1 text-orange font-bold">{status?.attack ?? 0}</span>
          </div>
          <div className="bg-cream/10 px-2.5 py-1.5 rounded border border-cream/20">
            <span className="text-cream/60">防御</span>
            <span className="ml-1 text-mint font-bold">{status?.defense ?? 0}</span>
          </div>
          <div className="bg-cream/10 px-2.5 py-1.5 rounded border border-cream/20">
            <span className="text-cream/60">生命</span>
            <span className="ml-1 text-pink font-bold">{status?.hp ?? 0}</span>
          </div>
          <div className="bg-cream/10 px-2.5 py-1.5 rounded border border-cream/20">
            <span className="text-cream/60">效率</span>
            <span className="ml-1 text-yellow font-bold">{((status?.efficiency ?? 1) * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>

      {/* 区域切换：交错入场，区域按钮加按下效果 */}
      <div className="px-4 py-3 animate-stagger delay-100">
        <p className="font-cn text-sm text-ink/70 mb-2">选择挂机区域</p>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-brutal">
          {areas.map((area) => {
            const isActive = status?.area_id === area.id;
            const isLocked = (status?.level ?? 1) < area.required_level;
            return (
              <button
                key={area.id}
                onClick={() => !isLocked && handleSwitchArea(area.id)}
                disabled={isLocked || loading}
                className={`flex-shrink-0 px-4 py-3 rounded-lg font-mono text-sm transition-all ${
                  isActive
                    ? 'bg-pink text-cream shadow-[3px_3px_0_#1a1a1a] -translate-y-[1px]'
                    : isLocked
                      // 锁定态改用 ink/10 + 虚线边框保持 Neo-brutalism 调色板一致性（原 gray-300 脱离设计系统）
                      ? 'bg-ink/5 text-ink/40 border-2 border-dashed border-ink/30 cursor-not-allowed'
                      : 'bg-cream border-2 border-ink text-ink hover:bg-yellow hover:border-ink shadow-[3px_3px_0_#1a1a1a] hover:shadow-[1px_1px_0_#1a1a1a] hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none'
                }`}
                style={{ backgroundColor: isActive ? area.bg_color : undefined }}
              >
                <p className="font-cn text-center">{area.name}</p>
                <p className="text-xs opacity-70">
                  {isLocked ? `需要 Lv.${area.required_level}` : `Lv.${area.required_level}`}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* 区域信息：多色 chip 替代单行文本，与战力属性框色块设计语言一致
          设计原因：原单行 "当前区域: x · 经验率 x · 金币率 x" 文本视觉层次弱，
          玩家难以一眼定位关键信息。改为 chip 后区域用 ink 深色主标识、经验用 pink、金币用 yellow，
          三色呼应首页/挂机页既有色彩语义（pink=核心、yellow=金币），提升可扫描性 */}
      {status?.area_name && (
        <div className="px-4 py-2 mb-2 flex flex-wrap gap-2 animate-fadeIn">
          <div className="bg-ink text-cream px-3 py-1 rounded-full font-mono text-xs flex items-center gap-1 shadow-[2px_2px_0_#1a1a1a]">
            <span aria-hidden="true">📍</span>
            <span className="text-cream/70">区域</span>
            <span className="font-bold">{status.area_name}</span>
          </div>
          <div className="bg-pink/15 text-ink px-3 py-1 rounded-full font-mono text-xs flex items-center gap-1 border border-pink/30">
            <span aria-hidden="true">✨</span>
            <span className="text-ink/70">经验</span>
            <span className="text-pink font-bold">{(status.exp_rate ?? 1) * 100}%</span>
          </div>
          <div className="bg-yellow/20 text-ink px-3 py-1 rounded-full font-mono text-xs flex items-center gap-1 border border-yellow/40">
            <span aria-hidden="true">💰</span>
            <span className="text-ink/70">金币</span>
            <span className="text-yellow font-bold">{(status.gold_rate ?? 1) * 100}%</span>
          </div>
        </div>
      )}

      {/* 功能切换标签：WAI-ARIA tab 语义让屏幕阅读器正确识别为标签页界面
          设计原因：role=tablist/tab/tabpanel + aria-selected/controls/labelled
          构成完整 tab 语义。保留所有 tab 的默认 button 可聚焦性，不引入 roving
          tabindex 避免箭头键导航复杂度，是安全增量改进 */}
      <div role="tablist" aria-label="挂机功能" className="px-4 flex gap-2 border-b-2 border-ink/20"
        onKeyDown={(e) => handleTabKeyDown(e, IDLE_TABS.map((t) => t.key), activeTab, (k) => setActiveTab(k as IdleTab))}>
        {IDLE_TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            aria-controls="idle-panel"
            id={`idle-tab-${tab.key}`}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 font-mono text-sm border-b-3 transition-all ${
              activeTab === tab.key
                ? 'border-pink text-pink font-bold -mb-[2px]'
                : 'border-transparent text-ink/60 hover:text-ink hover:border-ink/30'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 主内容区：role=tabpanel 关联当前激活的 tab，屏幕阅读器切换 tab 时自动定位内容区 */}
      <main role="tabpanel" id="idle-panel" aria-labelledby={`idle-tab-${activeTab}`} className="flex-1 p-4 overflow-y-auto scrollbar-brutal">
        {activeTab === 'main' && (
          <div className="space-y-3 animate-fadeIn">
            <p className="font-cn text-sm text-ink/70">升级角色属性</p>
            {UPGRADE_FIELDS.map((field, idx) => {
              const value = status?.[field.key] ?? 0;
              const displayValue = field.key === 'efficiency' || field.key === 'crit_rate' || field.key === 'crit_damage'
                ? (Number(value) * 100).toFixed(0) + field.unit
                : value + field.unit;
              return (
                <div
                  key={field.key}
                  // 加 animate-stagger + 延迟让属性卡片依次入场，与 shop/tasks/achievements 列表入场风格统一
                  // 加 attr-bar-* 左侧色条按属性类型区分色相，6 卡片不再视觉同质化
                  className={`bg-cream border-2 border-ink px-4 py-3 flex items-center justify-between shadow-[3px_3px_0_#1a1a1a] card-hover animate-stagger attr-bar-${field.key}`}
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  <div className="flex items-center gap-3">
                    {/* 装饰性 emoji,aria-hidden 避免与后跟 label 文字语义重复(如"红心 生命") */}
                    <span className="text-2xl" aria-hidden="true">{field.icon}</span>
                    <div>
                      <p className="font-cn text-ink">{field.label}</p>
                      <p className="font-mono text-xs text-ink/60">{displayValue}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleUpgrade(field.key)}
                    disabled={loading}
                    className="bg-pink text-cream px-4 py-2 font-mono text-sm font-bold hover:bg-ink transition-all shadow-[2px_2px_0_#1a1a1a] hover:shadow-[1px_1px_0_#1a1a1a] hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50 disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[2px_2px_0_#1a1a1a]"
                  >
                    升级
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'weapons' && (
          <div className="space-y-3 animate-fadeIn">
            <p className="font-cn text-sm text-ink/70">武器库</p>
            {/* 空状态：与 shop/tasks/achievements/leaderboard 空状态模式一致
                设计原因：原 weapons 为空时仅显示标题下方留白，玩家不知是"无数据"还是"加载中"，
                补全空状态后明确传达"暂无武器"语义，引导玩家购买解锁 */}
            {weapons.length === 0 ? (
              <div className="text-center py-12 animate-stagger">
                <p className="text-5xl mb-4 inline-block animate-bounce-slow"><span aria-hidden="true">⚔️</span></p>
                <p className="font-cn text-ink/70 text-lg">暂无武器</p>
                <p className="font-mono text-xs text-ink/40 mt-1">通过购买解锁强力武器</p>
              </div>
            ) : (
              weapons.map((weapon) => {
              const isOwned = weapon.level !== undefined;
              const isEquipped = weapon.is_equipped;
              const currentLevel = weapon.level ?? 0;
              const upgradeCostGold = 50 * currentLevel * currentLevel;
              return (
                <div
                  key={weapon.id}
                  className={`bg-cream border-2 ${
                    isEquipped ? 'border-yellow' : 'border-ink'
                  } px-4 py-3 shadow-[3px_3px_0_#1a1a1a] card-hover`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    {/* emoji 加圆形背景给视觉重量，与首页/挂机页 avatar 圆形头像视觉模式一致
                        已装备态用 yellow/20 呼应卡片黄色边框，未装备用 ink/5 中性底 */}
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isEquipped ? 'bg-yellow/20' : 'bg-ink/5'
                    }`}>
                      <span className="text-2xl" aria-hidden="true">⚔️</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-cn text-ink font-bold">{weapon.name}</p>
                      <p className="font-mono text-xs text-ink/60">
                        {isOwned ? `Lv.${currentLevel}` : `解锁需 ${weapon.unlock_cost_gold} 金币`}
                      </p>
                    </div>
                    {isEquipped && (
                      <span className="bg-yellow text-ink text-xs px-2 py-0.5 font-bold shadow-[1px_1px_0_#1a1a1a]">已装备</span>
                    )}
                  </div>
                  <p className="text-sm text-ink/70 mb-3">{weapon.description}</p>
                  {/* 武器属性 chip 化：与挂机页区域信息 chip 模式同源
                      设计原因：原"攻击: X 暴击: Y% 暴伤: Z%"内联文本无视觉层次，
                      玩家难以一眼定位关键属性；改为 3 个 chip 与挂机页 ✨经验/💰金币 一致模式 */}
                  <div className="flex gap-2 mb-3 flex-wrap">
                    <div className="bg-orange/15 text-ink px-2 py-0.5 rounded-full font-mono text-xs flex items-center gap-1 border border-orange/30">
                      <span className="text-ink/70">攻击</span>
                      <span className="text-orange font-bold">{weapon.base_attack}</span>
                    </div>
                    <div className="bg-pink/15 text-ink px-2 py-0.5 rounded-full font-mono text-xs flex items-center gap-1 border border-pink/30">
                      <span className="text-ink/70">暴击</span>
                      <span className="text-pink font-bold">{(weapon.base_crit_rate * 100).toFixed(0)}%</span>
                    </div>
                    <div className="bg-orange/15 text-ink px-2 py-0.5 rounded-full font-mono text-xs flex items-center gap-1 border border-orange/30">
                      <span className="text-ink/70">暴伤</span>
                      <span className="text-orange font-bold">{(weapon.base_crit_damage * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {isOwned ? (
                      <>
                        <button
                          onClick={() => handleUpgradeWeapon(weapon)}
                          disabled={loading}
                          className="bg-pink text-cream px-3 py-1 font-mono text-xs font-bold hover:bg-ink transition-all shadow-[2px_2px_0_#1a1a1a] hover:shadow-[1px_1px_0_#1a1a1a] hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50"
                        >
                          升级 ({upgradeCostGold}💰)
                        </button>
                        {!isEquipped && (
                          <button
                            onClick={() => handleEquipWeapon(weapon.id)}
                            disabled={loading}
                            className="bg-ink text-cream px-3 py-1 font-mono text-xs font-bold hover:bg-mint hover:text-ink transition-all shadow-[2px_2px_0_#1a1a1a] hover:shadow-[1px_1px_0_#1a1a1a] hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50"
                          >
                            装备
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        onClick={() => handleBuyWeapon(weapon)}
                        disabled={loading || (status?.gold ?? 0) < weapon.unlock_cost_gold}
                        className="bg-ink text-cream px-3 py-1 font-mono text-xs font-bold hover:bg-mint hover:text-ink transition-all shadow-[2px_2px_0_#1a1a1a] hover:shadow-[1px_1px_0_#1a1a1a] hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50"
                      >
                        购买 ({weapon.unlock_cost_gold}💰)
                      </button>
                    )}
                  </div>
                </div>
              );
            })
            )}
          </div>
        )}

        {activeTab === 'skills' && (
          <div className="space-y-3 animate-fadeIn">
            <p className="font-cn text-sm text-ink/70">技能书</p>
            {/* 空状态：与 weapons tab 一致，明确传达"暂无技能"语义 */}
            {skills.length === 0 ? (
              <div className="text-center py-12 animate-stagger">
                <p className="text-5xl mb-4 inline-block animate-bounce-slow"><span aria-hidden="true">✨</span></p>
                <p className="font-cn text-ink/70 text-lg">暂无技能</p>
                <p className="font-mono text-xs text-ink/40 mt-1">达到等级后可解锁技能</p>
              </div>
            ) : (
              skills.map((skill) => {
              const isUnlocked = skill.level !== undefined;
              const isActive = skill.is_active;
              const currentLevel = skill.level ?? 0;
              const upgradeCostGold = 100 * currentLevel;
              const requiredLevel = 1 + (skill.id - 1) * 5;
              return (
                <div
                  key={skill.id}
                  className={`bg-cream border-2 ${
                    isActive ? 'border-mint' : 'border-ink'
                  } px-4 py-3 shadow-[3px_3px_0_#1a1a1a] card-hover`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    {/* emoji 加圆形背景：已激活态用 mint/20 呼应卡片薄荷边框，未激活用 ink/5 中性底 */}
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isActive ? 'bg-mint/20' : 'bg-ink/5'
                    }`}>
                      <span className="text-2xl" aria-hidden="true">✨</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-cn text-ink font-bold">{skill.name}</p>
                      <p className="font-mono text-xs text-ink/60">
                        {isUnlocked
                          ? `Lv.${currentLevel} · ${skill.type === 'active' ? '主动' : '被动'}`
                          : `需要 Lv.${requiredLevel} 解锁`}
                      </p>
                    </div>
                    {isActive && (
                      <span className="bg-mint text-ink text-xs px-2 py-0.5 font-bold shadow-[1px_1px_0_#1a1a1a]">已激活</span>
                    )}
                  </div>
                  <p className="text-sm text-ink/70 mb-3">{skill.description}</p>
                  <div className="flex gap-2">
                    {isUnlocked ? (
                      <>
                        <button
                          onClick={() => handleUpgradeSkill(skill)}
                          disabled={loading}
                          className="bg-pink text-cream px-3 py-1 font-mono text-xs font-bold hover:bg-ink transition-all shadow-[2px_2px_0_#1a1a1a] hover:shadow-[1px_1px_0_#1a1a1a] hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50"
                        >
                          升级 ({upgradeCostGold}💰)
                        </button>
                        <button
                          onClick={() => handleActivateSkill(skill, !isActive)}
                          disabled={loading}
                          className={`px-3 py-1 font-mono text-xs font-bold transition-all shadow-[2px_2px_0_#1a1a1a] hover:shadow-[1px_1px_0_#1a1a1a] hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50 ${
                            // 停用按钮改用 orange 保持 Neo-brutalism 调色板（原 red-500 脱离设计系统）
                            isActive
                              ? 'bg-orange text-cream hover:bg-ink'
                              : 'bg-ink text-cream hover:bg-mint hover:text-ink'
                          }`}
                        >
                          {isActive ? '停用' : '激活'}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleUnlockSkill(skill)}
                        disabled={loading || (status?.level ?? 1) < requiredLevel}
                        className="bg-ink text-cream px-3 py-1 font-mono text-xs font-bold hover:bg-mint hover:text-ink transition-all shadow-[2px_2px_0_#1a1a1a] hover:shadow-[1px_1px_0_#1a1a1a] hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50"
                      >
                        解锁
                      </button>
                    )}
                  </div>
                </div>
              );
            })
            )}
          </div>
        )}

        {activeTab === 'pets' && (
          <div className="space-y-3 animate-fadeIn">
            <p className="font-cn text-sm text-ink/70">宠物</p>
            {/* 空状态：与 weapons/skills tab 一致，明确传达"暂无宠物"语义 */}
            {pets.length === 0 ? (
              <div className="text-center py-12 animate-stagger">
                <p className="text-5xl mb-4 inline-block animate-bounce-slow"><span aria-hidden="true">🐾</span></p>
                <p className="font-cn text-ink/70 text-lg">暂无宠物</p>
                <p className="font-mono text-xs text-ink/40 mt-1">购买宠物辅助战斗</p>
              </div>
            ) : (
              pets.map((pet) => {
              const isOwned = pet.is_equipped !== undefined;
              const isEquipped = pet.is_equipped;
              return (
                <div
                  key={pet.id}
                  className={`bg-cream border-2 ${
                    isEquipped ? 'border-yellow' : 'border-ink'
                  } px-4 py-3 shadow-[3px_3px_0_#1a1a1a] card-hover`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    {/* emoji 加圆形背景：已装备态用 yellow/20 呼应卡片黄色边框，未装备用 ink/5 中性底 */}
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isEquipped ? 'bg-yellow/20' : 'bg-ink/5'
                    }`}>
                      <span className="text-2xl" aria-hidden="true">{pet.emoji}</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-cn text-ink font-bold">{pet.name}</p>
                      <p className="font-mono text-xs text-ink/60">
                        {isOwned ? (isEquipped ? '已装备' : '未装备') : `解锁需 ${pet.unlock_cost_gold} 金币`}
                      </p>
                    </div>
                    {isEquipped && (
                      <span className="bg-yellow text-ink text-xs px-2 py-0.5 font-bold shadow-[1px_1px_0_#1a1a1a]">已装备</span>
                    )}
                  </div>
                  <p className="text-sm text-ink/70 mb-3">{pet.description}</p>
                  <div className="flex gap-2">
                    {isOwned ? (
                      !isEquipped && (
                        <button
                          onClick={() => handleEquipPet(pet)}
                          disabled={loading}
                          className="bg-ink text-cream px-3 py-1 font-mono text-xs font-bold hover:bg-mint hover:text-ink transition-all shadow-[2px_2px_0_#1a1a1a] hover:shadow-[1px_1px_0_#1a1a1a] hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50"
                        >
                          装备
                        </button>
                      )
                    ) : (
                      <button
                        onClick={() => handleBuyPet(pet)}
                        disabled={loading || (status?.gold ?? 0) < pet.unlock_cost_gold}
                        className="bg-ink text-cream px-3 py-1 font-mono text-xs font-bold hover:bg-mint hover:text-ink transition-all shadow-[2px_2px_0_#1a1a1a] hover:shadow-[1px_1px_0_#1a1a1a] hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50"
                      >
                        购买 ({pet.unlock_cost_gold}💰)
                      </button>
                    )}
                  </div>
                </div>
              );
            })
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default IdlePage;
