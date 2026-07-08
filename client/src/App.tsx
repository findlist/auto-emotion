import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useUserStore } from '@/stores/user-store';
import { useRoomStore } from '@/stores/room-store';
import { useShallow } from 'zustand/react/shallow';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import Loading from '@/components/Loading';
import type { GameMode } from '@/types/game';

// 路由级懒加载：将每个页面拆为独立 chunk
// 设计原因：原静态 import 导致 15 个页面 + PixiJS 全部打入 index.js（737kB 超 500kB 警告阈值）。
// 改为 lazy 后，首屏仅加载当前路由 chunk，PixiJS（仅 battle/demo 使用）随 BattlePage/DemoPage 拆出主包，
// 显著降低首屏 JS 体积，同时消除 vite chunk 体积警告。
const DemoPage = lazy(() => import('@/pages/demo'));
const HomePage = lazy(() => import('@/pages/home'));
const LoginPage = lazy(() => import('@/pages/login'));
const RegisterPage = lazy(() => import('@/pages/register'));
const IdlePage = lazy(() => import('@/pages/idle'));
const LobbyPage = lazy(() => import('@/pages/lobby'));
const RoomPage = lazy(() => import('@/pages/room'));
const BattlePage = lazy(() => import('@/pages/battle'));
const RecordsPage = lazy(() => import('@/pages/records'));
const AchievementsPage = lazy(() => import('@/pages/achievements'));
const FriendsPage = lazy(() => import('@/pages/friends'));
const LeaderboardPage = lazy(() => import('@/pages/leaderboard'));
const SeasonPassPage = lazy(() => import('@/pages/season-pass'));
const ShopPage = lazy(() => import('@/pages/shop'));
const TasksPage = lazy(() => import('@/pages/tasks'));

type Page = 'home' | 'demo' | 'login' | 'register' | 'profile' | 'idle' | 'lobby' | 'room' | 'battle' | 'records' | 'achievements' | 'friends' | 'leaderboard' | 'season-pass' | 'shop' | 'tasks';

// 单一映射源：Page → 路径，新增页面只需在此处添加一项
// 设计原因：原 pathToPage（15 个 if 分支）与 navigateTo 内 pathMap（15 项 Record）需手动保持同步，
// 新增页面易遗漏一处。合并为单一 PAGE_PATHS 后，PATH_TO_PAGE 反向映射自动派生，消除重复
const PAGE_PATHS: Record<Page, string> = {
  home: '/',
  login: '/login',
  register: '/register',
  profile: '/profile',
  demo: '/demo',
  idle: '/idle',
  lobby: '/lobby',
  room: '/room',
  battle: '/battle',
  records: '/records',
  achievements: '/achievements',
  friends: '/friends',
  leaderboard: '/leaderboard',
  'season-pass': '/season-pass',
  shop: '/shop',
  tasks: '/tasks',
};

// 反向映射：路径 → Page，从 PAGE_PATHS 派生，供初始加载与 popstate（浏览器返回/前进）共用
const PATH_TO_PAGE: Record<string, Page> = Object.fromEntries(
  Object.entries(PAGE_PATHS).map(([page, path]) => [path, page as Page]),
);

// 路径 → Page 纯函数，仅读取 pathname 查表，无组件状态依赖，可安全在多处调用
const pathToPage = (path: string): Page => PATH_TO_PAGE[path] ?? 'home';

