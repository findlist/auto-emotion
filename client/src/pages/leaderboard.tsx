import { useCallback, useEffect, useRef, useState } from 'react';
import { useUserStore } from '@/stores/user-store';
import { leaderboardApi, type LeaderboardEntry, type LeaderboardType } from '@/api/leaderboard';
import { logger } from '@/utils/logger';

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

  function getRankStyle(rank: number) {
    if (rank === 1) return 'bg-yellow text-ink';
    if (rank === 2) return 'bg-gray-300 text-ink';
    if (rank === 3) return 'bg-amber-700 text-cream';
    return 'bg-cream text-ink';
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col max-w-2xl mx-auto">
      {/* 顶部导航 */}
      <header className="bg-ink text-cream px-4 py-3 flex items-center gap-4">
        {/* 返回按钮仅含箭头符号，aria-label 提供语义避免屏幕阅读器朗读"左箭头" */}
        <button onClick={onBack} aria-label="返回" className="text-cream hover:text-yellow transition-colors">
          ←
        </button>
        <h1 className="font-cn text-lg font-bold">排行榜</h1>
      </header>

      {/* Tab 切换：WAI-ARIA tab 语义让屏幕阅读器正确识别为标签页界面
          设计原因：role=tablist/tab/tabpanel + aria-selected/controls/labelled
          构成完整 tab 语义。保留所有 tab 的默认 button 可聚焦性（不加 roving
          tabindex），避免引入箭头键导航的复杂度，是安全增量改进 */}
      <div role="tablist" aria-label="排行榜类型" className="flex border-b-2 border-ink overflow-x-auto">
        {TAB_CONFIG.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            aria-controls="leaderboard-panel"
            id={`leaderboard-tab-${tab.key}`}
            onClick={() => { setActiveTab(tab.key); setPage(1); }}
            className={`flex-1 min-w-[80px] py-3 px-2 font-cn font-bold transition-colors flex flex-col items-center gap-1 ${
              activeTab === tab.key ? 'bg-mint text-ink' : 'bg-cream text-ink/70'
            }`}
          >
            {/* Tab emoji 与后跟 tab.label 文字语义重复，aria-hidden 屏蔽装饰图标 */}
            <span className="text-xl" aria-hidden="true">{tab.emoji}</span>
            <span className="text-xs">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* 个人排名 */}
      {userRank && (
        <div className="bg-pink text-cream px-4 py-3 flex items-center justify-between">
          <span className="font-cn">我的排名</span>
          <div className="flex items-center gap-4">
            <span className="font-mono">第 {userRank.rank} 名</span>
            <span className="font-mono">{userRank.score} 分</span>
          </div>
        </div>
      )}

      {/* 排行榜：role=tabpanel 关联当前激活的 tab，屏幕阅读器切换 tab 时自动定位内容区 */}
      <main role="tabpanel" id="leaderboard-panel" aria-labelledby={`leaderboard-tab-${activeTab}`} className="flex-1 p-4 overflow-auto">
        {loading ? (
          <div className="text-center py-8">
            <p className="font-cn text-ink/70">加载中...</p>
          </div>
        ) : ranking.length === 0 ? (
          <div className="text-center py-8">
            {/* 装饰性 emoji 与后跟文字语义重复，aria-hidden 屏蔽避免冗余朗读 */}
            <p className="text-4xl mb-4"><span aria-hidden="true">🏆</span></p>
            <p className="font-cn text-ink/70">暂无数据</p>
          </div>
        ) : (
          <div className="space-y-2">
            {ranking.map((entry) => (
              <div
                key={entry.userId}
                className={`border-2 border-ink p-3 shadow-[3px_3px_0_#1a1a1a] ${
                  entry.userId === user?.id ? 'bg-yellow/20' : 'bg-cream'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-mono font-bold ${getRankStyle(
                      entry.rank
                    )}`}
                  >
                    {entry.rank}
                  </div>
                  <div className="flex-1">
                    <p className="font-cn text-ink font-bold">
                      {entry.nickname}
                      {entry.userId === user?.id && (
                        <span className="ml-2 text-xs text-pink">(我)</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-ink font-bold">{entry.score}</p>
                    <p className="font-mono text-xs text-ink/60">分</p>
                  </div>
                </div>
              </div>
            ))}

            {/* 分页 */}
            {total > pageSize && (
              <div className="flex justify-center gap-4 pt-4">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="bg-ink text-cream px-4 py-2 font-cn disabled:opacity-50 hover:bg-pink transition-colors"
                >
                  上一页
                </button>
                <span className="py-2 font-mono text-ink">
                  {page} / {Math.ceil(total / pageSize)}
                </span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= Math.ceil(total / pageSize)}
                  className="bg-ink text-cream px-4 py-2 font-cn disabled:opacity-50 hover:bg-pink transition-colors"
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