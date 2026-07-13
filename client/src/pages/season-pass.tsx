import { useEffect, useState } from 'react';
import { seasonPassApi, type SeasonPass } from '@/api/season-pass';
import { showToast } from '@/utils/toast';
import { showApiError } from '@/utils/api-error';
import { showConfirm } from '@/utils/confirm';
import { logger } from '@/utils/logger';

interface SeasonPassPageProps {
  onBack: () => void;
}

const REWARD_TYPE_LABELS: Record<string, string> = {
  gold: '金币',
  skin: '皮肤',
  pet: '宠物',
  weapon_skin: '武器皮肤',
  item: '道具',
};

export default function SeasonPassPage({ onBack }: SeasonPassPageProps) {
  const [seasonPass, setSeasonPass] = useState<SeasonPass | null>(null);
  // 初始 true：挂载即开始加载，避免 useEffect 内同步 setLoading(true) 触发级联渲染
  const [loading, setLoading] = useState(true);

  // loadSeasonPass 不再同步 setLoading(true)，仅由调用方或初始 true 控制
  // handleBuy/handleClaim 单独管理 loading，避免与刷新逻辑耦合
  async function loadSeasonPass() {
    try {
      const data = await seasonPassApi.get();
      setSeasonPass(data);
    } catch (err) {
      logger.error('加载赛季通行证失败', err);
    } finally {
      setLoading(false);
    }
  }

  // 内联初始加载：避免 eslint 跨过程分析标记 loadSeasonPass 调用
  // cancelled 标志防止组件卸载后 setState（React 19 推荐模式）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await seasonPassApi.get();
        if (!cancelled) setSeasonPass(data);
      } catch (err) {
        logger.error('加载赛季通行证失败', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleBuy() {
    // 购买高级通行证属于关键付费操作，需二次确认
    const ok = await showConfirm({
      type: 'warning',
      title: '购买高级通行证',
      message: '确认购买高级通行证？购买后可解锁专属高级奖励。',
      confirmText: '确认购买',
    });
    if (!ok) return;

    try {
      setLoading(true);
      await seasonPassApi.buy();
      showToast('success', '购买成功！');
      await loadSeasonPass();
    } catch (err) {
      showApiError(err, '购买失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleClaim(level: number, isPremium: boolean) {
    // 通行证奖励领取属于关键操作，二次确认避免误触
    const ok = await showConfirm({
      type: 'info',
      title: '领取奖励',
      message: `确认领取第 ${level} 阶${isPremium ? '高级' : '免费'}奖励？`,
      confirmText: '领取',
    });
    if (!ok) return;

    try {
      setLoading(true);
      await seasonPassApi.claim(level, isPremium);
      showToast('success', '领取成功！');
      await loadSeasonPass();
    } catch (err) {
      showApiError(err, '领取失败');
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString();
  }

  if (!seasonPass) {
    return (
      <div className="min-h-screen bg-cream flex flex-col items-center justify-center gap-3">
        <div className="w-10 h-10 border-4 border-ink/20 border-t-pink rounded-full animate-spin" />
        <p className="font-mono text-sm text-ink/60">加载赛季通行证中...</p>
      </div>
    );
  }

  const maxLevel = Math.max(...seasonPass.rewards.map(r => r.level));

  return (
    <div className="min-h-screen bg-cream flex flex-col max-w-2xl mx-auto">
      {/* 顶部导航：bg-glow-pink 增加深色头部氛围层次 */}
      <header className="bg-ink text-cream px-4 py-3 flex items-center gap-4 bg-glow-pink">
        <button
          onClick={onBack}
          aria-label="返回"
          className="w-9 h-9 flex items-center justify-center text-cream text-xl hover:bg-cream/10 rounded-lg transition-colors"
        >
          ←
        </button>
        <h1 className="font-cn text-lg font-bold drop-shadow-[2px_2px_0_rgba(255,61,127,0.4)]">赛季通行证</h1>
      </header>

      {/* 赛季信息：叠加 bg-stripes 对角条纹增强氛围层次 */}
      <div className="bg-gradient-to-r from-pink to-mint text-cream px-4 py-4 bg-stripes border-b-2 border-ink">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-cn text-xl font-bold drop-shadow-[2px_2px_0_rgba(26,26,26,0.3)]">{seasonPass.seasonName}</h2>
          <span className="font-mono text-sm bg-ink/30 px-2 py-1 rounded">
            {formatDate(seasonPass.seasonStartedAt)} - {formatDate(seasonPass.seasonEndsAt)}
          </span>
        </div>

        {/* 等级进度 */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="font-cn text-sm">等级 <span className="font-bold text-yellow text-lg">{seasonPass.level}</span>/{maxLevel}</span>
            <span className="font-mono text-sm"><span className="font-bold text-yellow">{seasonPass.exp}</span> 经验</span>
          </div>
          {/* 进度条加 progressbar 语义，让屏幕阅读器可朗读赛季等级进度 */}
          <div
            className="h-4 bg-ink/30 rounded-full"
            role="progressbar"
            aria-label="赛季等级进度"
            aria-valuenow={seasonPass.level}
            aria-valuemin={0}
            aria-valuemax={maxLevel}
          >
            <div
              className="h-full bg-yellow rounded-full transition-all progress-fill"
              style={{ width: `${(seasonPass.level / maxLevel) * 100}%` }}
            />
          </div>
        </div>

        {/* 通行证状态 */}
        {seasonPass.isPremium ? (
          <div className="flex items-center gap-2 bg-ink/40 px-3 py-2 rounded-lg border border-yellow/40 shadow-[2px_2px_0_rgba(26,26,26,0.3)]">
            {/* 装饰性 emoji 与后跟"高级通行证"文字语义重复 */}
            <span className="text-yellow text-xl animate-bounce-slow" aria-hidden="true">👑</span>
            <span className="font-cn font-bold">高级通行证</span>
          </div>
        ) : (
          <button
            onClick={handleBuy}
            disabled={loading}
            className="w-full bg-yellow text-ink px-4 py-3 font-cn font-bold text-lg shadow-[4px_4px_0_#1a1a1a] hover:bg-ink hover:text-yellow transition-colors active:translate-x-[4px] active:translate-y-[4px] active:shadow-none disabled:active:translate-x-0 disabled:active:translate-y-0 disabled:active:shadow-[4px_4px_0_#1a1a1a] disabled:opacity-50"
          >
            购买高级通行证
          </button>
        )}
      </div>

      {/* 奖励列表：scrollbar-brutal 统一滚动条风格 */}
      <main className="flex-1 p-4 overflow-auto scrollbar-brutal">
        <h3 className="font-cn text-ink font-bold mb-3 text-lg drop-shadow-[1px_1px_0_rgba(255,107,53,0.2)]">等级奖励</h3>

        <div className="space-y-3">
          {seasonPass.rewards.filter(r => r.level <= 10 || r.level % 5 === 0).map((reward, idx) => {
            const isUnlocked = seasonPass.level >= reward.level;

            return (
              <div
                key={reward.level}
                className={`bg-cream border-2 ${
                  isUnlocked ? 'border-mint' : 'border-ink/30'
                } p-4 shadow-[3px_3px_0_#1a1a1a] card-hover animate-stagger ${!isUnlocked ? 'opacity-60' : ''}`}
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className={`w-14 h-14 rounded-full flex items-center justify-center font-mono font-bold text-lg ${
                      isUnlocked
                        ? 'bg-mint text-ink shadow-[2px_2px_0_#1a1a1a] ring-2 ring-yellow/40'
                        : 'bg-ink/20 text-ink/50'
                    }`}
                  >
                    {reward.level}
                  </div>
                  <div className="flex-1">
                    <p className="font-cn text-ink font-bold">
                      等级 {reward.level}
                    </p>
                    <p className="font-mono text-xs text-ink/60">
                      需要 {reward.exp_required} 经验
                    </p>
                  </div>
                </div>

                {/* 奖励展示：加 border 增强免费/高级两栏的视觉分隔 */}
                <div className="flex gap-4">
                  {/* 免费奖励 */}
                  <div className={`flex-1 p-2 rounded border ${reward.freeClaimed ? 'bg-mint/20 border-mint/40' : 'bg-ink/5 border-ink/20'}`}>
                    <p className="font-mono text-xs text-ink/70 mb-1">免费</p>
                    <p className="font-cn text-sm text-ink">
                      {REWARD_TYPE_LABELS[reward.free_reward_type] || reward.free_reward_type}
                      {reward.free_reward_type_amount && ` x${reward.free_reward_type_amount}`}
                    </p>
                    {isUnlocked && !reward.freeClaimed && (
                      <button
                        onClick={() => handleClaim(reward.level, false)}
                        disabled={loading}
                        className="mt-2 w-full bg-mint text-ink px-2 py-1 font-cn text-xs font-bold shadow-[2px_2px_0_#1a1a1a] hover:bg-ink hover:text-cream transition-colors active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:active:translate-x-0 disabled:active:translate-y-0 disabled:active:shadow-[2px_2px_0_#1a1a1a] disabled:opacity-50"
                      >
                        领取
                      </button>
                    )}
                    {reward.freeClaimed && (
                      <p className="mt-2 font-mono text-xs text-ink/60 font-bold bg-mint/20 px-2 py-1 rounded inline-block shadow-[1px_1px_0_#1a1a1a]">✓ 已领取</p>
                    )}
                  </div>

                  {/* 高级奖励 */}
                  <div className={`flex-1 p-2 rounded border ${reward.premiumClaimed ? 'bg-mint/20 border-mint/40' : 'bg-yellow/20 border-yellow/40'}`}>
                    <p className="font-mono text-xs text-ink/70 mb-1 flex items-center gap-1">
                      {/* 装饰性 emoji 与后跟"高级"文字语义重复 */}
                      <span className="text-yellow" aria-hidden="true">👑</span> 高级
                    </p>
                    <p className="font-cn text-sm text-ink">
                      {REWARD_TYPE_LABELS[reward.premium_reward_type] || reward.premium_reward_type}
                    </p>
                    {seasonPass.isPremium && isUnlocked && !reward.premiumClaimed && (
                      <button
                        onClick={() => handleClaim(reward.level, true)}
                        disabled={loading}
                        className="mt-2 w-full bg-yellow text-ink px-2 py-1 font-cn text-xs font-bold shadow-[2px_2px_0_#1a1a1a] hover:bg-ink hover:text-yellow transition-colors active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:active:translate-x-0 disabled:active:translate-y-0 disabled:active:shadow-[2px_2px_0_#1a1a1a] disabled:opacity-50"
                      >
                        领取
                      </button>
                    )}
                    {reward.premiumClaimed && (
                      <p className="mt-2 font-mono text-xs text-ink/60 font-bold bg-mint/20 px-2 py-1 rounded inline-block shadow-[1px_1px_0_#1a1a1a]">✓ 已领取</p>
                    )}
                    {!seasonPass.isPremium && (
                      <p className="mt-2 font-mono text-xs text-ink/50">需高级通行证</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}