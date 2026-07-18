import { useEffect, useRef, useState, useCallback } from 'react';
import type { Ticker } from 'pixi.js';
import { GameEngine, CANVAS_WIDTH, CANVAS_HEIGHT } from '@/game/core/engine';
import { SceneManager } from '@/game/core/scene-manager';
import { AssetLoader } from '@/game/core/asset-loader';
import { BattleScene } from '@/game/scenes/battle-scene';
import type { EffectTier } from '@/game/effects/particle';

/** 结算奖励计算 */
const SETTLEMENT_TIME_LIMIT_MS = 60000; // 60秒一场

/** 档位中文标签 */
const TIER_LABEL: Record<EffectTier, string> = {
  low: '低档',
  mid: '中档',
  high: '高档',
};

interface DemoPageProps {
  onBack: () => void;
}

interface SettlementData {
  rank: number;
  score: number;
  expReward: number;
  goldReward: number;
  isMVP: boolean;
}

/**
 * 计算单机演示结算数据
 * 设计原因：将纯计算逻辑从组件中提取，便于单元测试验证奖励分档与 MVP 阈值，
 * 遵循"函数只做一件事"原则，组件仅负责状态应用
 * @param finalScore 本场最终得分
 * @returns 结算数据（排名/奖励/MVP 标识）
 */
// eslint-disable-next-line react-refresh/only-export-components -- 纯计算函数与组件共存便于单测，演示页 Fast Refresh 非关键路径，避免新建碎片化文件
export function calculateSettlement(finalScore: number): SettlementData {
  const expReward = Math.floor(finalScore * 1.5);
  const goldReward = Math.floor(finalScore * 0.8);
  const isMVP = finalScore > 100;
  const rank = finalScore > 200 ? 1 : finalScore > 100 ? 2 : finalScore > 50 ? 3 : 4;
  return { rank, score: finalScore, expReward, goldReward, isMVP };
}

/**
 * 单机演示页：挂载 PixiJS canvas，进入战斗场景
 * 显示分数、特效档位、技能冷却、结算弹窗
 */
