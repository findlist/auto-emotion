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
  const [loading, setLoading] = useState(false);

  async function loadAchievements() {
    try {
      setLoading(true);
      const data = await achievementApi.getAchievements();
      setAchievements(data);
    } catch (err) {
      logger.error('加载成就失败', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAchievements();
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
    <div className="min-h-screen bg-cream flex flex-col">
      {/* 顶部导航 */}
      <header className="bg-ink text-cream px-4 py-3 flex items-center gap-4">
        {/* 返回按钮仅含箭头符号，aria-label 提供语义避免屏幕阅读器朗读"左箭头" */}
        <button onClick={onBack} aria-label="返回" className="text-cream hover:text-yellow transition-colors">
          ←
        </button>
        <h1 className="font-cn text-lg font-bold">成就</h1>
        <span className="ml-auto font-mono text-sm">
          {completedCount}/{achievements.length}
        </span>
      </header>

      {/* 成就统计 */}
      <div className="bg-pink text-cream px-4 py-3">
        <p className="font-cn text-sm">
          已完成 {completedCount} 个 | 已领取 {claimedCount} 个奖励
        </p>
      </div>

      {/* 成就列表 */}
      <main className="flex-1 p-4 overflow-auto">
        {loading ? (
          <div className="text-center py-8">
            <p className="font-cn text-ink/70">加载中...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedAchievements).map(([typeName, typeAchievements]) => (
              <div key={typeName}>
                <h3 className="font-cn text-ink font-bold mb-3 flex items-center gap-2">
                  {/* 分组类型 emoji 与后跟类型名语义重复，aria-hidden 屏蔽装饰图标 */}
                  <span aria-hidden="true">{TYPE_LABELS[typeAchievements[0]?.type]?.emoji || '❓'}</span>
                  {typeName}
                </h3>
                <div className="space-y-3">
                  {typeAchievements.map((achievement) => {
                    const progressPercent = getProgressPercent(achievement);
                    const rewardLabel = REWARD_TYPE_LABELS[achievement.reward_type] || achievement.reward_type;

                    return (
                      <div
                        key={achievement.id}
                        className={`bg-cream border-2 ${
                          achievement.claimed
                            ? 'border-green-500'
                            : achievement.completed
                            ? 'border-mint'
                            : 'border-ink'
                        } p-4 shadow-[3px_3px_0_#1a1a1a]`}
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

                        <p className="text-sm text-ink/70 mb-2">
                          奖励: {rewardLabel}
                        </p>

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
                            className={`h-full rounded-full transition-all ${
                              achievement.claimed
                                ? 'bg-green-500'
                                : achievement.completed
                                ? 'bg-mint'
                                : 'bg-pink'
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
                              className="bg-mint text-ink px-3 py-1 font-cn font-bold text-sm hover:bg-ink hover:text-cream transition-colors disabled:opacity-50"
                            >
                              领取
                            </button>
                          )}

                          {achievement.claimed && (
                            <span className="font-mono text-xs text-green-500 font-bold">
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