function App() {
  const user = useUserStore((s) => s.user);
  const restored = useUserStore((s) => s.restored);
  const restore = useUserStore((s) => s.restore);
  const logout = useUserStore((s) => s.logout);
  // useShallow 浅比较返回字段，避免 store 任意字段变化时创建新对象触发不必要重渲染
  const roomStore = useRoomStore(useShallow((s) => ({
    roomId: s.roomId,
    mode: s.mode,
  })));

  // 对战页面状态，从 room-store 同步
  // 设计原因:mode 类型与 room-store/GameMode 对齐,避免传入 BattlePage 时 as any 断言
  const [battleState, setBattleState] = useState<{ roomId: string; mode: GameMode }>({
    roomId: '',
    mode: 'boss',
  });

  useEffect(() => {
    void restore();
  }, [restore]);

  const [page, setPage] = useState<Page>(() => pathToPage(window.location.pathname));

  // 监听浏览器返回/前进按钮，同步 page 状态
  // 设计原因：navigateTo 用 pushState 更新 URL，但浏览器返回键触发 popstate 时
  // page state 不会自动更新，导致 URL 变了但页面不变，返回键完全失效。
  // 监听 popstate 重新读取 pathname 同步 page，恢复浏览器导航能力。
  // pathToPage 是模块级纯函数引用稳定，空依赖数组即可
  useEffect(() => {
    const handlePopState = () => {
      setPage(pathToPage(window.location.pathname));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = useCallback((newPage: Page) => {
    setPage(newPage);
    window.history.pushState({}, '', PAGE_PATHS[newPage]);
  }, []);

  const handleLoginSuccess = () => {
    navigateTo('home');
  };

  const handleRegisterSuccess = () => {
    navigateTo('login');
  };

  const handleLogout = async () => {
    await logout();
    navigateTo('login');
  };

  // 进入对战：从 room-store 同步房间信息到 battleState 并跳转
  // 设计原因：原为内联箭头函数传给 RoomPage.onGameStart，每次 App 重渲染都创建新引用。
  // RoomPage 在 useEffect deps 中引用 onGameStart，新引用会触发 effect 重复执行
  // （status === 'playing' 时反复调用 onGameStart 导致误跳转）。useCallback 稳定引用，
  // 仅在真实依赖（roomId/mode/navigateTo）变化时更新，符合 React 数据流规范
  const handleGameStart = useCallback(() => {
    setBattleState({
      roomId: roomStore.roomId ?? '',
      mode: roomStore.mode,
    });
    navigateTo('battle');
  }, [roomStore.roomId, roomStore.mode, navigateTo]);

  // 未登录守卫：重定向到登录页并同步 URL
  // 设计原因：原实现在 renderPage 内调用 navigateTo（setState + pushState），
  // 违反 React 渲染期间不应有副作用的原则，StrictMode 双重渲染会调用两次 pushState。
  // 移到 useEffect 后副作用与渲染分离，renderPage 仅负责渲染 LoginPage 避免空白闪烁。
  // restored 守卫：restore 是异步的，初始 user=null 期间若直接跳转会把已登录用户误踢到登录页。
  // 等待 restored=true 后再判定，确保仅真正未登录用户才跳转
  useEffect(() => {
    if (!restored) return;
    if (!user && page !== 'demo' && page !== 'login' && page !== 'register') {
      navigateTo('login');
    }
  }, [restored, user, page, navigateTo]);

  const renderPage = () => {
    // restore 未完成期间渲染全局 Loading，避免守卫 effect 误跳登录页 + 避免空白闪烁
    if (!restored) {
      return <Loading text="恢复登录态中..." />;
    }

    if (page === 'login') {
      return (
        <LoginPage
          onNavigateToRegister={() => navigateTo('register')}
          onLoginSuccess={handleLoginSuccess}
        />
      );
    }

    if (page === 'register') {
      return (
        <RegisterPage
          onNavigateToLogin={() => navigateTo('login')}
          onRegisterSuccess={handleRegisterSuccess}
        />
      );
    }

    // 未登录守卫：除 demo 外都渲染 LoginPage（useEffect 会同步 URL 到 /login）
    // 渲染 LoginPage 而非 return null 避免空白闪烁，URL 同步由上方 useEffect 处理
    if (!user && page !== 'demo') {
      return (
        <LoginPage
          onNavigateToRegister={() => navigateTo('register')}
          onLoginSuccess={handleLoginSuccess}
        />
      );
    }

    if (page === 'profile') {
      return (
        <div className="min-h-screen flex flex-col">
          <header className="bg-ink text-cream px-4 py-3 flex items-center gap-4">
            <button
              onClick={() => navigateTo('home')}
              className="text-cream/60 hover:text-cream"
            >
              ← 返回
            </button>
            <h1 className="font-cn text-lg">个人资料</h1>
          </header>
          <main className="flex-1 p-4">
            <div className="bg-cream border-4 border-ink shadow-[6px_6px_0_#1a1a1a] p-6">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-20 h-20 rounded-full bg-pink flex items-center justify-center text-3xl font-bold text-cream">
                  {user?.nickname?.[0] ?? '游'}
                </div>
                <div>
                  <p className="font-cn text-2xl">{user?.nickname}</p>
                  <p className="font-mono text-sm text-ink/60">Lv.{user?.level ?? 1}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 font-mono text-sm">
                <div className="bg-ink/5 p-3">
                  <p className="text-ink/60">经验值</p>
                  <p className="text-lg font-bold">{user?.exp ?? 0}</p>
                </div>
                <div className="bg-ink/5 p-3">
                  <p className="text-ink/60">金币</p>
                  <p className="text-lg font-bold text-yellow">{user?.coins ?? 0}</p>
                </div>
                <div className="bg-ink/5 p-3">
                  <p className="text-ink/60">PVP积分</p>
                  <p className="text-lg font-bold text-pink">{user?.pvp_points ?? 0}</p>
                </div>
                <div className="bg-ink/5 p-3">
                  <p className="text-ink/60">战斗力</p>
                  <p className="text-lg font-bold text-mint">{user?.power ?? 0}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full mt-6 bg-pink text-cream px-6 py-3 font-mono text-sm font-bold tracking-wider hover:bg-ink transition-colors"
              >
                退出登录
              </button>
            </div>
          </main>
        </div>
      );
    }

    if (page === 'demo') {
      return <DemoPage onBack={() => navigateTo('home')} />;
    }

    if (page === 'idle') {
      return <IdlePage onBack={() => navigateTo('home')} />;
    }

    if (page === 'lobby') {
      return <LobbyPage onEnterRoom={() => navigateTo('room')} />;
    }

    if (page === 'room') {
      return (
        <RoomPage
          onBack={() => navigateTo('lobby')}
          onGameStart={handleGameStart}
        />
      );
    }

    if (page === 'battle') {
      return (
        <BattlePage
          roomId={battleState.roomId}
          nickname={user?.nickname ?? '未知'}
          mode={battleState.mode}
          onBack={() => navigateTo('lobby')}
        />
      );
    }

    if (page === 'records') {
      return <RecordsPage />;
    }

    if (page === 'achievements') {
      return <AchievementsPage onBack={() => navigateTo('home')} />;
    }

    if (page === 'friends') {
      return <FriendsPage onBack={() => navigateTo('home')} />;
    }

    if (page === 'leaderboard') {
      return <LeaderboardPage onBack={() => navigateTo('home')} />;
    }

    if (page === 'season-pass') {
      return <SeasonPassPage onBack={() => navigateTo('home')} />;
    }

    if (page === 'shop') {
      return <ShopPage onBack={() => navigateTo('home')} />;
    }

    if (page === 'tasks') {
      return <TasksPage onBack={() => navigateTo('home')} />;
    }

    return (
      <HomePage
        onEnterIdle={() => navigateTo('idle')}
        onEnterBattle={() => navigateTo('lobby')}
        onNavigate={(page) => navigateTo(page as Page)}
      />
    );
  };

  return (
    <ErrorBoundary>
      {/* 跳过链接：键盘用户首次 Tab 聚焦时显示，回车跳过导航直达主内容
          设计原因：每页 header + 导航按钮重复 Tab 负担大，遵循 WAI-ARIA skip link 模式 */}
      <a href="#main-content" className="skip-link">跳到主内容</a>
      {/* id + tabIndex 让 skip link 锚点可编程聚焦，outline-none 避免容器自身显示焦点框 */}
      <div id="main-content" tabIndex={-1} className="outline-none">
        {/* Suspense 兜底懒加载 chunk 下载期间的占位，复用全局 Loading 组件保持视觉一致 */}
        <Suspense fallback={<Loading text="加载页面中..." />}>
          {renderPage()}
        </Suspense>
      </div>
    </ErrorBoundary>
  );
}

export default App;
