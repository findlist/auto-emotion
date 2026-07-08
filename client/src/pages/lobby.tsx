// client/src/pages/lobby.tsx
// 大厅页：角色信息 + 创建/加入房间 + 快速匹配

import { useState } from 'react';
import { useUserStore } from '@/stores/user-store';
import { useRoomStore } from '@/stores/room-store';
import { connect, roomActions, waitForConnection } from '@/websocket/index';
import http from '@/api/http';

interface LobbyPageProps {
  onEnterRoom: () => void;
}

export default function LobbyPage({ onEnterRoom }: LobbyPageProps) {
  const user = useUserStore((s) => s.user);
  const resetRoom = useRoomStore((s) => s.reset);
  const setLoading = useRoomStore((s) => s.setLoading);
  const setError = useRoomStore((s) => s.setError);
  // 订阅 loading/error：原代码在 JSX 中 useRoomStore.getState() 直读会导致 UI 不随状态更新（React 反模式）
  const loading = useRoomStore((s) => s.loading);
  const error = useRoomStore((s) => s.error);

  const [roomCode, setRoomCode] = useState('');
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [matching, setMatching] = useState(false);

  /** 创建房间 */
  async function handleCreateRoom() {
    try {
      setLoading(true);
      resetRoom();
      connect();

      // 通过 API 创建房间
      // 设计原因:改用 http 实例复用 axios 拦截器,自动注入 JWT 与解包 ApiResponse,
      // 避免原生 fetch 手动读 token 的鉴权风险与响应格式不一致问题
      const res = await http.post('/room/create', { nickname: user?.nickname });
      const data = res.data as { roomId: string; hostId: string; players: never[] };

      useRoomStore.getState().setRoom({
        roomId: data.roomId,
        hostId: data.hostId,
        status: 'waiting',
        mode: 'boss',
        players: data.players,
        stressSources: {},
      });

      roomActions.joinRoom(data.roomId, user?.nickname ?? '未知');
      onEnterRoom();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '创建房间失败';
      setError(msg);
      setLoading(false);
    }
  }

  /** 加入房间 */
  function handleJoinRoom() {
    if (!roomCode.trim()) return;
    try {
      setLoading(true);
      resetRoom();
      connect();
      roomActions.joinRoom(roomCode.trim().toUpperCase(), user?.nickname ?? '未知');
      onEnterRoom();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加入房间失败';
      setError(msg);
      setLoading(false);
    }
  }

  /** 快速匹配 */
  async function handleQuickMatch() {
    try {
      setMatching(true);
      resetRoom();
      connect();

      // 等待连接完成以获取有效 socket.id：connect() 同步返回时 socket.id 尚未就绪，
      // socket.io 连接握手是异步的，需等待 connect 事件后 socket.id 才可用。
      // 后端 match.ts 用 !socketId 校验，传空字符串会被 400 拒绝。
      const sock = await waitForConnection();
      const socketId = sock.id;
      if (!socketId) {
        throw new Error('WebSocket 连接异常，未能获取 socketId');
      }

      const res = await http.post('/match/quick', {
        nickname: user?.nickname,
        socketId,
      });
      const data = res.data as { roomId?: string; inQueue?: boolean; queueCount?: number };

      // 匹配未满 4 人:后端返回 { inQueue: true, queueCount },不进入房间页等待 socket 同步
      if (data.inQueue) {
        setMatching(false);
        setError(`匹配中,当前队列 ${data.queueCount} 人,凑齐 4 人自动开局`);
        return;
      }

      // 匹配成功:match/quick 仅返回 { roomId },完整房间数据由 socket room:state 事件自动同步,
      // 前端无需从 HTTP 响应设置 hostId/players,避免后端不返回这些字段时写入 undefined
      const roomId = data.roomId;
      if (!roomId) {
        throw new Error('匹配响应异常');
      }

      roomActions.joinRoom(roomId, user?.nickname ?? '未知');
      onEnterRoom();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '匹配失败';
      setError(msg);
      setMatching(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="font-cn text-5xl text-ink mb-2">游戏大厅</h1>
        <p className="text-ink/70">选择一个模式开始游戏</p>
      </div>

      {/* 角色信息卡 */}
      {user && (
        <div className="bg-cream border-4 border-ink px-6 py-4 shadow-[6px_6px_0_#1a1a1a] mb-8 w-80">
          <div className="text-left space-y-2 font-mono text-sm">
            <p className="text-ink">
              <span className="text-ink/60">昵称:</span> {user.nickname}
            </p>
            <p className="text-ink">
              <span className="text-ink/60">等级:</span> Lv.{user.level}
            </p>
            <p className="text-ink">
              <span className="text-ink/60">金币:</span> {user.coins}
            </p>
            <p className="text-ink">
              <span className="text-ink/60">战力:</span> {user.power}
            </p>
          </div>
        </div>
      )}

      {/* 操作按钮区 */}
      <div className="flex flex-col gap-4 w-64">
        {/* 创建房间 */}
        <button
          onClick={handleCreateRoom}
          disabled={loading}
          className="bg-yellow text-ink px-6 py-3 font-mono text-sm font-bold tracking-wider hover:bg-ink hover:text-yellow transition-colors shadow-[4px_4px_0_#1a1a1a] disabled:opacity-50"
        >
          创建房间
        </button>

        {/* 快速匹配 */}
        <button
          onClick={handleQuickMatch}
          disabled={matching}
          className="bg-pink text-cream px-6 py-3 font-mono text-sm font-bold tracking-wider hover:bg-ink transition-colors shadow-[4px_4px_0_#1a1a1a] disabled:opacity-50"
        >
          {matching ? '匹配中...' : '快速匹配'}
        </button>

        {/* 加入房间切换 */}
        {!showJoinInput ? (
          <button
            onClick={() => setShowJoinInput(true)}
            className="bg-cream text-ink border-2 border-ink px-6 py-3 font-mono text-sm font-bold tracking-wider hover:bg-ink hover:text-cream transition-colors"
          >
            加入房间
          </button>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="房间号"
              aria-label="房间号"
              maxLength={6}
              className="flex-1 px-3 py-2 border-2 border-ink font-mono text-sm uppercase tracking-widest text-center"
            />
            <button
              onClick={handleJoinRoom}
              disabled={!roomCode.trim()}
              className="bg-ink text-cream px-4 py-2 font-mono text-sm font-bold hover:bg-pink transition-colors disabled:opacity-50"
            >
              加入
            </button>
            <button
              onClick={() => {
                setShowJoinInput(false);
                setRoomCode('');
              }}
              aria-label="取消加入房间"
              className="bg-cream text-ink border-2 border-ink px-3 py-2 font-mono text-sm hover:bg-ink hover:text-cream transition-colors"
            >
              ×
            </button>
          </div>
        )}
      </div>

      {/* 错误提示：role=alert 强制屏幕阅读器立即朗读，确保操作失败时视障用户即时感知 */}
      {error && (
        <div role="alert" className="mt-4 bg-red-100 border-2 border-red-500 px-4 py-2">
          <p className="text-red-600 font-mono text-sm">{error}</p>
        </div>
      )}
    </div>
  );
}
