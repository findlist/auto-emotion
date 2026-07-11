import { useEffect, useRef, useState, useCallback } from 'react';
import type { Ticker } from 'pixi.js';
import { GameEngine } from '@/game/core/engine';
import { SceneManager } from '@/game/core/scene-manager';
import { AssetLoader } from '@/game/core/asset-loader';
import { BattleScene } from '@/game/scenes/battle-scene';
import type { EffectTier } from '@/game/effects/particle';
import Loading from '@/components/Loading';
import { getSocket, roomActions } from '@/websocket';
import { useUserStore } from '@/stores/user-store';
import { logger } from '@/utils/logger';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

/** 游戏模式 */
type GameMode = 'boss' | 'brawl' | 'speed';

/** 档位中文标签 */
const TIER_LABEL: Record<EffectTier, string> = {
  low: '低档',
  mid: '中档',
  high: '高档',
};

/** 模式中文名 */
const MODE_LABEL: Record<GameMode, string> = {
  boss: 'Boss 组队战',
  brawl: '自由乱斗',
  speed: '手速竞速',
};

interface BattlePageProps {
  roomId: string;
  nickname: string;
  mode: GameMode;
  onBack: () => void;
}

/** 玩家分数：字段名与后端 room.players / game:score-update payload 对齐为 userId */
interface PlayerScore {
  userId: string;
  nickname: string;
  score: number;
}

/** 结算弹窗状态：MVP 由 finalScores 排序后取首名，无需单独字段 */
interface SettlementData {
  show: boolean;
  finalScores: PlayerScore[];
}

/** AI 生成的关卡数据 */
interface LevelReadyData {
  monster: {
    name: string;
    hp: number;
    attack: number;
    skills: string[];
    emotion: string;
  };
  level: {
    destructibles: Array<{ type: string; x: number; y: number; hp: number }>;
    spawnPoints: Array<{ x: number; y: number }>;
    bossPoint: { x: number; y: number };
  };
  events: Array<{ type: string; description: string; effect: string }>;
}

/** 后端 room:state 推送的房间玩家结构 */
interface RoomPlayer {
  userId: string;
  nickname: string;
  socketId: string;
  isReady: boolean;
}

