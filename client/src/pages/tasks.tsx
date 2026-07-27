import { useState } from 'react';
import { taskApi, type DailyTask } from '@/api/tasks';
import { useAsyncEffect } from '@/hooks/use-async-effect';
import { showToast } from '@/utils/toast';
import { showApiError } from '@/utils/api-error';
import { showConfirm } from '@/utils/confirm';
import { logger } from '@/utils/logger';

interface TasksPageProps {
  onBack: () => void;
}

const TASK_TYPE_LABELS: Record<number, { label: string; emoji: string }> = {
  0: { label: '对战', emoji: '⚔️' },
  1: { label: '挂机', emoji: '⏰' },
  2: { label: '社交', emoji: '👥' },
};

export default function TasksPage({ onBack }: TasksPageProps) {
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  // 初始 true：挂载即开始加载，避免 useEffect 内同步 setLoading(true) 触发级联渲染
  const [loading, setLoading] = useState(true);

  // loadTasks 不再同步 setLoading(true)，仅由调用方或初始 true 控制
  // handleClaim 单独管理 loading，避免与刷新逻辑耦合
  async function loadTasks() {
    try {
      const data = await taskApi.getDailyTasks();
      setTasks(data);
    } catch (err) {
      logger.error('加载任务失败', err);
    } finally {
      setLoading(false);
    }
  }

  // 初始加载：useAsyncEffect 内部维护 cancelled 守卫，避免组件卸载后 setState 警告
  useAsyncEffect(
    async () => taskApi.getDailyTasks(),
    setTasks,
    {
      onError: (err) => logger.error('加载任务失败', err),
      onFinally: () => setLoading(false),
    }
  );

  async function handleClaim(task: DailyTask) {
    // 任务奖励领取属于关键操作，二次确认避免误触
    const ok = await showConfirm({
      type: 'info',
      title: '领取奖励',
      message: `确认领取「${task.name}」奖励？将获得 ${task.reward_exp} 经验 +${task.reward_gold} 金币。`,
      confirmText: '领取',
    });
    if (!ok) return;

    try {
      setLoading(true);
      const result = await taskApi.claimReward(task.id);
      showToast('success', `领取成功！+${result.reward_exp}经验 +${result.reward_gold}金币`);
      await loadTasks();
    } catch (err) {
      showApiError(err, '领取失败');
    } finally {
      setLoading(false);
    }
  }

  function getTaskStatus(task: DailyTask) {
    if (task.claimed) return 'claimed';
    if (task.progress >= task.target) return 'completed';
    return 'pending';
  }

  function getProgressPercent(task: DailyTask) {
    return Math.min(100, (task.progress / task.target) * 100);
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col max-w-2xl mx-auto">
      {/* 顶部导航：page-header 抽象 */}
      <header className="page-header">
        <button onClick={onBack} aria-label="返回" className="back-btn">
          ←
        </button>
        <h1 className="page-title">每日任务</h1>
      </header>

      {/* 任务列表：scrollbar-brutal 统一滚动条风格 */}
      <main className="flex-1 p-4 overflow-auto scrollbar-brutal">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10">
            <div className="spinner-brutal" />
            <p className="font-mono text-sm text-ink/60">加载任务中...</p>
          </div>
        ) : tasks.length === 0 ? (
          /* empty-state 抽象任务空状态 */
          <div className="empty-state">
            <p className="empty-state-emoji"><span aria-hidden="true">📋</span></p>
            <p className="empty-state-title">暂无任务</p>
            <p className="empty-state-desc">每日凌晨刷新，敬请期待</p>
          </div>
        ) : (
          <div className="space-y-4">
            {tasks.map((task, idx) => {
              const status = getTaskStatus(task);
              const typeInfo = TASK_TYPE_LABELS[task.type] || { label: '其他', emoji: '❓' };
              const progressPercent = getProgressPercent(task);

              return (
                <div
                  key={task.id}
                  // 加 task-bar-{type} 左侧色条按任务类型（对战/挂机/社交）区分色相
                  // 与挂机页 attr-bar-* 模式一致，玩家扫一眼即可定位目标任务类型
                  className={`bg-cream border-2 task-bar-${task.type} ${
                    // 已领取用 ink/40 灰阶表示归档态，与可领取(mint)形成清晰区分（原 green-500 脱离调色板）
                    status === 'claimed'
                      ? 'border-ink/40'
                      : status === 'completed'
                      ? 'border-mint'
                      : 'border-ink'
                  } p-4 shadow-[3px_3px_0_#1a1a1a] card-hover animate-stagger`}
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  <div className="flex items-start gap-3 mb-3">
                    {/* 任务类型 emoji 与后跟任务名语义重复，aria-hidden 屏蔽装饰图标 */}
                    <span className="text-3xl" aria-hidden="true">{typeInfo.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-cn text-ink font-bold">{task.name}</p>
                      <p className="font-mono text-xs text-ink/60">
                        {task.progress}/{task.target}
                      </p>
                    </div>
                    {/* 奖励 chip 化：与挂机页区域信息 chip 模式同源
                        设计原因：原"+X经验 +Y金币"纯文本视觉层次弱，玩家扫视列表难以定位奖励数值；
                        改为 mint 经验 chip + yellow 金币 chip，色彩语义与挂机页 ✨经验/💰金币 一致 */}
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <div className="bg-mint/15 text-ink px-2 py-0.5 rounded-full font-mono text-xs flex items-center gap-1 border border-mint/30">
                        <span aria-hidden="true">✨</span>
                        <span className="text-mint font-bold">+{task.reward_exp}</span>
                      </div>
                      <div className="bg-yellow/20 text-ink px-2 py-0.5 rounded-full font-mono text-xs flex items-center gap-1 border border-yellow/40">
                        <span aria-hidden="true">💰</span>
                        <span className="text-yellow font-bold">+{task.reward_gold}</span>
                      </div>
                    </div>
                  </div>

                  {/* 进度条：role="progressbar" + aria 属性让屏幕阅读器可朗读任务进度 */}
                  <div
                    className="h-2.5 bg-ink/20 rounded-full mb-3"
                    role="progressbar"
                    aria-label={`任务进度：${task.name}`}
                    aria-valuenow={task.progress}
                    aria-valuemin={0}
                    aria-valuemax={task.target}
                  >
                    <div
                      // 已领取(归档态)不加 progress-fill 流光，避免静止状态仍有动画干扰；
                      // 进行中/可领取才叠加流光暗示进度仍在累积
                      className={`h-full rounded-full transition-all ${
                        status === 'claimed'
                          ? 'bg-ink/40'
                          : `progress-fill ${
                            status === 'completed'
                              ? 'bg-mint'
                              : 'bg-pink'
                          }`
                      }`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>

                  {/* 状态标签：加阴影增强 Neo-brutalism 层次
                      "可领取"态叠加 animate-badge-pulse 黄色光晕脉冲，与排行榜 Top1 同款动画
                      设计原因：可领取奖励是玩家最关注的状态，原静态 mint badge 在长列表中容易被忽略；
                      黄色脉冲光晕（badgePulse 关键帧 rgba(255,217,61,0.6)）让"可领取"在视野中"呼吸"，
                      吸引玩家点击领取，与排行榜 Top1 冠军强调使用同一视觉语言 */}
                  <div className="flex items-center justify-between">
                    <span
                      className={`font-mono text-xs px-2 py-1 shadow-[1px_1px_0_#1a1a1a] ${
                        status === 'claimed'
                          ? 'bg-ink text-cream/70'
                          : status === 'completed'
                          ? 'bg-mint text-ink animate-badge-pulse'
                          : 'bg-ink/20 text-ink/70'
                      }`}
                    >
                      {status === 'claimed' ? '✓ 已领取' : status === 'completed' ? '可领取' : '进行中'}
                    </span>

                    {status === 'completed' && (
                      <button
                        onClick={() => handleClaim(task)}
                        disabled={loading}
                        className="bg-mint text-ink px-4 py-1 font-cn font-bold shadow-[2px_2px_0_#1a1a1a] hover:bg-ink hover:text-cream transition-colors active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:active:translate-x-0 disabled:active:translate-y-0 disabled:active:shadow-[2px_2px_0_#1a1a1a] disabled:opacity-50"
                      >
                        领取
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}