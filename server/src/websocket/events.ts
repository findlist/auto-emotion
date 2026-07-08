// server/src/websocket/events.ts
// Socket.IO 事件常量与 payload 类型契约定义
// 设计原因：将事件名常量与对应 payload 类型集中在同一文件，
// 形成"事件协议文档"，便于前后端对齐数据结构，避免 handlers/room-manager 各自定义内联类型导致漂移

import type { GameMode } from '../types/game.js';

/** 房间相关事件 */
export const RoomEvents = {
  JOIN: 'room:join',
  LEAVE: 'room:leave',
  READY: 'room:ready',
  UNREADY: 'room:unready',
  SET_MODE: 'room:set-mode',
  SUBMIT_STRESS: 'room:submit-stress',
  START: 'room:start',
  STATE: 'room:state',
  ERROR: 'room:error',
  // 玩家异常断线通知：仅作提示，不移除房间数据，为重连保留窗口
  PLAYER_OFFLINE: 'room:player-offline',
} as const;

/** 游戏相关事件 */
export const GameEvents = {
  LEVEL_READY: 'game:level-ready',
  START: 'game:start',
  ACTION: 'game:action',
  SCORE_UPDATE: 'game:score-update',
  EVENT: 'game:event',
  FINISH: 'game:finish',
  EFFECT_INTENSITY: 'game:effect-intensity',
  RHYTHM_REPORT: 'game:rhythm-report',
} as const;

// ============ 客户端 → 服务端 事件 Input 类型 ============

/** 加入房间：roomId + 昵称 */
export interface JoinInput {
  roomId: string;
  nickname: string;
}

/** 离开房间 */
export interface LeaveInput {
  roomId: string;
}

/** 准备 / 取消准备 */
export interface ReadyInput {
  roomId: string;
}

/** 设置对战模式（mode 收敛为 GameMode，由 roomManager 业务层校验合法值） */
export interface SetModeInput {
  roomId: string;
  mode: GameMode;
}

/** 提交压力源 */
export interface SubmitStressInput {
  roomId: string;
  stressSource: string;
}

/** 开始游戏 */
export interface StartInput {
  roomId: string;
}

/** 游戏操作：payload 保持 unknown，因为不同 action 的 payload 结构不同（shoot/move/skill 等） */
export interface ActionInput {
  roomId: string;
  action: string;
  payload?: unknown;
}

/** 分数上报 */
export interface ScoreUpdateInput {
  roomId: string;
  score: number;
  combo?: number;
}

/** 游戏结束上报 */
export interface FinishInput {
  roomId: string;
  finalScore: number;
  result: 'win' | 'lose';
}

// ============ 服务端 → 客户端 事件 Payload 类型 ============

/** 房间全量状态下发：所有 room:state 事件统一载荷 */
export interface StatePayload {
  room: unknown; // Room 完整对象，避免 events.ts ↔ room-manager.ts 循环依赖，此处用 unknown
}

/** 错误提示
 * 设计原因：原仅传 message，前端无法区分错误类型做差异化处理。
 * 增加 code 字段（ErrorCode 枚举值），与 HTTP 错误响应 {code, message} 结构对齐，
 * 前端可基于 code 做差异化提示（如 NOT_FOUND 引导返回、FORBIDDEN 提示权限不足）。
 * code 可选，兼容前端旧版仅读 message 的场景。
 */
export interface ErrorPayload {
  code?: number;
  message: string;
}

/** 玩家异常断线通知 */
export interface PlayerOfflinePayload {
  userId: string;
}

/** 游戏开始通知 */
export interface GameStartPayload {
  roomId: string;
}

/** 游戏操作广播：含发送者 userId 与时间戳 */
export interface ActionPayload {
  userId: string;
  action: string;
  payload?: unknown;
  timestamp: number;
}

/** 分数上报广播 */
export interface ScoreUpdatePayload {
  userId: string;
  score: number;
  combo: number;
  timestamp: number;
}

/** 游戏结束广播 */
export interface FinishPayload {
  userId: string;
  finalScore: number;
  result: 'win' | 'lose';
  timestamp: number;
}

/**
 * 关卡就绪数据：游戏开始后服务端生成并广播给所有玩家
 * 设计原因：原定义在 room-manager.ts，但其本质是 game:level-ready 事件的 payload，
 * 移至 events.ts 与其他 payload 类型统一管理，room-manager.ts 反向引用
 */
export interface LevelReadyPayload {
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
