import { useState, useEffect } from 'react';
import { useUserStore } from '@/stores/user-store';
import PressureRadar from '@/components/PressureRadar';
import { getPressureStats, type PressureData } from '@/api/pressure';
import { logger } from '@/utils/logger';

type Tab = 'home' | 'idle' | 'battle' | 'records' | 'profile';

interface HomePageProps {
  onEnterIdle: () => void;
  onEnterBattle: () => void;
  onNavigate: (page: string) => void;
}

function HomePage({ onEnterIdle, onEnterBattle, onNavigate }: HomePageProps) {
  const user = useUserStore((s) => s.user);
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [pressure, setPressure] = useState<PressureData>({
    work: 50, life: 50, social: 50, finance: 50, health: 50, hasData: false,
  });

  useEffect(() => {
    // 加 cancelled 守卫避免组件卸载后 setState；错误记录日志便于排查
    // 设计原因:原 .catch(() => {}) 静默吞错，压力数据加载失败时开发者无法从控制台定位问题
    // 改为 logger.error 统一记录，与 achievements/friends/tasks 等页面日志模式一致
    let cancelled = false;
    getPressureStats()
      .then((data) => {
        if (!cancelled) setPressure(data);
      })
      .catch((err) => {
        logger.error('加载压力数据失败', err);
      });
    return () => { cancelled = true; };
  }, []);

  const handleTabClick = (tab: Tab) => {
    setActiveTab(tab);
    // URL 同步交由 App.tsx navigateTo 统一处理（onNavigate → navigateTo → pushState）
    // 设计原因：原实现先 pushState 再 onNavigate（内部又 pushState），双重历史条目导致
    // 用户按返回键需按两次才能回上一页，且中间一次 URL 不变看似无响应
    onNavigate(tab === 'battle' ? 'lobby' : tab);
  };

  return (
    <div className="min-h-screen flex flex-col max-w-2xl mx-auto scrollbar-brutal">
      <header role="banner" className="bg-ink text-cream px-4 sm:px-6 py-3 flex items-center gap-4 bg-glow-pink">
        <div className="w-12 h-12 rounded-full bg-pink flex items-center justify-center font-bold text-lg ring-3 ring-cream/20">
          {user?.nickname?.[0] ?? '游'}
        </div>
        <div className="flex-1">
          <p className="font-cn text-lg">{user?.nickname ?? '冒险者'}</p>
          <p className="font-mono text-xs text-cream/60">
            Lv.{user?.level ?? 1} · {user?.exp ?? 0} EXP
          </p>
        </div>
        <div className="flex items-center gap-2 bg-ink/40 px-3 py-1.5 rounded-full ring-1 ring-cream/15">
          <span aria-hidden="true" className="text-yellow">💰</span>
          <span className="font-mono text-sm">{user?.coins ?? 0}</span>
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6 flex flex-col gap-4 sm:gap-6">
        {/* 雷达卡片：背景叠加圆点网格 + 对角条纹增加氛围层次 */}
        <section
          aria-label="压力分布"
          className="bg-ink text-cream p-4 sm:p-6 rounded-lg relative overflow-hidden animate-stagger"
        >
          <div className="absolute inset-0 bg-dots opacity-50 pointer-events-none" aria-hidden="true" />
          <div className="absolute inset-0 bg-stripes opacity-30 pointer-events-none" aria-hidden="true" />
          <div className="relative">
            <p className="font-cn text-lg mb-3 text-center">压力分布雷达</p>
            <div className="flex justify-center">
              <PressureRadar data={pressure} size={240} />
            </div>
          </div>
        </section>

        {/* 主入口双按钮：交错入场，添加 active 按下更深一档 */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <button
            aria-label="进入挂机空间"
            onClick={onEnterIdle}
            className="bg-pink text-cream p-4 sm:p-6 rounded-lg shadow-[4px_4px_0_#1a1a1a] hover:shadow-[2px_2px_0_#1a1a1a] hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all flex flex-col items-center justify-center gap-2 animate-stagger delay-100"
          >
            <span aria-hidden="true" className="text-4xl">🎮</span>
            <span className="font-cn text-2xl">挂机空间</span>
            <span className="font-mono text-xs text-cream/70">放置养成</span>
          </button>

          <button
            aria-label="进入对战大厅"
            onClick={onEnterBattle}
            className="bg-mint text-ink p-4 sm:p-6 rounded-lg shadow-[4px_4px_0_#1a1a1a] hover:shadow-[2px_2px_0_#1a1a1a] hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all flex flex-col items-center justify-center gap-2 animate-stagger delay-200"
          >
            <span aria-hidden="true" className="text-4xl">⚔️</span>
            <span className="font-cn text-2xl">对战大厅</span>
            <span className="font-mono text-xs text-ink/70">多人乱斗</span>
          </button>
        </div>

        {/* 快捷入口三联：交错入场 */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 animate-stagger delay-300">
          <div className="bg-yellow text-ink p-2 sm:p-3 rounded-lg text-center shadow-[3px_3px_0_#1a1a1a]">
            <p aria-hidden="true" className="text-xl mb-1">🎁</p>
            <p className="font-mono text-xs">每日奖励</p>
          </div>
          <div className="bg-orange text-cream p-2 sm:p-3 rounded-lg text-center shadow-[3px_3px_0_#1a1a1a]">
            <p aria-hidden="true" className="text-xl mb-1">🏆</p>
            <p className="font-mono text-xs">排行榜</p>
          </div>
          <div className="bg-pink text-cream p-2 sm:p-3 rounded-lg text-center shadow-[3px_3px_0_#1a1a1a]">
            <p aria-hidden="true" className="text-xl mb-1">📦</p>
            <p className="font-mono text-xs">武器库</p>
          </div>
        </div>

        {/* 更多功能网格：整体延迟入场，按钮加 card-hover 浮起反馈 */}
        <nav aria-label="更多功能" className="animate-stagger delay-400">
          <p className="font-cn text-sm text-ink/60 mb-2">更多功能</p>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <button
              aria-label="成就系统"
              onClick={() => onNavigate('achievements')}
              className="bg-cream border-3 border-ink p-2 sm:p-3 rounded-lg shadow-[4px_4px_0_#1a1a1a] hover:shadow-[2px_2px_0_#1a1a1a] hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all flex flex-col items-center gap-1 card-hover"
            >
              <span aria-hidden="true" className="text-xl">🏅</span>
              <span className="font-mono text-xs">成就</span>
            </button>
            <button
              aria-label="好友列表"
              onClick={() => onNavigate('friends')}
              className="bg-cream border-3 border-ink p-2 sm:p-3 rounded-lg shadow-[4px_4px_0_#1a1a1a] hover:shadow-[2px_2px_0_#1a1a1a] hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all flex flex-col items-center gap-1 card-hover"
            >
              <span aria-hidden="true" className="text-xl">👥</span>
              <span className="font-mono text-xs">好友</span>
            </button>
            <button
              aria-label="排行榜"
              onClick={() => onNavigate('leaderboard')}
              className="bg-cream border-3 border-ink p-2 sm:p-3 rounded-lg shadow-[4px_4px_0_#1a1a1a] hover:shadow-[2px_2px_0_#1a1a1a] hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all flex flex-col items-center gap-1 card-hover"
            >
              <span aria-hidden="true" className="text-xl">🏆</span>
              <span className="font-mono text-xs">排行榜</span>
            </button>
            <button
              aria-label="赛季通行证"
              onClick={() => onNavigate('season-pass')}
              className="bg-cream border-3 border-ink p-2 sm:p-3 rounded-lg shadow-[4px_4px_0_#1a1a1a] hover:shadow-[2px_2px_0_#1a1a1a] hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all flex flex-col items-center gap-1 card-hover"
            >
              <span aria-hidden="true" className="text-xl">🎖️</span>
              <span className="font-mono text-xs">通行证</span>
            </button>
            <button
              aria-label="商城"
              onClick={() => onNavigate('shop')}
              className="bg-cream border-3 border-ink p-2 sm:p-3 rounded-lg shadow-[4px_4px_0_#1a1a1a] hover:shadow-[2px_2px_0_#1a1a1a] hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all flex flex-col items-center gap-1 card-hover"
            >
              <span aria-hidden="true" className="text-xl">🛒</span>
              <span className="font-mono text-xs">商城</span>
            </button>
            <button
              aria-label="每日任务"
              onClick={() => onNavigate('tasks')}
              className="bg-cream border-3 border-ink p-2 sm:p-3 rounded-lg shadow-[4px_4px_0_#1a1a1a] hover:shadow-[2px_2px_0_#1a1a1a] hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all flex flex-col items-center gap-1 card-hover"
            >
              <span aria-hidden="true" className="text-xl">📋</span>
              <span className="font-mono text-xs">任务</span>
            </button>
          </div>
        </nav>
      </main>

      <nav aria-label="主导航" role="navigation" className="bg-ink text-cream px-2 sm:px-4 py-2 flex justify-around sticky bottom-0 border-t-3 border-pink/30">
        {[
          { key: 'home' as Tab, label: '主页', icon: '🏠' },
          { key: 'idle' as Tab, label: '挂机', icon: '⏰' },
          { key: 'battle' as Tab, label: '对战', icon: '⚔️' },
          { key: 'records' as Tab, label: '战绩', icon: '📊' },
          { key: 'profile' as Tab, label: '我的', icon: '👤' },
        ].map((item) => (
          <button
            key={item.key}
            aria-label={item.label}
            aria-current={activeTab === item.key ? 'page' : undefined}
            onClick={() => handleTabClick(item.key)}
            className={`flex flex-col items-center gap-1 px-3 py-1 rounded-md transition-all ${
              activeTab === item.key
                ? 'bg-pink text-cream shadow-[2px_2px_0_#1a1a1a] -translate-y-[1px]'
                : 'text-cream/60 hover:text-cream hover:bg-cream/10'
            }`}
          >
            <span aria-hidden="true" className="text-lg">{item.icon}</span>
            <span className="font-mono text-xs">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

export default HomePage;
