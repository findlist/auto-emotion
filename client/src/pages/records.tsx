// client/src/pages/records.tsx
// 战绩页面

import { useEffect, useRef, useState } from 'react';
import { recordApi } from '@/api/record';
import Loading from '@/components/Loading';
import Empty from '@/components/Empty';
import { logger } from '@/utils/logger';

interface RecordItem {
  id: string;
  room_id: string;
  mode: string;
  duration_seconds: number;
  total_score: number;
  created_at: string;
  nickname: string;
  score: number;
  rank: number;
  is_mvp: boolean;
  exp_reward: number;
  gold_reward: number;
}

interface RecordDetail extends RecordItem {
  damage?: number;
}

export default function RecordsPage() {
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<RecordDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // 详情弹窗容器 ref：用于焦点陷阱查询可聚焦元素与初始聚焦
  const detailDialogRef = useRef<HTMLDivElement>(null);
  // 请求竞态守卫：每次翻页递增 requestId，仅最新请求的结果会写入 state
  // 设计原因：原实现快速翻页时旧请求可能后返回，覆盖新请求的结果导致显示与页码错位
  const loadRequestIdRef = useRef(0);

  const totalPages = Math.ceil(total / pageSize);

  // 加载战绩列表：声明在 useEffect 之前，避免 react-hooks/immutability 规则报错
  // （变量在被 useEffect 引用前必须先声明）
  async function loadRecords() {
    const currentRequestId = ++loadRequestIdRef.current;
    setLoading(true);
    try {
      const result = await recordApi.list(page, pageSize);
      // 守卫：若期间已触发新翻页请求，丢弃本次过时结果，避免覆盖最新数据
      if (currentRequestId !== loadRequestIdRef.current) return;
      setRecords(result.records);
      setTotal(result.total);
    } catch (err) {
      if (currentRequestId !== loadRequestIdRef.current) return;
      logger.error('加载战绩失败', err);
    } finally {
      if (currentRequestId === loadRequestIdRef.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loadRecords 依赖 page 变化触发重载，需保留同步 setLoading(true) 维持分页切换时的加载指示器 UX；inline IIFE 会在每次翻页丢失 loading 状态
    void loadRecords();
    // loadRecords 依赖 page 与 pageSize，pageSize 为常量不变化，仅 page 触发重新加载
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // 详情弹窗 focus trap：打开时聚焦对话框容器（含 Loading 期间稳定可聚焦），
  // Tab/Shift+Tab 在弹窗内循环避免焦点逃逸，ESC 关闭，关闭后焦点回归触发元素
  // 设计原因：records 详情弹窗原仅 role=dialog 但无键盘焦点管理，
  // 视障与键盘用户打开后焦点仍停留背景卡片，Tab 会逃逸到列表，无法高效操作关闭按钮
  useEffect(() => {
    if (!selectedRecord) return;
    // 记录触发元素（点击的战绩卡片），关闭时恢复焦点让键盘用户继续原列表浏览
    const trigger = document.activeElement as HTMLElement;
    // 聚焦对话框容器（tabIndex=-1 可编程聚焦），Loading 期间关闭按钮未渲染，容器是稳定焦点锚点
    detailDialogRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedRecord(null);
        return;
      }
      if (e.key === 'Tab') {
        const dialog = detailDialogRef.current;
        if (!dialog) return;
        const focusables = dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        // 无可聚焦元素时锁定焦点在对话框容器，避免 Tab 逃逸到背景列表
        if (focusables.length === 0) {
          e.preventDefault();
          detailDialogRef.current?.focus();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      // 关闭后恢复焦点到触发元素，便于键盘用户继续原列表浏览
      trigger?.focus();
    };
  }, [selectedRecord]);

  async function openDetail(record: RecordItem) {
    setDetailLoading(true);
    try {
      const detail = await recordApi.get(record.id);
      setSelectedRecord(detail);
    } catch (err) {
      logger.error('加载战绩详情失败', err);
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setSelectedRecord(null);
  }

  function getModeName(mode: string) {
    const names: Record<string, string> = {
      normal: '普通模式',
      boss: 'Boss 模式',
      brawl: '乱斗模式',
    };
    return names[mode] || mode;
  }

  function formatDuration(seconds: number) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}分${secs}秒`;
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString('zh-CN');
  }

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-ink mb-6">我的战绩</h1>

        {loading ? (
          <Loading text="加载战绩中..." />
        ) : records.length === 0 ? (
          <Empty
            icon="🎮"
            title="暂无战绩记录"
            description="去玩几局游戏，记录你的战绩吧！"
          />
        ) : (
          <>
            <div className="space-y-3">
              {records.map((record) => (
                <div
                  key={record.id}
                  className="bg-white border-2 border-ink p-4 shadow-[4px_4px_0_#1a1a1a] cursor-pointer hover:shadow-[2px_2px_0_#1a1a1a] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                  role="button"
                  tabIndex={0}
                  aria-label={`查看${getModeName(record.mode)}战绩详情，排名第${record.rank}名`}
                  onClick={() => openDetail(record)}
                  onKeyDown={(e) => {
                    // 键盘可访问：Enter/Space 触发与点击一致的详情查看
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openDetail(record);
                    }
                  }}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="inline-block bg-pink text-cream px-2 py-0.5 text-xs font-bold mb-2">
                        {getModeName(record.mode)}
                      </span>
                      <p className="text-sm text-ink/70">
                        {formatDate(record.created_at)} · {formatDuration(record.duration_seconds)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-ink">
                        排名 #{record.rank}
                      </p>
                      <p className="text-sm text-ink/70">
                        分数 {record.score}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-4 mt-3 text-sm">
                    <span className="text-green-600">+{record.exp_reward} 经验</span>
                    <span className="text-yellow-600">+{record.gold_reward} 金币</span>
                    {record.is_mvp && (
                      <span className="text-pink font-bold">★ MVP</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* 分页 */}
            {totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-6">
                <button
                  className="px-4 py-2 bg-ink text-cream font-mono text-sm disabled:opacity-50"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  上一页
                </button>
                <span className="px-4 py-2 font-mono text-sm text-ink">
                  {page} / {totalPages}
                </span>
                <button
                  className="px-4 py-2 bg-ink text-cream font-mono text-sm disabled:opacity-50"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  下一页
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* 详情弹窗 */}
      {selectedRecord && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4"
          onClick={closeDetail}
        >
          <div
            ref={detailDialogRef}
            // tabIndex=-1 让 div 可编程聚焦，配合 focus trap 锁定键盘焦点；
            // outline-none 避免容器聚焦时显示整体焦点框（焦点应直观进入关闭按钮）
            tabIndex={-1}
            className="bg-cream border-4 border-ink p-6 max-w-md w-full shadow-[8px_8px_0_#1a1a1a] outline-none"
            role="dialog"
            aria-modal="true"
            aria-label="战绩详情"
            onClick={(e) => e.stopPropagation()}
          >
            {detailLoading ? (
              <Loading text="加载详情中..." size="sm" />
            ) : (
              <>
                <div className="flex justify-between items-start mb-4">
                  <h2 className="text-xl font-bold text-ink">
                    {getModeName(selectedRecord.mode)} 战绩详情
                  </h2>
                  {/* 纯符号关闭按钮需语义化标签，让屏幕阅读器识别关闭操作 */}
                  <button
                    className="text-ink hover:text-pink text-2xl leading-none"
                    onClick={closeDetail}
                    aria-label="关闭"
                  >
                    ×
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-ink/70">房间ID</span>
                    <span className="font-mono text-sm">{selectedRecord.room_id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink/70">时间</span>
                    <span>{formatDate(selectedRecord.created_at)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink/70">时长</span>
                    <span>{formatDuration(selectedRecord.duration_seconds)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink/70">我的分数</span>
                    <span className="font-bold">{selectedRecord.score}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink/70">我的排名</span>
                    <span className="font-bold">#{selectedRecord.rank}</span>
                  </div>
                  {selectedRecord.damage !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-ink/70">我的伤害</span>
                      <span>{selectedRecord.damage}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-ink/70">获得经验</span>
                    <span className="text-green-600">+{selectedRecord.exp_reward}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink/70">获得金币</span>
                    <span className="text-yellow-600">+{selectedRecord.gold_reward}</span>
                  </div>
                  {selectedRecord.is_mvp && (
                    <div className="text-center mt-4">
                      <span className="inline-block bg-pink text-cream px-4 py-2 font-bold text-lg">
                        ★ MVP ★
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