function BattlePage({ roomId, nickname, mode, onBack }: BattlePageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const sceneManagerRef = useRef<SceneManager | null>(null);
  const assetsRef = useRef<AssetLoader | null>(null);
  const battleSceneRef = useRef<BattleScene | null>(null);
  const tickerCallbackRef = useRef<((ticker: Ticker) => void) | null>(null);
  // 同步 players 到 ref，供 socket 回调闭包读取最新值，避免闭包捕获旧 state
  const playersRef = useRef<PlayerScore[]>([]);
  // nickname 用 ref 存储，避免 nickname 变化触发主 useEffect 重建（销毁游戏引擎+场景+socket 监听）
  // nickname 仅用于 emit room:join，无需在变化时重建整个对战流程（M-19 修复）
  const nicknameRef = useRef(nickname);
  useEffect(() => { nicknameRef.current = nickname; }, [nickname]);
  // 延迟离开房间的定时器引用：StrictMode 开发环境下 effect 执行顺序为 mount→cleanup→mount，
  // cleanup 中若直接 leaveRoom 会导致后端房间状态混乱（离开后立即重新加入）。
  // 用 setTimeout 延迟执行，effect 重新执行时取消定时器，仅真实卸载时才离开房间（H-13 修复）
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 懒初始化：组件首次渲染时读取全局 socket 连接状态
  // 设计原因：避免在 useEffect 内同步 setState 触发级联渲染（React 19 react-hooks/set-state-in-effect 规则）
  // socket 在用户从大厅进入对战页时已由 lobby.tsx 创建，getSocket() 通常不会抛错；
  // try/catch 兜底处理 socket 未创建的边缘场景（如直接 URL 访问 battle 页面），后续由 connect 事件更新
  const [connected, setConnected] = useState(() => {
    try {
      return getSocket().connected;
    } catch {
      return false;
    }
  });
  const [error, setError] = useState<string | null>(null);
  const [players, setPlayers] = useState<PlayerScore[]>([]);
  const [localScore, setLocalScore] = useState(0);
  const [tier, setTier] = useState<EffectTier>('mid');
  const [cooldown, setCooldown] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [settlement, setSettlement] = useState<SettlementData>({ show: false, finalScores: [] });
  const [levelData, setLevelData] = useState<LevelReadyData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 同步 state 到 ref，供 socket 回调读取最新值
  useEffect(() => { playersRef.current = players; }, [players]);

  useEffect(() => {
    let cancelled = false;
    // StrictMode 重挂载时取消上一次 cleanup 排定的延迟 leaveRoom，
    // 避免开发环境不必要的离开+重连（H-13 修复）
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    // 标记是否已通过初始化或首次连接 emit 过 room:join
    // 设计原因：重连场景下 socket.on('connect') 与 socket.io.on('reconnect') 都会触发，
    // websocket/index.ts 的 reconnect 事件已统一处理重连 rejoin（含补发 level-ready），
    // 此处若再 emit 会导致 room:join 重复发送，后端二次刷新 socketId 与广播 state（M-12 修复）
    let hasJoined = false;

    // 复用全局大厅 socket 实例，避免双 socket 导致后端房间内 socketId 混乱与事件路由错乱
    // 大厅 socket 已处理 connect/disconnect/reconnect 的 Toast 提示，此处只关心对战业务事件
    const socket = getSocket();

    // 大厅 socket 可能在进入对战页前已连接，此时主动 emit room:join 加入房间
    if (socket.connected) {
      socket.emit('room:join', { roomId, nickname: nicknameRef.current });
      hasJoined = true;
    }
    // 监听大厅 socket 的连接状态变化，同步本地 UI
    const onConnect = () => {
      if (cancelled) return;
      setConnected(true);
      // 仅首次连接时 emit room:join；重连由 websocket/index.ts 的 reconnect 事件统一处理
      if (!hasJoined) {
        socket.emit('room:join', { roomId, nickname: nicknameRef.current });
        hasJoined = true;
      }
    };
    const onDisconnect = () => {
      if (cancelled) return;
      setConnected(false);
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    // 房间全量状态：后端在 join/leave/ready/start 等变更后统一推送 room:state
    // 从中提取 players 列表，替代原 game:joined/player-joined/player-left 三个细粒度事件
    const onRoomState = (data: { room: { players: RoomPlayer[]; status: string } }) => {
      if (cancelled) return;
      // 重连恢复：playing 状态下收到 room:state 时恢复 gameStarted，
      // 避免重连后误显示"等待开始"遮罩遮挡正在进行的游戏画面
      if (data.room.status === 'playing') {
        setGameStarted(true);
      }
      // 重连恢复：保留已有玩家分数，仅更新玩家列表
      // 断线期间其他玩家的分数上报事件会丢失，重连后用 room:state 重建列表时
      // 保留断线前已收到的分数，避免分数异常归零影响结算与排行
      setPlayers((prev) =>
        data.room.players.map((p) => {
          const existing = prev.find((pp) => pp.userId === p.userId);
          return existing ?? { userId: p.userId, nickname: p.nickname, score: 0 };
        }),
      );
      // 同步到已初始化的游戏实例，动态增删远程玩家
      // 游戏未初始化时（battleSceneRef.current 为 null）由 initGame 从 playersRef 读取初始列表
      battleSceneRef.current?.syncPlayers(
        data.room.players.map((p) => ({ userId: p.userId, nickname: p.nickname })),
      );
    };
    socket.on('room:state', onRoomState);

    // 房间错误：后端在 join/leave/start 等失败时回送 room:error
    const onRoomError = (data: { message: string }) => {
      if (cancelled) return;
      setError(data.message);
    };
    socket.on('room:error', onRoomError);

    // 分数同步：后端字段为 userId（与 room.players 一致），原前端误用 playerId 导致匹配失败
    const onScoreUpdate = (data: { userId: string; score: number }) => {
      if (cancelled) return;
      setPlayers((prev) =>
        prev.map((p) => (p.userId === data.userId ? { ...p, score: data.score } : p))
      );
    };
    socket.on('game:score-update', onScoreUpdate);

    // 游戏开始：后端仅广播 { roomId }，不携带 levelData（levelData 由 game:level-ready 单独下发）
    // 因此此处只切换 gameStarted 状态，画面初始化由 game:level-ready 触发
    const onGameStart = () => {
      if (cancelled) return;
      setGameStarted(true);
    };
    socket.on('game:start', onGameStart);

    // 游戏结算：后端按玩家逐个广播 { userId, finalScore, result }，前端累加到 finalScores
    // MVP 由 finalScores 按分数降序后取首名，不再依赖单独的 mvpPlayerId 字段
    const onGameFinish = (data: { userId: string; finalScore: number; result: 'win' | 'lose' }) => {
      if (cancelled) return;
      const player = playersRef.current.find((p) => p.userId === data.userId);
      const nicknameStr = player?.nickname ?? '未知玩家';
      setSettlement((prev) => {
        // 不可变更新：避免直接变异 prev 中的对象与数组
        // 原实现 existing.score = ... + prev.finalScores.push(...) 违反 React 不可变状态原则，
        // 会导致 prev 中的对象被污染，并发渲染可能读到中间态，React 19 严格模式无法正确检测变化
        const existingIndex = prev.finalScores.findIndex((p) => p.userId === data.userId);
        const newFinalScores = existingIndex >= 0
          ? prev.finalScores.map((p, i) =>
            i === existingIndex
              ? { ...p, score: data.finalScore, nickname: nicknameStr }
              : p
          )
          : [...prev.finalScores, { userId: data.userId, nickname: nicknameStr, score: data.finalScore }];
        return { show: true, finalScores: newFinalScores };
      });
    };
    socket.on('game:finish', onGameFinish);

    // 关卡生成超时兜底：AI 生成卡死或事件丢失时，30 秒后提示错误，避免用户永久卡 loading
    // 设计原因：isLoading 仅由 game:level-ready 事件置 false，若后端 AI 生成失败、事件丢失或网络异常，
    // 用户将永久卡在"等待 AI 生成关卡数据..."界面无任何提示。30 秒覆盖正常 AI 生成耗时
    // （后端 room-manager 有兜底数据，正常 < 5 秒），超时后给出明确错误与返回入口
    const levelTimeoutId = setTimeout(() => {
      if (cancelled) return;
      setError('关卡生成超时，请返回大厅重试');
      setIsLoading(false);
    }, 30_000);

    // 关卡就绪：后端 AI 生成完成后下发完整 levelData
    // 收到后立即初始化游戏画面（原逻辑在 game:start 时初始化，但后端 game:start 不携带 levelData，会导致 initGame(undefined)）
    // 用 requestAnimationFrame 等待 setIsLoading(false) 触发容器渲染后再初始化，避免 containerRef.current 为 null
    // 重连场景：后端在 playing 状态下重连会补发 game:level-ready，此时场景已初始化，跳过重建避免重复创建 canvas
    const onLevelReady = (data: LevelReadyData) => {
      if (cancelled) return;
      // 关卡已就绪，取消超时兜底定时器避免误触发错误提示
      clearTimeout(levelTimeoutId);
      setLevelData(data);
      setIsLoading(false);
      // 已初始化场景（重连场景）时跳过重建，保留断线前本地画面与游戏循环，玩家体验更平滑
      if (battleSceneRef.current) return;
      requestAnimationFrame(() => {
        if (!cancelled) initGame(data);
      });
    };
    socket.on('game:level-ready', onLevelReady);

    function initGame(levelDataParam: unknown) {
      if (!containerRef.current) return;

      const engine = new GameEngine();
      engineRef.current = engine;

      engine.init({
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        backgroundColor: 0xfff8e7,
      }).then(() => {
        if (cancelled || !containerRef.current) return;

        const canvas = engine.canvas;
        // 画布逻辑分辨率保持 800x600，CSS 100% 填满容器实现响应式缩放
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.display = 'block';
        canvas.style.border = '4px solid #1a1a1a';
        canvas.style.boxShadow = '6px 6px 0 #1a1a1a';
        canvas.style.boxSizing = 'border-box';
        containerRef.current!.appendChild(canvas);

        const assets = new AssetLoader(engine.renderer);
        assetsRef.current = assets;

        const sceneManager = new SceneManager(engine.stage);
        sceneManagerRef.current = sceneManager;

        // 本地玩家 userId：与后端 room.players 中的 userId 对齐，用于多人对战操作同步
        const localUser = useUserStore.getState().user;
        const localUserId = localUser ? String(localUser.id) : '';
        // 远程玩家列表：从 room:state 同步的 players 中提取，供 BattleScene 初始化所有玩家
        const remotePlayers = playersRef.current.map((p) => ({
          userId: p.userId,
          nickname: p.nickname,
        }));

        const battleScene = new BattleScene(
          engine,
          assets,
          { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
          socket,
          roomId,
          localUserId,
          remotePlayers,
          {
            onScoreChange: (score) => {
              setLocalScore(score);
              // 分数上报事件名与后端 GameEvents.SCORE_UPDATE 对齐
              socket.emit('game:score-update', { roomId, score });
            },
            onTierChange: (t) => setTier(t),
            onCooldownChange: (ms) => setCooldown(ms),
            onTimeChange: (s) => setTimeRemaining(s),
          },
        );
        battleSceneRef.current = battleScene;

        battleScene.init(mode, levelDataParam);

        sceneManager.register('battle', battleScene);
        sceneManager.switchTo('battle');

        tickerCallbackRef.current = (ticker: Ticker) => {
          sceneManager.update(ticker.deltaMS);
        };
        engine.ticker.add(tickerCallbackRef.current);
      }).catch((err) => {
        // 引擎初始化失败（WebGL 不可用、canvas 上下文丢失等）需显式处理，
        // 否则 Promise rejection 无人捕获，用户卡在 loading 界面无任何提示
        logger.error('游戏引擎初始化失败', err);
        if (cancelled) return;
        setError('游戏引擎初始化失败，请检查浏览器 WebGL 支持');
        setIsLoading(false);
      });
    }

    return () => {
      cancelled = true;
      // 清理关卡超时定时器，避免组件卸载后仍触发 setState（已 cancelled 守卫但定时器本身需释放）
      clearTimeout(levelTimeoutId);
      // 清理本页注册的 socket 监听，避免重复绑定与内存泄漏
      // 不调用 socket.disconnect()，保护全局大厅 socket 供其他页面继续使用
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:state', onRoomState);
      socket.off('room:error', onRoomError);
      socket.off('game:score-update', onScoreUpdate);
      socket.off('game:start', onGameStart);
      socket.off('game:finish', onGameFinish);
      socket.off('game:level-ready', onLevelReady);
      // 主动离开房间，触发后端清理房间数据（而非依赖 5 分钟 TTL）
      // 走 roomActions.leaveRoom 而非直接 emit，确保 lastRoomId/lastNickname 同步清除，
      // 避免用户退出对战后在大厅断线重连时被误 rejoin 回已退出的房间
      // try/catch 保护：socket 已断开时 getSocket() 会抛 'Socket not connected'，
      // 若不捕获会中断 cleanup 后续资源释放，导致 PixiJS 纹理与 WebGL 上下文泄漏
      // 延迟离开房间：StrictMode 开发环境下 mount→cleanup→mount 快速连续触发，
      // 直接 leaveRoom 会导致后端房间状态混乱（离开后立即重新加入）。
      // 用 setTimeout(0) 延迟执行，若 effect 重新执行则在 setup 中取消定时器，仅真实卸载时才离开（H-13 修复）
      // 生产环境（无 StrictMode）cleanup 后组件直接卸载，定时器照常执行，行为与原直接调用等价
      leaveTimerRef.current = setTimeout(() => {
        leaveTimerRef.current = null;
        try {
          roomActions.leaveRoom(roomId);
        } catch (err) {
          logger.error('离开房间失败', err);
        }
      }, 0);

      if (tickerCallbackRef.current && engineRef.current) {
        engineRef.current.ticker.remove(tickerCallbackRef.current);
      }
      // 先销毁 BattleScene 再销毁 SceneManager：SceneManager.destroy() 只调用 onExit/removeChild，
      // 不会触发场景自身的 destroy()；而 BattleScene.destroy() 负责释放 BossGame/BrawlGame/SpeedGame
      // 缓存的 generateTexture 纹理（projectileTexture/playerTexture 等 GPU 资源），
      // 这些纹理不是显示对象子节点，不会被 engine.destroy({children:true}) 自动回收
      battleSceneRef.current?.destroy();
      if (sceneManagerRef.current) sceneManagerRef.current.destroy();
      if (assetsRef.current) assetsRef.current.destroy();
      if (engineRef.current) engineRef.current.destroy();
    };
  // 依赖 roomId/mode，避免重渲染时重复注册监听；nickname 通过 ref 读取无需作为依赖（M-19），
  // socket 实例由 getSocket 全局单例保证
  }, [roomId, mode]);

  const handleStartGame = useCallback(() => {
    // 开始游戏事件名与后端 RoomEvents.START 对齐
    if (connected) {
      getSocket().emit('room:start', { roomId });
    }
  }, [roomId, connected]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  const cooldownSeconds = (cooldown / 1000).toFixed(1);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-cream">
        <div className="bg-cream border-4 border-ink px-6 py-4 shadow-[6px_6px_0_#1a1a1a] animate-pop">
          {/* role=alert 强制屏幕阅读器立即朗读对战错误原因,视障用户即时感知连接/房间异常 */}
          <p className="font-mono text-sm text-ink" role="alert">{error}</p>
          <button
            onClick={onBack}
            className="mt-4 bg-ink text-cream px-4 py-2 font-mono text-sm hover:bg-pink transition-all shadow-[3px_3px_0_#1a1a1a] hover:shadow-[1px_1px_0_#1a1a1a] hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loading size="lg" text="等待 AI 生成关卡数据..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 gap-4 scrollbar-brutal">
      <div className="flex items-center gap-4 animate-stagger">
        {/* aria-label 覆盖"← 返回"文本,避免屏幕阅读器朗读"左箭头 返回" */}
        <button
          onClick={onBack}
          aria-label="返回"
          className="bg-ink text-cream px-4 py-2 font-mono text-sm hover:bg-pink transition-all shadow-[3px_3px_0_#1a1a1a] hover:shadow-[1px_1px_0_#1a1a1a] hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
        >
          ← 返回
        </button>
        <h2 className="font-cn text-xl sm:text-3xl text-ink drop-shadow-[3px_3px_0_rgba(255,61,127,0.25)]">
          情绪爆破局 · {MODE_LABEL[mode]}
        </h2>
        <div className={`px-3 py-1 font-mono text-sm shadow-[2px_2px_0_#1a1a1a] ${connected ? 'bg-mint text-ink' : 'bg-pink text-cream'}`}>
          {connected ? '● 已连接' : '○ 未连接'}
        </div>
      </div>

      {/* 玩家列表：每个玩家 chip 交错入场，hud-chip 提升可读性 */}
      <div className="flex gap-4 flex-wrap justify-center">
        {players.map((p, idx) => (
          <div
            key={p.userId}
            className="hud-chip text-cream px-3 py-1.5 font-mono text-sm rounded animate-stagger"
            style={{ animationDelay: `${100 + idx * 60}ms` }}
          >
            <span className="text-cream/70">{p.nickname}:</span>{' '}
            <span className="text-yellow font-bold">{p.score}</span>
            <span className="text-cream/70"> 分</span>
          </div>
        ))}
      </div>

      {/* 移动端竖屏柔和提示：建议横屏体验更佳，不遮挡画布 */}
      <p className="hidden portrait:block font-mono text-xs text-ink/60">
        <span aria-hidden="true">💡</span> 建议横屏游戏，体验更佳
      </p>

      <div
        ref={containerRef}
        onContextMenu={handleContextMenu}
        className="relative mx-auto animate-stagger delay-200"
        style={{
          // 响应式自适应：宽度取三者最小值，确保画布在视口内完整可见且保持 4:3 比例
          // 1. 100%：不超过父容器宽度（移动端撑满，桌面端受 max-w-2xl 限制）
          // 2. 800px：画布逻辑分辨率上限，避免超大屏幕画布过大
          // 3. calc(75vh * 4/3)：按视口高度反推最大宽度，避免画布超出视口导致滚动
          width: 'min(100%, 800px, calc(75vh * 4 / 3))',
          aspectRatio: '4 / 3',
        }}
      >
        {/* AI 生成的怪兽信息：用 hud-chip 替代 bg-ink/80 */}
        {levelData && (
          <div className="absolute top-4 left-4 right-4 hud-chip text-cream p-3 rounded-lg z-10">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-cn text-lg">{levelData.monster.name}</p>
                <p className="font-mono text-xs text-cream/70">情绪: {levelData.monster.emotion}</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm">HP: <span className="text-yellow font-bold">{levelData.monster.hp}</span></p>
                <p className="font-mono text-xs text-cream/70">攻击: {levelData.monster.attack}</p>
              </div>
            </div>
          </div>
        )}

        {/* HUD 覆盖层：统一 hud-chip 风格 */}
        <div className="absolute top-2 left-2 z-10 flex flex-col gap-1.5 pointer-events-none">
          <div className="hud-chip text-cream px-3 py-1 font-mono text-sm rounded">
            分数: <span className="text-yellow font-bold">{localScore}</span>
          </div>
          <div className="hud-chip text-cream px-3 py-1 font-mono text-sm rounded">
            档位: <span className="text-mint font-bold">{TIER_LABEL[tier]}</span>
          </div>
          {cooldown > 0 && (
            <div className="hud-chip text-cream px-3 py-1 font-mono text-sm rounded">
              技能: <span className="text-orange font-bold">冷却 {cooldownSeconds}s</span>
            </div>
          )}
          {timeRemaining !== null && (
            <div className="hud-chip text-cream px-3 py-1 font-mono text-sm rounded">
              时间: <span className="text-yellow font-bold">{timeRemaining}s</span>
            </div>
          )}
        </div>

        {/* 等待开始提示 */}
        {!gameStarted && (
          <div className="absolute inset-0 flex items-center justify-center z-20">
            <div className="hud-chip text-cream px-6 py-4 font-cn text-xl text-center rounded-lg animate-pop">
              <p>等待其他玩家加入...</p>
              <p className="text-sm mt-2 text-cream/70 font-mono">房间: {roomId}</p>
              <button
                onClick={handleStartGame}
                className="mt-4 bg-mint text-ink px-6 py-2 font-mono font-bold hover:bg-yellow transition-all shadow-[3px_3px_0_#1a1a1a] hover:shadow-[1px_1px_0_#1a1a1a] hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
              >
                开始游戏
              </button>
            </div>
          </div>
        )}

        {/* 断线重连遮罩：游戏进行中且连接断开时显示，明确告知玩家当前状态
            设计原因：Toast 提示会自动消失，断线期间玩家可能持续操作却不知情；
            半透明遮罩保留底层画面（重连成功后可平滑继续），同时阻断误操作，
            z-30 高于等待开始遮罩(z-20)，低于结算弹窗(z-50)避免遮挡结算结果 */}
        {!connected && gameStarted && !settlement.show && (
          <div className="absolute inset-0 bg-ink/60 backdrop-blur-sm flex items-center justify-center z-30">
            <div className="bg-cream border-4 border-pink px-6 py-4 shadow-[6px_6px_0_#1a1a1a] text-center animate-pop">
              <p className="font-cn text-lg text-ink">连接已断开</p>
              <p className="font-mono text-xs text-ink/70 mt-1">正在尝试重连，请稍候...</p>
            </div>
          </div>
        )}
      </div>

      {/* 操作提示 */}
      <div className="hud-chip text-cream px-3 py-1 font-mono text-xs rounded animate-stagger delay-300">
        左键射击 · 右键技能 · 1/2/3 切换特效档位
      </div>

      {/* 结算弹窗：独立组件避免内联定义导致每次重渲染状态重置 */}
      <SettlementPopup settlement={settlement} onBack={onBack} />
    </div>
  );
}

/** 结算弹窗：提取为独立组件，避免在 BattlePage 内联定义触发 React 19 static-components 规则
 *  设计原因：内联组件每次父组件重渲染都会创建新函数引用，React 会卸载旧组件并挂载新组件，
 *  导致组件内部 state 重置。虽当前 SettlementPopup 无 state，但遵循 React 19 严格模式规范提前规避隐患 */
function SettlementPopup({ settlement, onBack }: { settlement: SettlementData; onBack: () => void }) {
  if (!settlement.show) return null;

  const sorted = [...settlement.finalScores].sort((a, b) => b.score - a.score);
  // MVP 取分数最高者（原逻辑依赖后端下发的 mvpPlayerId，现由前端按分数计算）
  const mvp = sorted[0];

  // 前三名奖牌色：与排行榜保持一致的金/银/铜
  const medalClass = (idx: number) => {
    if (idx === 0) return 'text-yellow';
    if (idx === 1) return 'text-gray-400';
    if (idx === 2) return 'text-amber-700';
    return 'text-ink';
  };

  return (
    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
      {/* role=alertdialog + aria-modal：对战结束属于需要用户立即关注的结果通知，
          alertdialog 语义让屏幕阅读器立即播报结算内容（含 MVP 与排名），无需用户手动定位；
          aria-labelledby 指向标题"游戏结束"让阅读器朗读完整语义而非随机内容 */}
      <div role="alertdialog" aria-modal="true" aria-labelledby="settlement-title" className="bg-cream border-4 border-ink p-6 shadow-[8px_8px_0_#1a1a1a] min-w-[300px] animate-pop">
        <h2 id="settlement-title" className="font-cn text-2xl text-ink mb-4 text-center drop-shadow-[2px_2px_0_rgba(255,61,127,0.25)]">
          游戏结束
        </h2>

        {mvp && (
          <div className="text-center mb-4 bg-gradient-to-r from-yellow/30 to-pink/20 border-2 border-yellow px-4 py-3">
            <div className="text-yellow font-cn text-sm tracking-widest">★ MVP ★</div>
            <div className="font-bold text-lg font-cn text-ink">{mvp.nickname}</div>
            <div className="text-2xl font-mono text-pink font-bold">{mvp.score} 分</div>
          </div>
        )}

        <div className="space-y-2 mb-4">
          {sorted.map((p, idx) => (
            <div
              key={p.userId}
              className={`flex justify-between items-center px-3 py-1.5 border-2 ${
                idx === 0 ? 'border-yellow bg-yellow/10' : 'border-ink/20'
              }`}
            >
              <span className={`font-cn ${medalClass(idx)} ${idx === 0 ? 'font-bold' : ''}`}>
                {idx + 1}. {p.nickname}
              </span>
              <span className="font-mono font-bold">{p.score} 分</span>
            </div>
          ))}
        </div>

        <button
          onClick={onBack}
          className="w-full bg-ink text-cream px-4 py-2 font-mono text-sm hover:bg-pink transition-all shadow-[3px_3px_0_#1a1a1a] hover:shadow-[1px_1px_0_#1a1a1a] hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
        >
          返回大厅
        </button>
      </div>
    </div>
  );
}

export default BattlePage;
