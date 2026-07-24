import { useState, useEffect } from 'react';
import { useUserStore } from '@/stores/user-store';
import PressureRadar from '@/components/PressureRadar';
import { getPressureStats, type PressureData } from '@/api/pressure';
import { logger } from '@/utils/logger';

type Tab = 'home' | 'idle' | 'battle' | 'records' | 'profile';

// 更多功能导航项配置：抽取为模块级常量集中维护
// 设计原因：原 6 个 button 结构同构（className/外层 div/文字 span 完全一致），仅 label/emoji/target/ariaLabel 4 个变量不同；
// 配置化后任一样式调整单点修改无需 6 处同步，新增导航项只需加一行配置
// ariaLabel 保留精确字面量（成就系统/好友列表/排行榜/赛季通行证/商城/每日任务），与 home.test.tsx aria-label 断言一致
const QUICK_NAV_ITEMS: ReadonlyArray<{
  label: string;
  emoji: string;
  target: string;
  ariaLabel: string;
}> = [
  { label: '成就', emoji: '🏅', target: 'achievements', ariaLabel: '成就系统' },
  { label: '好友', emoji: '👥', target: 'friends', ariaLabel: '好友列表' },
  { label: '排行榜', emoji: '🏆', target: 'leaderboard', ariaLabel: '排行榜' },
  { label: '通行证', emoji: '🎖️', target: 'season-pass', ariaLabel: '赛季通行证' },
  { label: '商城', emoji: '🛒', target: 'shop', ariaLabel: '商城' },
  { label: '任务', emoji: '📋', target: 'tasks', ariaLabel: '每日任务' },
];

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

  // 首页根容器：使用 llq.jpg 作为背景图，cover 保证铺满且居中裁切
  // bg-image-soft-mask 叠加 cream/75 半透明遮罩，降低背景图视觉噪声
  // 设计原因：原 llq.jpg 色彩繁复，与 Neo-brutalism 卡片硬边硬阴影风格冲突，
  // 卡片间隙处图片噪声分散注意力。遮罩保留氛围暗示但让卡片层次回到主导地位
  return (
    <div className="min-h-screen flex flex-col max-w-2xl mx-auto scrollbar-brutal bg-[url('/llq.jpg')] bg-cover bg-center bg-image-soft-mask">
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
            <div className="text-center mb-3">
              {/* 标题左右装饰线增强"雷达/仪表"科技感，纯样式装饰 */}
              <div className="flex items-center justify-center gap-2 mb-1">
                <span className="h-px w-8 bg-cream/30" aria-hidden="true" />
                <p className="font-cn text-xl">压力分布雷达</p>
                <span className="h-px w-8 bg-cream/30" aria-hidden="true" />
              </div>
              <p className="font-mono text-xs text-cream/60">实时监测多维情绪压力</p>
            </div>
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
            className="bg-pink text-cream p-4 sm:p-6 rounded-lg shadow-[4px_4px_0_#1a1a1a] hover:shadow-[2px_2px_0_#1a1a1a] hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all flex flex-col items-center justify-center gap-2 animate-stagger delay-100 group"
          >
            {/* emoji 加 group-hover 放大，与 shop 商品卡片交互一致，提升主入口按钮的微交互反馈 */}
            <span aria-hidden="true" className="text-4xl transition-transform group-hover:scale-110">🎮</span>
            <span className="font-cn text-2xl">挂机空间</span>
            <span className="font-mono text-xs text-cream/70">放置养成</span>
          </button>

          <button
            aria-label="进入对战大厅"
            onClick={onEnterBattle}
            className="bg-mint text-ink p-4 sm:p-6 rounded-lg shadow-[4px_4px_0_#1a1a1a] hover:shadow-[2px_2px_0_#1a1a1a] hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all flex flex-col items-center justify-center gap-2 animate-stagger delay-200 group"
          >
            <span aria-hidden="true" className="text-4xl transition-transform group-hover:scale-110">⚔️</span>
            <span className="font-cn text-2xl">对战大厅</span>
            <span className="font-mono text-xs text-ink/70">多人乱斗</span>
          </button>
        </div>

        {/* 快捷入口三联：装饰性展示卡，无 onClick 不挂 card-hover 避免伪交互误导
            设计原因：这 3 张卡片（每日奖励/排行榜/武器库）为概览展示，无点击行为；
            原挂 card-hover 后 hover 浮起效果暗示"可点击"但实际无响应，造成认知断层。
            改为静态展示：阴影从 3px 减至 2px 降低"可按下"视觉权重，移除 card-hover，
            让真正的可交互入口（下方 6 个按钮卡片）独占交互预期 */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 animate-stagger delay-300">
          <div className="bg-yellow text-ink p-2 sm:p-3 rounded-lg text-center shadow-[2px_2px_0_#1a1a1a]">
            <p aria-hidden="true" className="text-xl mb-1">🎁</p>
            <p className="font-mono text-xs">每日奖励</p>
          </div>
          <div className="bg-orange text-cream p-2 sm:p-3 rounded-lg text-center shadow-[2px_2px_0_#1a1a1a]">
            <p aria-hidden="true" className="text-xl mb-1">🏆</p>
            <p className="font-mono text-xs">排行榜</p>
          </div>
          <div className="bg-pink text-cream p-2 sm:p-3 rounded-lg text-center shadow-[2px_2px_0_#1a1a1a]">
            <p aria-hidden="true" className="text-xl mb-1">📦</p>
            <p className="font-mono text-xs">武器库</p>
          </div>
        </div>

        {/* 更多功能网格：整体延迟入场，按钮加 card-hover 浮起反馈 */}
        <nav aria-label="更多功能" className="animate-stagger delay-400">
          <p className="font-cn text-sm text-ink/60 mb-2">更多功能</p>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {QUICK_NAV_ITEMS.map((item) => (
              <button
                key={item.target}
                aria-label={item.ariaLabel}
                onClick={() => onNavigate(item.target)}
                className="bg-cream border-3 border-ink p-2 sm:p-3 rounded-lg shadow-[4px_4px_0_#1a1a1a] hover:shadow-[2px_2px_0_#1a1a1a] hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all flex flex-col items-center gap-1 card-hover"
              >
                {/* emoji 加圆形背景给视觉重量，与挂机页武器/技能/宠物、商店页商品/背包、成就页状态 emoji 视觉模式一致
                    更多功能按钮无状态差异，统一用 ink/5 中性底；w-10 h-10 比挂机页 w-12 小一档适配紧凑布局 */}
                <div className="w-10 h-10 rounded-full bg-ink/5 flex items-center justify-center">
                  <span aria-hidden="true" className="text-xl">{item.emoji}</span>
                </div>
                <span className="font-mono text-xs">{item.label}</span>
              </button>
            ))}
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
            className={`flex flex-col items-center gap-1 px-3 py-1 rounded-md transition-all relative ${
              activeTab === item.key
                ? 'bg-pink text-cream shadow-[2px_2px_0_#ffd93d] -translate-y-[1px] nav-active-dot'
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
