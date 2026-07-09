// client/src/pages/room.tsx
// 房间页：玩家列表 + 房主操作 + 压力源输入 + 准备/开始

import { useState, useEffect } from 'react';
import { useUserStore } from '@/stores/user-store';
import { useRoomStore } from '@/stores/room-store';
import { useShallow } from 'zustand/react/shallow';
import { roomActions } from '@/websocket/index';
import type { GameMode } from '@/types/game';

interface RoomPageProps {
  onBack: () => void;
  onGameStart?: () => void;
}

// 设计原因:原 GAME_MODES 含 'rhythm'/'endless' 是过时数据,
// 实际 GameMode 类型为 'boss'|'brawl'|'speed'(与 battle.tsx MODE_LABEL 对齐)。
// 收敛 mode 类型时连带修正,避免类型错误。
const GAME_MODES: { value: GameMode; label: string }[] = [
  { value: 'boss', label: 'Boss 组队战' },
  { value: 'brawl', label: '自由乱斗' },
  { value: 'speed', label: '手速竞速' },
];

export default function RoomPage({ onBack, onGameStart }: RoomPageProps) {
  const user = useUserStore((s) => s.user);
  // useShallow 浅比较返回字段，避免 store 任意字段变化时创建新对象触发不必要重渲染
  const roomStore = useRoomStore(useShallow((s) => ({
    roomId: s.roomId,
    hostId: s.hostId,
    status: s.status,
    mode: s.mode,
    players: s.players,
    stressSources: s.stressSources,
    error: s.error,
  })));
  const resetRoom = useRoomStore((s) => s.reset);

  const [stressInput, setStressInput] = useState('');
  const [selectedMode, setSelectedMode] = useState<GameMode>(roomStore.mode);

  const isHost = user?.id.toString() === roomStore.hostId;
  const currentPlayer = roomStore.players.find((p) => p.userId === user?.id.toString());
  const isReady = currentPlayer?.isReady ?? false;

  // 状态变为 playing 时跳转游戏
  useEffect(() => {
    if (roomStore.status === 'playing' && onGameStart) {
      onGameStart();
    }
  }, [roomStore.status, onGameStart]);

  /** 准备/取消准备 */
  function handleToggleReady() {
    if (!roomStore.roomId) return;
    if (isReady) {
      roomActions.unready(roomStore.roomId);
    } else {
      roomActions.ready(roomStore.roomId);
    }
  }

  /** 提交压力源 */
  function handleSubmitStress() {
    if (!roomStore.roomId || !stressInput.trim()) return;
    roomActions.submitStress(roomStore.roomId, stressInput.trim());
    setStressInput('');
  }

  /** 设置游戏模式（仅房主） */
  function handleSetMode(mode: GameMode) {
    if (!roomStore.roomId || !isHost) return;
    setSelectedMode(mode);
    roomActions.setMode(roomStore.roomId, mode);
  }

  /** 开始游戏（仅房主） */
  function handleStartGame() {
    if (!roomStore.roomId || !isHost) return;
    roomActions.startGame(roomStore.roomId);
  }

  /** 离开房间 */
  function handleLeaveRoom() {
    if (!roomStore.roomId) return;
    roomActions.leaveRoom(roomStore.roomId);
    resetRoom();
    onBack();
  }

  return (
    <div className="min-h-screen flex flex-col items-center p-8 scrollbar-brutal">
      {/* 头部：交错入场 */}
      <div className="w-full max-w-lg mb-6 animate-stagger">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={handleLeaveRoom}
            className="bg-ink text-cream px-4 py-2 font-mono text-sm hover:bg-pink transition-all shadow-[3px_3px_0_#1a1a1a] hover:shadow-[1px_1px_0_#1a1a1a] hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
          >
            ← 离开房间
          </button>
          <div className="bg-yellow text-ink px-4 py-2 font-mono text-sm font-bold shadow-[3px_3px_0_#1a1a1a]">
            房间号: {roomStore.roomId}
          </div>
        </div>

        <div className="text-center">
          <h2 className="font-cn text-3xl text-ink drop-shadow-[3px_3px_0_rgba(255,61,127,0.2)]">游戏房间</h2>
          <p className="text-ink/60 font-mono text-sm mt-1">
            状态: <span className="text-pink font-bold">{roomStore.status}</span>
          </p>
        </div>
      </div>

      {/* 玩家列表：交错入场，每行玩家卡加 card-hover */}
      <div className="bg-cream border-4 border-ink px-6 py-4 shadow-[6px_6px_0_#1a1a1a] w-full max-w-lg mb-6 animate-stagger delay-100">
        <h3 className="font-mono text-sm font-bold text-ink mb-3">玩家列表 ({roomStore.players.length}/8)</h3>
        <div className="space-y-2">
          {roomStore.players.map((player) => (
            <div
              key={player.userId}
              className={`flex items-center justify-between px-3 py-2 border-2 transition-all card-hover ${
                player.userId === roomStore.hostId ? 'border-yellow' : 'border-ink'
              } ${player.userId === user?.id.toString() ? 'bg-yellow/20' : 'bg-cream'}`}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-ink">{player.nickname}</span>
                {player.userId === roomStore.hostId && (
                  <span className="bg-yellow text-ink text-xs px-1 font-bold shadow-[1px_1px_0_#1a1a1a]">房主</span>
                )}
                {player.userId === user?.id.toString() && (
                  <span className="text-ink/60 text-xs">(你)</span>
                )}
              </div>
              <span
                className={`font-mono text-sm font-bold ${player.isReady ? 'text-mint' : 'text-pink'}`}
              >
                {player.isReady ? '✓ 已准备' : '未准备'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 房主操作区：交错入场 */}
      {isHost && roomStore.status === 'waiting' && (
        <div className="bg-cream border-4 border-ink px-6 py-4 shadow-[6px_6px_0_#1a1a1a] w-full max-w-lg mb-6 animate-stagger delay-200">
          <h3 className="font-mono text-sm font-bold text-ink mb-3">房主设置</h3>
          <div className="flex gap-2 flex-wrap">
            {GAME_MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => handleSetMode(m.value)}
                className={`px-4 py-2 font-mono text-sm border-2 transition-all ${
                  selectedMode === m.value
                    ? 'bg-ink text-cream border-ink shadow-[2px_2px_0_#ff3d7f]'
                    : 'bg-cream text-ink border-ink hover:bg-ink hover:text-cream'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 压力源输入：交错入场 */}
      {roomStore.status === 'waiting' && (
        <div className="bg-cream border-4 border-ink px-6 py-4 shadow-[6px_6px_0_#1a1a1a] w-full max-w-lg mb-6 animate-stagger delay-300">
          <h3 className="font-mono text-sm font-bold text-ink mb-3">压力源</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={stressInput}
              onChange={(e) => setStressInput(e.target.value)}
              placeholder="描述你的压力来源..."
              aria-label="压力来源描述"
              className="flex-1 px-3 py-2 border-2 border-ink font-mono text-sm focus:outline-none focus:ring-2 focus:ring-pink/30 focus:border-pink transition-all"
            />
            <button
              onClick={handleSubmitStress}
              disabled={!stressInput.trim()}
              className="bg-ink text-cream px-4 py-2 font-mono text-sm hover:bg-pink transition-colors disabled:opacity-50"
            >
              提交
            </button>
          </div>
          {Object.keys(roomStore.stressSources).length > 0 && (
            <div className="mt-2 text-ink/60 font-mono text-xs">
              已提交: {Object.values(roomStore.stressSources).join(', ')}
            </div>
          )}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex gap-4 animate-stagger delay-400">
        {!isHost && roomStore.status === 'waiting' && (
          <button
            onClick={handleToggleReady}
            className={`px-8 py-3 font-mono text-sm font-bold tracking-wider transition-all shadow-[4px_4px_0_#1a1a1a] hover:shadow-[2px_2px_0_#1a1a1a] hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none ${
              isReady
                ? 'bg-red-500 text-cream hover:bg-red-600'
                : 'bg-mint text-ink hover:bg-ink hover:text-mint'
            }`}
          >
            {isReady ? '取消准备' : '准备'}
          </button>
        )}

        {isHost && roomStore.status === 'waiting' && (
          <button
            onClick={handleStartGame}
            disabled={roomStore.players.length < 1}
            className="bg-pink text-cream px-8 py-3 font-mono text-sm font-bold tracking-wider hover:bg-ink transition-all shadow-[4px_4px_0_#1a1a1a] hover:shadow-[2px_2px_0_#1a1a1a] hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[4px_4px_0_#1a1a1a]"
          >
            开始游戏
          </button>
        )}
      </div>

      {/* 错误提示：role=alert 强制屏幕阅读器立即朗读，确保房间操作失败时视障用户即时感知 */}
      {roomStore.error && (
        <div role="alert" className="mt-4 bg-red-100 border-2 border-red-500 px-4 py-2 animate-shake">
          <p className="text-red-600 font-mono text-sm">{roomStore.error}</p>
        </div>
      )}
    </div>
  );
}
