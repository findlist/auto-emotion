import { useEffect, useState } from 'react';
import { achievementApi, type Achievement } from '@/api/achievements';
import { showToast } from '@/utils/toast';
import { showApiError } from '@/utils/api-error';
import { showConfirm } from '@/utils/confirm';
import { logger } from '@/utils/logger';

interface AchievementsPageProps {
  onBack: () => void;
}

const TYPE_LABELS: Record<number, { label: string; emoji: string }> = {
  0: { label: '对战', emoji: '⚔️' },
  1: { label: '破坏', emoji: '💥' },
  2: { label: '挂机', emoji: '⏰' },
  3: { label: '社交', emoji: '👥' },
  4: { label: '等级', emoji: '⬆️' },
  5: { label: '战力', emoji: '💪' },
};

const REWARD_TYPE_LABELS: Record<string, string> = {
  skin: '皮肤',
  pet: '宠物',
  weapon_skin: '武器皮肤',
  item: '道具',
};

export default function AchievementsPage({ onBack }: AchievementsPageProps) {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  // 初始 true：挂载即开始加载，避免 useEffect 内同步 setLoading(true) 触发级联渲染
  const [loading, setLoading] = useState(true);

  // 注意：loadAchievements 不再同步 setLoading(true)，仅由调用方或初始 true 控制
  // handleClaim 单独管理 loading，避免与刷新逻辑耦合
  async function loadAchievements() {
    try {
      const data = await achievementApi.getAchievements();
      setAchievements(data);
    } catch (err) {
      logger.error('加载成就失败', err);
    } finally {
      setLoading(false);
    }
  }

  // 内联初始加载：避免 eslint 跨过程分析标记 loadAchievements 调用
  // cancelled 标志防止组件卸载后 setState（React 19 推荐模式）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await achievementApi.getAchievements();
        if (!cancelled) setAchievements(data);
      } catch (err) {
        logger.error('加载成就失败', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleClaim(achievement: Achievement) {
    // 成就奖励领取属于关键操作，二次确认避免误触
    const rewardLabel = REWARD_TYPE_LABELS[achievement.reward_type] || achievement.reward_type;
    const ok = await showConfirm({
      type: 'info',
      title: '领取奖励',
      message: `确认领取「${achievement.name}」奖励？将获得 ${rewardLabel}。`,
      confirmText: '领取',
    });
    if (!ok) return;

    try {
      setLoading(true);
      const result = await achievementApi.claimReward(achievement.id);
      showToast('success', `领取成功！获得 ${REWARD_TYPE_LABELS[result.reward_type] || result.reward_type}`);
      await loadAchievements();
    } catch (err) {
      showApiError(err, '领取失败');
    } finally {
      setLoading(false);
    }
  }

  function getProgressPercent(achievement: Achievement) {
    return Math.min(100, (achievement.progress / achievement.target) * 100);
  }

  // 按类型分组
  const groupedAchievements = achievements.reduce((acc, achievement) => {
    const typeInfo = TYPE_LABELS[achievement.type] || { label: '其他', emoji: '❓' };
    const typeName = typeInfo.label;
    if (!acc[typeName]) {
      acc[typeName] = [];
    }
    acc[typeName].push(achievement);
    return acc;
  }, {} as Record<string, Achievement[]>);

  const completedCount = achievements.filter((a) => a.completed).length;
  const claimedCount = achievements.filter((a) => a.claimed).length;

  return (
    <div className="min-h-screen bg-cream flex flex-col max-w-2xl mx-auto">
      {/* 顶部导航：bg-glow-pink 增加深色头部氛围层次 */}
      <header className="bg-ink text-cream px-4 py-3 flex items-center gap-4 bg-glow-pink">
        {/* 返回按钮放大并加 hover 背景区块，提升点击友好度 */}
        <button
          onClick={onBack}
          aria-label="返回"
          className="w-9 h-9 flex items-center justify-center text-cream text-xl hover:bg-cream/10 rounded-lg transition-colors"
        >
          ←
        </button>
        <h1 className="font-cn text-lg font-bold drop-shadow-[2px_2px_0_rgba(255,61,127,0.4)]">成就</h1>
        <span className="ml-auto font-mono text-sm bg-cream/10 px-3 py-1 rounded-full border border-cream/20">
          {completedCount}/{achievements.length}
        </span>
      </header>

      {/* 成就统计：加 border-b 增强与列表的分隔层次 */}
      <div className="bg-pink text-cream px-4 py-3 border-b-2 border-ink">
        <p className="font-cn text-sm">
          已完成 <span className="font-bold text-yellow">{completedCount}</span> 个 | 已领取 <span className="font-bold text-yellow">{claimedCount}</span> 个奖励
        </p>
      </div>

      {/* 成就列表：scrollbar-brutal 统一滚动条风格 */}
      <main className="flex-1 p-4 overflow-auto scrollbar-brutal">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10">
            <div className="w-10 h-10 border-4 border-ink/20 border-t-pink rounded-full animate-spin" />
            <p className="font-mono text-sm text-ink/60">加载成就中...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedAchievements).map(([typeName, typeAchievements]) => (
              <div key={typeName} className="animate-stagger">
                <h3 className="font-cn text-ink font-bold mb-3 flex items-center gap-2 text-lg drop-shadow-[1px_1px_0_rgba(255,107,53,0.2)]">
                  {/* 分组类型 emoji 与后跟类型名语义重复，aria-hidden 屏蔽装饰图标 */}
                  <span aria-hidden="true">{TYPE_LABELS[typeAchievements[0]?.type]?.emoji || '❓'}</span>
                  {typeName}
                  <span className="ml-1 font-mono text-xs text-ink/50 font-normal">
                    ({typeAchievements.length})
                  </span>
                </h3>
                <div className="space-y-3">
                  {typeAchievements.map((achievement, idx) => {
                    const progressPercent = getProgressPercent(achievement);
                    const rewardLabel = REWARD_TYPE_LABELS[achievement.reward_type] || achievement.reward_type;

                    return (
                      <div
                        key={achievement.id}
                        className={`bg-cream border-2 ${
                          // 已领取用 ink/40 灰阶表示归档态（原 green-500 脱离调色板）
                          achievement.claimed
                            ? 'border-ink/40'
                            : achievement.completed
                            ? 'border-mint'
                            : 'border-ink'
                        } p-4 shadow-[3px_3px_0_#1a1a1a] card-hover animate-stagger`}
                        style={{ animationDelay: `${idx * 50}ms` }}
                      >
                        <div className="flex items-start gap-3 mb-2">
                          {/* 成就状态 emoji（完成/未完成）为装饰性视觉标识，状态通过边框色、进度条、领取按钮多渠道传达，aria-hidden 屏蔽避免冗余朗读 */}
                          <span className="text-3xl" aria-hidden="true">
                            {achievement.completed ? '🏆' : '🔒'}
                          </span>
                          <div className="flex-1">
                            <p className="font-cn text-ink font-bold">{achievement.name}</p>
                            <p className="font-mono text-xs text-ink/60">
                              {achievement.description}
                            </p>
                          </div>
                        </div>

                        {/* 奖励标签：用胶囊包裹增强视觉层次 */}
                        <div className="inline-block bg-yellow/20 border border-yellow/40 rounded-full px-3 py-0.5 mb-2">
                          <p className="font-mono text-xs text-ink/70">
                            奖励: {rewardLabel}
                          </p>
                        </div>

                        {/* 进度条：role="progressbar" + aria 属性让屏幕阅读器可朗读成就进度 */}
                        <div
                          className="h-2 bg-ink/20 rounded-full mb-2"
                          role="progressbar"
                          aria-label={`成就进度：${achievement.name}`}
                          aria-valuenow={achievement.progress}
                          aria-valuemin={0}
                          aria-valuemax={achievement.target}
                        >
                          <div
                            // 已领取(归档态)不加 progress-fill 流光，避免静止状态仍有动画干扰；
                            // 进行中/可领取才叠加流光暗示进度仍在累积
                            className={`h-full rounded-full transition-all ${
                              achievement.claimed
                                ? 'bg-ink/40'
                                : `progress-fill ${
                                  achievement.completed
                                    ? 'bg-mint'
                                    : 'bg-pink'
                                }`
                            }`}
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs text-ink/70">
                            {achievement.progress}/{achievement.target}
                          </span>

                          {achievement.completed && !achievement.claimed && (
                            <button
                              onClick={() => handleClaim(achievement)}
                              disabled={loading}
                              className="bg-mint text-ink px-3 py-1 font-cn font-bold text-sm shadow-[2px_2px_0_#1a1a1a] hover:bg-ink hover:text-cream transition-colors active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:active:translate-x-0 disabled:active:translate-y-0 disabled:active:shadow-[2px_2px_0_#1a1a1a] disabled:opacity-50"
                            >
                              领取
                            </button>
                          )}

                          {achievement.claimed && (
                            <span className="font-mono text-xs text-ink/60 font-bold bg-ink/10 px-2 py-1 rounded shadow-[1px_1px_0_#1a1a1a]">
                              ✓ 已领取
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}