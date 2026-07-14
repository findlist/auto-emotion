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
      // resetRoom 必须先于 setLoading：reset 会将 loading 置 false，
      // 若顺序颠倒 setLoading(true) 会被 reset 覆盖，导致等待期间按钮可重复点击
      resetRoom();
      setLoading(true);
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
    } finally {
      // 确保所有路径都重置 loading：成功跳转后用户可能返回大厅，
      // 若 loading 残留 true 会导致按钮永久禁用无法再次操作
      setLoading(false);
    }
  }

  /** 加入房间 */
  function handleJoinRoom() {
    if (!roomCode.trim()) return;
    try {
      // resetRoom 先于 setLoading，避免 reset 覆盖 loading 状态（同 handleCreateRoom）
      resetRoom();
      setLoading(true);
      connect();
      roomActions.joinRoom(roomCode.trim().toUpperCase(), user?.nickname ?? '未知');
      onEnterRoom();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加入房间失败';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  /** 快速匹配 */
  async function handleQuickMatch() {
    try {
      // resetRoom 先于 setMatching，避免 reset 覆盖房间状态时影响 matching 展示
      resetRoom();
      setMatching(true);
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
    } finally {
      // 确保所有路径都重置 matching：成功跳转后用户可能返回大厅，
      // 若 matching 残留 true 会导致按钮永久显示"匹配中..."且禁用
      setMatching(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 scrollbar-brutal">
      {/* 标题：交错入场，添加副标徽章；标题响应式避免小屏溢出 */}
      <div className="text-center mb-8 animate-stagger">
        <span className="inline-block bg-ink text-cream px-3 py-1 text-xs font-bold tracking-widest mb-3 shadow-[3px_3px_0_#ff3d7f]">
          BATTLE LOBBY
        </span>
        <h1 className="font-cn text-4xl sm:text-5xl text-ink mb-2 drop-shadow-[4px_4px_0_rgba(255,107,53,0.3)]">
          游戏大厅
        </h1>
        <p className="text-ink/70 font-mono text-sm">选择一个模式开始游戏</p>
      </div>

      {/* 角色信息卡：交错入场，加左侧色条装饰；w-80 配 max-w-full 避免小屏溢出 */}
      {user && (
        <div className="bg-cream border-4 border-ink px-6 py-4 shadow-[6px_6px_0_#1a1a1a] mb-8 w-80 max-w-full animate-stagger delay-100 relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-pink" aria-hidden="true" />
          <div className="text-left font-mono text-sm pl-2">
            <p className="text-ink mb-3">
              <span className="text-ink/60">昵称:</span> <span className="font-bold">{user.nickname}</span>
            </p>
            {/* 三项核心数据 grid 排列：等级/金币/战力分色区分，比原垂直堆叠更紧凑且层次清晰 */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-ink/5 px-2 py-1.5 rounded">
                <p className="text-ink/60 text-xs">等级</p>
                <p className="text-ink font-bold">Lv.{user.level}</p>
              </div>
              <div className="bg-yellow/20 px-2 py-1.5 rounded">
                <p className="text-ink/60 text-xs">金币</p>
                <p className="text-yellow font-bold">{user.coins}</p>
              </div>
              <div className="bg-mint/20 px-2 py-1.5 rounded">
                <p className="text-ink/60 text-xs">战力</p>
                <p className="text-mint font-bold">{user.power}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 操作按钮区：整体交错入场，每个按钮加 active 按下；w-64 配 max-w-full 避免小屏溢出 */}
      <div className="flex flex-col gap-4 w-64 max-w-full animate-stagger delay-200">
        {/* 创建房间：加 🚪 图标增强按钮可扫描性 */}
        <button
          onClick={handleCreateRoom}
          disabled={loading}
          className="bg-yellow text-ink px-6 py-3 font-mono text-sm font-bold tracking-wider hover:bg-ink hover:text-yellow transition-all shadow-[4px_4px_0_#1a1a1a] hover:shadow-[2px_2px_0_#1a1a1a] hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[4px_4px_0_#1a1a1a] disabled:hover:bg-yellow disabled:hover:text-ink"
        >
          <span aria-hidden="true" className="mr-1">🚪</span> 创建房间
        </button>

        {/* 快速匹配：加 ⚡ 图标暗示"快速"语义 */}
        <button
          onClick={handleQuickMatch}
          disabled={matching}
          className="bg-pink text-cream px-6 py-3 font-mono text-sm font-bold tracking-wider hover:bg-ink transition-all shadow-[4px_4px_0_#1a1a1a] hover:shadow-[2px_2px_0_#1a1a1a] hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[4px_4px_0_#1a1a1a] disabled:hover:bg-pink disabled:hover:text-cream"
        >
          {matching ? '匹配中...' : <><span aria-hidden="true" className="mr-1">⚡</span> 快速匹配</>}
        </button>

        {/* 加入房间切换：加 🔑 图标暗示"凭房间号进入"语义 */}
        {!showJoinInput ? (
          <button
            onClick={() => setShowJoinInput(true)}
            className="bg-cream text-ink border-2 border-ink px-6 py-3 font-mono text-sm font-bold tracking-wider hover:bg-ink hover:text-cream transition-all shadow-[4px_4px_0_#1a1a1a] hover:shadow-[2px_2px_0_#1a1a1a] hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none"
          >
            <span aria-hidden="true" className="mr-1">🔑</span> 加入房间
          </button>
        ) : (
          <div className="flex gap-2 animate-slide-left">
            <input
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="房间号"
              aria-label="房间号"
              maxLength={6}
              className="flex-1 px-3 py-2 border-2 border-ink font-mono text-sm uppercase tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-pink/30 focus:border-pink transition-all"
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

      {/* 错误提示：role=alert 强制屏幕阅读器立即朗读，确保操作失败时视障用户即时感知
          使用 pink 系配色与 Neo-brutalism 调色板一致（原 red 系脱离设计系统） */}
      {error && (
        <div role="alert" className="mt-4 bg-pink/10 border-2 border-pink px-4 py-2 animate-shake shadow-[3px_3px_0_#1a1a1a]">
          <p className="text-pink font-mono text-sm">{error}</p>
        </div>
      )}
    </div>
  );
}
