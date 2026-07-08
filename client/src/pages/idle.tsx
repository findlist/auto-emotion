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

function IdlePage({ onBack }: IdlePageProps) {
  const user = useUserStore((s) => s.user);
  const userId = user?.id?.toString();

  const [status, setStatus] = useState<CharacterStatus | null>(null);
  const [areas, setAreas] = useState<IdleArea[]>([]);
  const [offlineResult, setOfflineResult] = useState<OfflineResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'main' | 'weapons' | 'skills' | 'pets'>('main');
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
        idleApi.getStatus(userId).catch(() => null),
        idleApi.listAreas().catch(() => []),
        idleApi.claim(userId).catch(() => null),
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
    void loadData();
  }, [userId, loadData]);

  // 加载武器数据
  async function loadWeapons() {
    try {
      const data = await weaponApi.list();
      setWeapons(data);
    } catch (err) {
      logger.error('加载武器失败', err);
    }
  }

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
  async function loadSkills() {
    try {
      const data = await skillApi.list();
      setSkills(data);
    } catch (err) {
      logger.error('加载技能失败', err);
    }
  }

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
  async function loadPets() {
    try {
      const data = await petApi.list();
      setPets(data);
    } catch (err) {
      logger.error('加载宠物失败', err);
    }
  }

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
      const result = await idleApi.claim(userId);
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
      await idleApi.switchArea(userId, areaId);
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
    const fieldInfo = UPGRADE_FIELDS.find((f) => f.key === field);
    const ok = await showConfirm({
      type: 'warning',
      title: '升级属性',
      message: `确认升级「${fieldInfo?.label ?? field}」？`,
      confirmText: '升级',
    });
    if (!ok) return;

    try {
      setLoading(true);
      await idleApi.upgrade(userId, field);
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
    <div className="min-h-screen flex flex-col bg-cream">
      {/* 顶部导航 */}
      <header className="bg-ink text-cream px-4 py-3 flex items-center gap-4">
        {/* 设计原因:aria-label 覆盖按钮内"← 返回"文本,避免屏幕阅读器朗读"左箭头 返回" */}
        <button
          onClick={onBack}
          aria-label="返回"
          className="bg-pink text-cream px-3 py-1 font-mono text-sm hover:bg-cream hover:text-ink transition-colors"
        >
          ← 返回
        </button>
        <h1 className="font-cn text-xl flex-1 text-center">挂机空间</h1>
        <div className="flex items-center gap-2">
          {/* 装饰性 emoji,aria-hidden 避免屏幕阅读器冗余朗读"硬币" */}
          <span className="text-yellow" aria-hidden="true">💰</span>
          <span className="font-mono text-sm">{status?.gold ?? 0}</span>
        </div>
      </header>

      {/* 离线收益领取 */}
      {offlineResult && offlineResult.exp > 0 && (
        <div className="bg-yellow text-ink px-4 py-3 flex items-center justify-between">
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
            className="bg-ink text-cream px-4 py-2 font-mono text-sm font-bold hover:bg-pink transition-colors disabled:opacity-50"
          >
            领取
          </button>
        </div>
      )}

      {/* 战力展示 */}
      <div className="bg-ink text-cream px-4 py-3">
        <div className="flex items-center gap-4 mb-2">
          <div className="w-12 h-12 rounded-full bg-pink flex items-center justify-center font-bold text-lg">
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
          <div className="bg-ink/80 px-2 py-1 rounded">
            <span className="text-cream/60">攻击</span>
            <span className="ml-1 text-orange">{status?.attack ?? 0}</span>
          </div>
          <div className="bg-ink/80 px-2 py-1 rounded">
            <span className="text-cream/60">防御</span>
            <span className="ml-1 text-mint">{status?.defense ?? 0}</span>
          </div>
          <div className="bg-ink/80 px-2 py-1 rounded">
            <span className="text-cream/60">生命</span>
            <span className="ml-1 text-pink">{status?.hp ?? 0}</span>
          </div>
          <div className="bg-ink/80 px-2 py-1 rounded">
            <span className="text-cream/60">效率</span>
            <span className="ml-1 text-yellow">{((status?.efficiency ?? 1) * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>

      {/* 区域切换 */}
      <div className="px-4 py-3">
        <p className="font-cn text-sm text-ink/70 mb-2">选择挂机区域</p>
        <div className="flex gap-2 overflow-x-auto pb-2">
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
                    ? 'bg-pink text-cream shadow-[3px_3px_0_#1a1a1a]'
                    : isLocked
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-cream border-2 border-ink text-ink hover:bg-yellow hover:border-ink shadow-[3px_3px_0_#1a1a1a]'
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

      {/* 区域信息 */}
      {status?.area_name && (
        <div className="px-4 py-2 mb-2">
          <p className="text-ink/70 font-mono text-xs">
            当前区域: <span className="text-ink">{status.area_name}</span> ·
            经验率 <span className="text-pink">{(status.exp_rate ?? 1) * 100}%</span> ·
            金币率 <span className="text-yellow">{(status.gold_rate ?? 1) * 100}%</span>
          </p>
        </div>
      )}

      {/* 功能切换标签：WAI-ARIA tab 语义让屏幕阅读器正确识别为标签页界面
          设计原因：role=tablist/tab/tabpanel + aria-selected/controls/labelled
          构成完整 tab 语义。保留所有 tab 的默认 button 可聚焦性，不引入 roving
          tabindex 避免箭头键导航复杂度，是安全增量改进 */}
      <div role="tablist" aria-label="挂机功能" className="px-4 flex gap-2 border-b border-ink/20">
        {[
          { key: 'main', label: '升级' },
          { key: 'weapons', label: '武器' },
          { key: 'skills', label: '技能' },
          { key: 'pets', label: '宠物' },
        ].map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            aria-controls="idle-panel"
            id={`idle-tab-${tab.key}`}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={`px-4 py-2 font-mono text-sm border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-pink text-pink'
                : 'border-transparent text-ink/60 hover:text-ink'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 主内容区：role=tabpanel 关联当前激活的 tab，屏幕阅读器切换 tab 时自动定位内容区 */}
      <main role="tabpanel" id="idle-panel" aria-labelledby={`idle-tab-${activeTab}`} className="flex-1 p-4 overflow-y-auto">
        {activeTab === 'main' && (
          <div className="space-y-3">
            <p className="font-cn text-sm text-ink/70">升级角色属性</p>
            {UPGRADE_FIELDS.map((field) => {
              const value = status?.[field.key] ?? 0;
              const displayValue = field.key === 'efficiency' || field.key === 'crit_rate' || field.key === 'crit_damage'
                ? (Number(value) * 100).toFixed(0) + field.unit
                : value + field.unit;
              return (
                <div
                  key={field.key}
                  className="bg-cream border-2 border-ink px-4 py-3 flex items-center justify-between shadow-[3px_3px_0_#1a1a1a]"
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
                    className="bg-pink text-cream px-4 py-2 font-mono text-sm font-bold hover:bg-ink transition-colors disabled:opacity-50"
                  >
                    升级
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'weapons' && (
          <div className="space-y-3">
            <p className="font-cn text-sm text-ink/70">武器库</p>
            {weapons.map((weapon) => {
              const isOwned = weapon.level !== undefined;
              const isEquipped = weapon.is_equipped;
              const currentLevel = weapon.level ?? 0;
              const upgradeCostGold = 50 * currentLevel * currentLevel;
              return (
                <div
                  key={weapon.id}
                  className={`bg-cream border-2 ${
                    isEquipped ? 'border-yellow' : 'border-ink'
                  } px-4 py-3 shadow-[3px_3px_0_#1a1a1a]`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    {/* 装饰性 emoji,aria-hidden 避免与后跟武器名语义重复 */}
                    <span className="text-3xl" aria-hidden="true">⚔️</span>
                    <div className="flex-1">
                      <p className="font-cn text-ink font-bold">{weapon.name}</p>
                      <p className="font-mono text-xs text-ink/60">
                        {isOwned ? `Lv.${currentLevel}` : `解锁需 ${weapon.unlock_cost_gold} 金币`}
                      </p>
                    </div>
                    {isEquipped && (
                      <span className="bg-yellow text-ink text-xs px-2 py-0.5 font-bold">已装备</span>
                    )}
                  </div>
                  <p className="text-sm text-ink/70 mb-3">{weapon.description}</p>
                  <div className="flex gap-2">
                    <span className="font-mono text-xs text-ink/60">
                      攻击: {weapon.base_attack}
                    </span>
                    <span className="font-mono text-xs text-ink/60">
                      暴击: {(weapon.base_crit_rate * 100).toFixed(0)}%
                    </span>
                    <span className="font-mono text-xs text-ink/60">
                      暴伤: {(weapon.base_crit_damage * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex gap-2 mt-3">
                    {isOwned ? (
                      <>
                        <button
                          onClick={() => handleUpgradeWeapon(weapon)}
                          disabled={loading}
                          className="bg-pink text-cream px-3 py-1 font-mono text-xs font-bold hover:bg-ink transition-colors disabled:opacity-50"
                        >
                          升级 ({upgradeCostGold}💰)
                        </button>
                        {!isEquipped && (
                          <button
                            onClick={() => handleEquipWeapon(weapon.id)}
                            disabled={loading}
                            className="bg-ink text-cream px-3 py-1 font-mono text-xs font-bold hover:bg-mint hover:text-ink transition-colors disabled:opacity-50"
                          >
                            装备
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        onClick={() => handleBuyWeapon(weapon)}
                        disabled={loading || (status?.gold ?? 0) < weapon.unlock_cost_gold}
                        className="bg-ink text-cream px-3 py-1 font-mono text-xs font-bold hover:bg-mint hover:text-ink transition-colors disabled:opacity-50"
                      >
                        购买 ({weapon.unlock_cost_gold}💰)
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'skills' && (
          <div className="space-y-3">
            <p className="font-cn text-sm text-ink/70">技能书</p>
            {skills.map((skill) => {
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
                  } px-4 py-3 shadow-[3px_3px_0_#1a1a1a]`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    {/* 装饰性 emoji,aria-hidden 避免与后跟技能名语义重复 */}
                    <span className="text-3xl" aria-hidden="true">✨</span>
                    <div className="flex-1">
                      <p className="font-cn text-ink font-bold">{skill.name}</p>
                      <p className="font-mono text-xs text-ink/60">
                        {isUnlocked
                          ? `Lv.${currentLevel} · ${skill.type === 'active' ? '主动' : '被动'}`
                          : `需要 Lv.${requiredLevel} 解锁`}
                      </p>
                    </div>
                    {isActive && (
                      <span className="bg-mint text-ink text-xs px-2 py-0.5 font-bold">已激活</span>
                    )}
                  </div>
                  <p className="text-sm text-ink/70 mb-3">{skill.description}</p>
                  <div className="flex gap-2">
                    {isUnlocked ? (
                      <>
                        <button
                          onClick={() => handleUpgradeSkill(skill)}
                          disabled={loading}
                          className="bg-pink text-cream px-3 py-1 font-mono text-xs font-bold hover:bg-ink transition-colors disabled:opacity-50"
                        >
                          升级 ({upgradeCostGold}💰)
                        </button>
                        <button
                          onClick={() => handleActivateSkill(skill, !isActive)}
                          disabled={loading}
                          className={`px-3 py-1 font-mono text-xs font-bold transition-colors disabled:opacity-50 ${
                            isActive
                              ? 'bg-red-500 text-cream hover:bg-ink'
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
                        className="bg-ink text-cream px-3 py-1 font-mono text-xs font-bold hover:bg-mint hover:text-ink transition-colors disabled:opacity-50"
                      >
                        解锁
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'pets' && (
          <div className="space-y-3">
            <p className="font-cn text-sm text-ink/70">宠物</p>
            {pets.map((pet) => {
              const isOwned = pet.is_equipped !== undefined;
              const isEquipped = pet.is_equipped;
              return (
                <div
                  key={pet.id}
                  className={`bg-cream border-2 ${
                    isEquipped ? 'border-yellow' : 'border-ink'
                  } px-4 py-3 shadow-[3px_3px_0_#1a1a1a]`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    {/* 装饰性 emoji,aria-hidden 避免与后跟宠物名语义重复 */}
                    <span className="text-3xl" aria-hidden="true">{pet.emoji}</span>
                    <div className="flex-1">
                      <p className="font-cn text-ink font-bold">{pet.name}</p>
                      <p className="font-mono text-xs text-ink/60">
                        {isOwned ? (isEquipped ? '已装备' : '未装备') : `解锁需 ${pet.unlock_cost_gold} 金币`}
                      </p>
                    </div>
                    {isEquipped && (
                      <span className="bg-yellow text-ink text-xs px-2 py-0.5 font-bold">已装备</span>
                    )}
                  </div>
                  <p className="text-sm text-ink/70 mb-3">{pet.description}</p>
                  <div className="flex gap-2">
                    {isOwned ? (
                      !isEquipped && (
                        <button
                          onClick={() => handleEquipPet(pet)}
                          disabled={loading}
                          className="bg-ink text-cream px-3 py-1 font-mono text-xs font-bold hover:bg-mint hover:text-ink transition-colors disabled:opacity-50"
                        >
                          装备
                        </button>
                      )
                    ) : (
                      <button
                        onClick={() => handleBuyPet(pet)}
                        disabled={loading || (status?.gold ?? 0) < pet.unlock_cost_gold}
                        className="bg-ink text-cream px-3 py-1 font-mono text-xs font-bold hover:bg-mint hover:text-ink transition-colors disabled:opacity-50"
                      >
                        购买 ({pet.unlock_cost_gold}💰)
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

export default IdlePage;