function DemoPage({ onBack }: DemoPageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [score, setScore] = useState(0);
  const [tier, setTier] = useState<EffectTier>('mid');
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(SETTLEMENT_TIME_LIMIT_MS);
  const [settlement, setSettlement] = useState<SettlementData | null>(null);
  const settlementTriggeredRef = useRef(false);

  // 触发结算：复用纯函数计算，组件仅负责状态应用
  const triggerSettlement = useCallback((finalScore: number) => {
    setSettlement(calculateSettlement(finalScore));
  }, []);

  // 重新开始
  const handleRestart = useCallback(() => {
    setSettlement(null);
    setScore(0);
    setTimeLeft(SETTLEMENT_TIME_LIMIT_MS);
    setTier('mid');
    setCooldown(0);
    settlementTriggeredRef.current = false;
  }, []);

  useEffect(() => {
    if (settlement !== null) return; // 已结算，停止计时

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 100) {
          return 0;
        }
        return prev - 100;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [settlement]);

  // 检查时间到了触发结算
  useEffect(() => {
    if (timeLeft === 0 && !settlementTriggeredRef.current && settlement === null) {
      settlementTriggeredRef.current = true;
      triggerSettlement(score);
    }
  }, [timeLeft, settlement, score, triggerSettlement]);

  useEffect(() => {
    let engine: GameEngine | null = null;
    let sceneManager: SceneManager | null = null;
    let assets: AssetLoader | null = null;
    // scene 提升到外层作用域，供 cleanup 显式调用 destroy() 释放 BattleScene 缓存的 GPU 纹理
    let scene: BattleScene | null = null;
    let tickerCallback: ((ticker: Ticker) => void) | null = null;
    let cancelled = false;

    async function setup(): Promise<void> {
      if (!containerRef.current) return;

      engine = new GameEngine();
      await engine.init({
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        backgroundColor: 0xfff8e7,
      });

      // StrictMode 双调用保护
      if (cancelled) {
        engine.destroy();
        return;
      }

      const canvas = engine.canvas;
      canvas.style.display = 'block';
      canvas.style.border = '4px solid #1a1a1a';
      canvas.style.boxShadow = '6px 6px 0 #1a1a1a';
      containerRef.current.appendChild(canvas);

      assets = new AssetLoader(engine.renderer);
      sceneManager = new SceneManager(engine.stage);

      scene = new BattleScene(
        engine,
        assets,
        { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
        null,
        '',
        'demo-local',
        [],
        {
          onScoreChange: (s) => setScore(s),
          onTierChange: (t) => setTier(t),
          onCooldownChange: (ms) => setCooldown(ms),
        },
      );
      sceneManager.register('battle', scene);
      sceneManager.switchTo('battle');
      // 显式初始化 boss 战斗场景：单机演示模式无 socket，BattleScene 内部 emitAction 守卫会跳过上报
      scene.init('boss');

      // ticker 回调：驱动场景更新
      tickerCallback = (ticker) => {
        sceneManager?.update(ticker.deltaMS);
      };
      engine.ticker.add(tickerCallback);
    }

    setup().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`引擎初始化失败: ${msg}`);
    });

    return () => {
      cancelled = true;
      if (engine && tickerCallback) {
        engine.ticker.remove(tickerCallback);
      }
      // 先销毁 BattleScene 再销毁 SceneManager：SceneManager.destroy() 仅 onExit/removeChild，
      // 不会触发场景 destroy()；BattleScene.destroy() 负责释放子游戏缓存的 generateTexture 纹理
      if (scene) scene.destroy();
      if (sceneManager) sceneManager.destroy();
      if (assets) assets.destroy();
      if (engine) engine.destroy();
    };
  }, []);

  // 阻止右键菜单（保证右键技能正常触发）
  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault();
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="bg-cream border-4 border-ink px-6 py-4 shadow-[6px_6px_0_#1a1a1a]">
          <p className="font-mono text-sm text-ink">{error}</p>
          <button
            onClick={onBack}
            className="mt-4 bg-ink text-cream px-4 py-2 font-mono text-sm hover:bg-pink transition-colors"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  const cooldownSeconds = (cooldown / 1000).toFixed(1);
  const timeSeconds = (timeLeft / 1000).toFixed(1);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 gap-4">
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          aria-label="返回"
          className="bg-ink text-cream px-4 py-2 font-mono text-sm hover:bg-pink transition-colors"
        >
          ← 返回
        </button>
        <h2 className="font-cn text-3xl text-ink">情绪爆破局 · 单机演示</h2>
      </div>

      <div
        ref={containerRef}
        onContextMenu={handleContextMenu}
        className="relative"
        style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
      >
        {/* HUD 覆盖层 */}
        <div className="absolute top-2 left-2 z-10 flex flex-col gap-1 pointer-events-none">
          <div className="bg-ink/80 text-cream px-3 py-1 font-mono text-sm">
            分数: <span className="text-yellow">{score}</span>
          </div>
          <div className="bg-ink/80 text-cream px-3 py-1 font-mono text-sm">
            时间: <span className={timeLeft < 10000 ? 'text-orange' : 'text-cream'}>{timeSeconds}s</span>
          </div>
          <div className="bg-ink/80 text-cream px-3 py-1 font-mono text-sm">
            档位: <span className="text-mint">{TIER_LABEL[tier]}</span>
            <span className="ml-2 text-cream/60">[1/2/3 切换]</span>
          </div>
          <div className="bg-ink/80 text-cream px-3 py-1 font-mono text-sm">
            技能: {cooldown > 0 ? (
              <span className="text-orange">冷却 {cooldownSeconds}s</span>
            ) : (
              <span className="text-mint">就绪</span>
            )}
          </div>
        </div>

        {/* 操作提示 */}
        <div className="absolute bottom-2 left-2 z-10 pointer-events-none">
          <div className="bg-ink/80 text-cream px-3 py-1 font-mono text-xs">
            左键射击 · 右键范围技能 · 1/2/3 切换特效档位
          </div>
        </div>

        {/* 结算弹窗 */}
        {settlement && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-ink/60">
            <div className="bg-cream border-4 border-ink px-8 py-6 shadow-[8px_8px_0_#1a1a1a] flex flex-col items-center gap-4 min-w-[320px]">
              <h3 className="font-cn text-3xl text-ink">本场结算</h3>

              {/* 排名 */}
              <div className="text-center">
                <p className="font-mono text-sm text-ink/60">排名</p>
                <p className="font-cn text-5xl text-pink">第{settlement.rank}名</p>
              </div>

              {/* MVP 标签 */}
              {settlement.isMVP && (
                <div className="bg-yellow text-ink px-4 py-1 font-bold text-sm">
                  {/* 装饰性 emoji 与后跟"MVP"文字语义重复 */}
                  <span aria-hidden="true">⭐ </span>MVP<span aria-hidden="true"> ⭐</span>
                </div>
              )}

              {/* 分数 */}
              <div className="bg-ink text-cream px-6 py-3 font-mono text-center">
                <p className="text-xs text-cream/60">本场得分</p>
                <p className="text-3xl text-yellow">{settlement.score}</p>
              </div>

              {/* 奖励 */}
              <div className="flex gap-4">
                <div className="text-center">
                  {/* 装饰性 emoji 与后跟"+EXP"文字语义重复 */}
                  <p className="text-2xl" aria-hidden="true">✨</p>
                  <p className="font-mono text-sm text-ink">+{settlement.expReward} EXP</p>
                </div>
                <div className="text-center">
                  {/* 装饰性 emoji 与后跟"+金币"数字语义重复 */}
                  <p className="text-2xl" aria-hidden="true">💰</p>
                  <p className="font-mono text-sm text-ink">+{settlement.goldReward}</p>
                </div>
              </div>

              {/* 按钮 */}
              <div className="flex gap-4 mt-2">
                <button
                  onClick={handleRestart}
                  className="bg-pink text-cream px-6 py-2 font-mono text-sm font-bold hover:bg-ink transition-colors"
                >
                  再来一局
                </button>
                <button
                  onClick={onBack}
                  className="bg-ink text-cream px-6 py-2 font-mono text-sm font-bold hover:bg-pink transition-colors"
                >
                  返回大厅
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default DemoPage;
