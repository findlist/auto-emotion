import { useCallback, useEffect, useRef, useState } from 'react';
import { useUserStore } from '@/stores/user-store';
import { leaderboardApi, type LeaderboardEntry, type LeaderboardType } from '@/api/leaderboard';
import { logger } from '@/utils/logger';
import { handleTabKeyDown } from '@/utils/a11y';

interface LeaderboardPageProps {
  onBack: () => void;
}

const TAB_CONFIG: Array<{ key: LeaderboardType; label: string; emoji: string }> = [
  { key: 'power', label: '战力榜', emoji: '💪' },
  { key: 'battle', label: '对战榜', emoji: '⚔️' },
  { key: 'speed', label: '速度榜', emoji: '⚡' },
  { key: 'friends', label: '好友榜', emoji: '👥' },
];

export default function LeaderboardPage({ onBack }: LeaderboardPageProps) {
  const user = useUserStore((s) => s.user);

  const [activeTab, setActiveTab] = useState<LeaderboardType>('power');
  const [ranking, setRanking] = useState<LeaderboardEntry[]>([]);
  const [userRank, setUserRank] = useState<{ rank: number; score: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;
  // 请求序号守卫：每次 loadData 递增，await 后比对序号丢弃过期请求结果
  // 设计原因：用户快速切换 tab 或翻页时，旧请求可能后返回覆盖新数据导致显示错乱
  const requestIdRef = useRef(0);

  // 加载排行榜数据：useCallback 保证引用稳定，依赖 activeTab/page 变化时重建
  // 设计原因：原函数声明在 useEffect 内引用触发 react-hooks/exhaustive-deps 警告，
  // useCallback 让函数引用显式纳入依赖数组，符合 React 19 严格模式要求
  const loadData = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    try {
      setLoading(true);
      const apiMap = {
        power: leaderboardApi.getPower,
        battle: leaderboardApi.getBattle,
        speed: leaderboardApi.getSpeed,
        friends: leaderboardApi.getFriends,
      };

      const result = await apiMap[activeTab](page, pageSize);
      // 旧请求后返回则丢弃，避免覆盖最新 tab 数据
      if (requestId !== requestIdRef.current) return;
      setRanking(result.ranking);
      setTotal(result.total);

      // 获取个人排名
      try {
        const rank = await leaderboardApi.getUserRank(activeTab);
        if (requestId !== requestIdRef.current) return;
        setUserRank(rank);
      } catch {
        if (requestId !== requestIdRef.current) return;
        setUserRank(null);
      }
    } catch (err) {
      logger.error('加载排行榜失败', err);
    } finally {
      // 仅最新请求可重置 loading，避免旧请求错误清除新请求的 loading 状态
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [activeTab, page, pageSize]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Top3 返回对应 medal 类名，其余返回普通底色
  function getRankStyle(rank: number) {
    if (rank === 1) return 'medal-gold text-ink';
    if (rank === 2) return 'medal-silver text-ink';
    if (rank === 3) return 'medal-bronze text-cream';
    return 'bg-cream text-ink';
  }

  // Top3 行加差异化背景色，突出前三名视觉层次
  function getRowStyle(rank: number, isMe: boolean) {
    if (isMe) return 'bg-yellow/20 border-yellow';
    if (rank === 1) return 'bg-yellow/10 border-yellow';
    if (rank === 2) return 'bg-gray-100 border-gray-400';
    if (rank === 3) return 'bg-amber-50 border-amber-600';
    return 'bg-cream border-ink';
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col max-w-2xl mx-auto">
      {/* 顶部导航：bg-glow-pink 增加深色头部氛围层次 */}
      <header className="bg-ink text-cream px-4 py-3 flex items-center gap-4 bg-glow-pink">
        {/* 返回按钮放大并加 hover 背景区块 */}
        <button
          onClick={onBack}
          aria-label="返回"
          className="w-9 h-9 flex items-center justify-center text-cream text-xl hover:bg-cream/10 rounded-lg transition-colors"
        >
          ←
        </button>
        <h1 className="font-cn text-lg font-bold drop-shadow-[2px_2px_0_rgba(255,61,127,0.4)]">排行榜</h1>
      </header>

      {/* Tab 切换：WAI-ARIA tab 语义，border-b-3 + 激活态阴影增强层次 */}
      <div role="tablist" aria-label="排行榜类型" className="flex border-b-3 border-ink overflow-x-auto scrollbar-brutal"
        onKeyDown={(e) => handleTabKeyDown(e, TAB_CONFIG.map((t) => t.key), activeTab, (k) => { setActiveTab(k as LeaderboardType); setPage(1); })}>
        {TAB_CONFIG.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            aria-controls="leaderboard-panel"
            id={`leaderboard-tab-${tab.key}`}
            onClick={() => { setActiveTab(tab.key); setPage(1); }}
            className={`flex-1 min-w-[80px] py-3 px-2 font-cn font-bold transition-all flex flex-col items-center gap-1 ${
              activeTab === tab.key
                ? 'bg-mint text-ink -mb-[3px] border-b-3 border-ink shadow-[2px_2px_0_#1a1a1a]'
                : 'bg-cream text-ink/70 hover:bg-mint/20'
            }`}
          >
            {/* Tab emoji 与后跟 tab.label 文字语义重复，aria-hidden 屏蔽装饰图标 */}
            <span className="text-xl" aria-hidden="true">{tab.emoji}</span>
            <span className="text-xs">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* 个人排名：加 border-b 增强分隔层次，数值加色加粗 */}
      {userRank && (
        <div className="bg-pink text-cream px-4 py-3 flex items-center justify-between border-b-2 border-ink">
          <span className="font-cn">我的排名</span>
          <div className="flex items-center gap-4">
            <span className="font-mono font-bold">第 <span className="text-yellow text-lg">{userRank.rank}</span> 名</span>
            <span className="font-mono font-bold"><span className="text-yellow text-lg">{userRank.score}</span> 分</span>
          </div>
        </div>
      )}

      {/* 排行榜：role=tabpanel 关联当前激活的 tab，屏幕阅读器切换 tab 时自动定位内容区
          aria-live=polite + aria-atomic=true：切换 tab/翻页导致榜单整体替换时，
          屏幕阅读器在空闲时播报完整新榜单，视障用户无需手动定位即可感知排名变化 */}
      <main role="tabpanel" id="leaderboard-panel" aria-labelledby={`leaderboard-tab-${activeTab}`} aria-live="polite" aria-atomic="true" className="flex-1 p-4 overflow-auto scrollbar-brutal">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10">
            <div className="w-10 h-10 border-4 border-ink border-t-pink rounded-full animate-spin" />
            <p className="font-mono text-sm text-ink/60">加载排名中...</p>
          </div>
        ) : ranking.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-12">
            {/* 装饰性 emoji 与后跟文字语义重复，aria-hidden 屏蔽避免冗余朗读 */}
            <span className="text-5xl animate-bounce-slow" aria-hidden="true">🏆</span>
            <div className="text-center">
              <p className="font-cn text-lg text-ink">暂无数据</p>
              <p className="font-mono text-sm text-ink/50 mt-1">排行榜还在统计中，稍后再来看看吧</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {ranking.map((entry, idx) => (
              <div
                key={entry.userId}
                className={`border-2 p-3 shadow-[3px_3px_0_#1a1a1a] card-hover animate-stagger ${getRowStyle(entry.rank, String(entry.userId) === String(user?.id))}`}
                style={{ animationDelay: `${idx * 40}ms` }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-mono font-bold text-sm ${getRankStyle(
                      entry.rank
                    )} ${entry.rank === 1 ? 'animate-badge-pulse' : ''}`}
                  >
                    {entry.rank}
                  </div>
                  <div className="flex-1">
                    <p className="font-cn text-ink font-bold">
                      {entry.nickname}
                      {String(entry.userId) === String(user?.id) && (
                        <span className="ml-2 text-xs text-pink bg-pink/10 px-1.5 py-0.5 rounded">(我)</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-ink font-bold text-lg">{entry.score}</p>
                    <p className="font-mono text-xs text-ink/60">分</p>
                  </div>
                </div>
              </div>
            ))}

            {/* 分页：按钮加阴影与按下效果 */}
            {total > pageSize && (
              <div className="flex justify-center items-center gap-4 pt-4">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="bg-ink text-cream px-4 py-2 font-cn shadow-[3px_3px_0_#1a1a1a] hover:bg-pink transition-colors active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:active:translate-x-0 disabled:active:translate-y-0 disabled:active:shadow-[3px_3px_0_#1a1a1a] disabled:opacity-50"
                >
                  上一页
                </button>
                <span className="py-2 font-mono text-ink bg-cream border-2 border-ink px-3 shadow-[2px_2px_0_#1a1a1a]">
                  {page} / {Math.ceil(total / pageSize)}
                </span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= Math.ceil(total / pageSize)}
                  className="bg-ink text-cream px-4 py-2 font-cn shadow-[3px_3px_0_#1a1a1a] hover:bg-pink transition-colors active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:active:translate-x-0 disabled:active:translate-y-0 disabled:active:shadow-[3px_3px_0_#1a1a1a] disabled:opacity-50"
                >
                  下一页
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}