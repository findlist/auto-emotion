import { useEffect, useState } from 'react';
import { taskApi, type DailyTask } from '@/api/tasks';
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
  const [loading, setLoading] = useState(false);

  async function loadTasks() {
    try {
      setLoading(true);
      const data = await taskApi.getDailyTasks();
      setTasks(data);
    } catch (err) {
      logger.error('加载任务失败', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTasks();
  }, []);

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
    <div className="min-h-screen bg-cream flex flex-col">
      {/* 顶部导航 */}
      <header className="bg-ink text-cream px-4 py-3 flex items-center gap-4">
        {/* 返回按钮仅含箭头符号，aria-label 提供语义避免屏幕阅读器朗读"左箭头" */}
        <button onClick={onBack} aria-label="返回" className="text-cream hover:text-yellow transition-colors">
          ←
        </button>
        <h1 className="font-cn text-lg font-bold">每日任务</h1>
      </header>

      {/* 任务列表 */}
      <main className="flex-1 p-4 overflow-auto">
        {loading ? (
          <div className="text-center py-8">
            <p className="font-cn text-ink/70">加载中...</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-8">
            {/* 装饰性 emoji 与后跟文字语义重复，aria-hidden 屏蔽避免冗余朗读 */}
            <p className="text-4xl mb-4"><span aria-hidden="true">📋</span></p>
            <p className="font-cn text-ink/70">暂无任务</p>
          </div>
        ) : (
          <div className="space-y-4">
            {tasks.map((task) => {
              const status = getTaskStatus(task);
              const typeInfo = TASK_TYPE_LABELS[task.type] || { label: '其他', emoji: '❓' };
              const progressPercent = getProgressPercent(task);

              return (
                <div
                  key={task.id}
                  className={`bg-cream border-2 ${
                    status === 'claimed'
                      ? 'border-green-500'
                      : status === 'completed'
                      ? 'border-mint'
                      : 'border-ink'
                  } p-4 shadow-[3px_3px_0_#1a1a1a]`}
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
                    className="h-2 bg-ink/20 rounded-full mb-3"
                    role="progressbar"
                    aria-label={`任务进度：${task.name}`}
                    aria-valuenow={task.progress}
                    aria-valuemin={0}
                    aria-valuemax={task.target}
                  >
                    <div
                      className={`h-full rounded-full transition-all ${
                        status === 'claimed'
                          ? 'bg-green-500'
                          : status === 'completed'
                          ? 'bg-mint'
                          : 'bg-pink'
                      }`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>

                  {/* 状态标签 */}
                  <div className="flex items-center justify-between">
                    <span
                      className={`font-mono text-xs px-2 py-1 ${
                        status === 'claimed'
                          ? 'bg-green-500 text-cream'
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
                        className="bg-mint text-ink px-4 py-1 font-cn font-bold hover:bg-ink hover:text-cream transition-colors disabled:opacity-50"
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