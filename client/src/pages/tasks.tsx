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
      {/* 顶部导航：bg-glow-pink 增加深色头部氛围层次 */}
      <header className="bg-ink text-cream px-4 py-3 flex items-center gap-4 bg-glow-pink">
        {/* 返回按钮放大并加 hover 背景区块，提升点击友好度 */}
        <button
          onClick={onBack}
          aria-label="返回"
          className="w-9 h-9 flex items-center justify-center text-cream text-xl hover:bg-cream/10 rounded-lg transition-colors"
        >
          ←
        </button>
        <h1 className="font-cn text-lg font-bold drop-shadow-[2px_2px_0_rgba(255,61,127,0.4)]">每日任务</h1>
      </header>

      {/* 任务列表：scrollbar-brutal 统一滚动条风格 */}
      <main className="flex-1 p-4 overflow-auto scrollbar-brutal">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10">
            <div className="w-10 h-10 border-4 border-ink/20 border-t-pink rounded-full animate-spin" />
            <p className="font-mono text-sm text-ink/60">加载任务中...</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-12">
            {/* 装饰性 emoji 与后跟文字语义重复，aria-hidden 屏蔽避免冗余朗读 */}
            <span className="text-5xl animate-bounce-slow" aria-hidden="true">📋</span>
            <div className="text-center">
              <p className="font-cn text-lg text-ink">暂无任务</p>
              <p className="font-mono text-sm text-ink/50 mt-1">每日凌晨刷新，敬请期待</p>
            </div>
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
                    <div className="flex-1">
                      <p className="font-cn text-ink font-bold">{task.name}</p>
                      <p className="font-mono text-xs text-ink/60">
                        {task.progress}/{task.target}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-xs text-ink/70">奖励</p>
                      <p className="font-mono text-sm text-ink">
                        +{task.reward_exp}经验 +{task.reward_gold}金币
                      </p>
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

                  {/* 状态标签：加阴影增强 Neo-brutalism 层次 */}
                  <div className="flex items-center justify-between">
                    <span
                      className={`font-mono text-xs px-2 py-1 shadow-[1px_1px_0_#1a1a1a] ${
                        status === 'claimed'
                          ? 'bg-ink text-cream/70'
                          : status === 'completed'
                          ? 'bg-mint text-ink'
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