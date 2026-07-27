// client/src/websocket/events.ts
// 客户端 WebSocket 事件名常量契约
// 设计原因：与服务端 server/src/websocket/events.ts 对称，消除客户端散落的
// 事件名字面量（websocket/index.ts / battle-scene.ts / battle.tsx 共 30+ 处），
// 避免拼写错误导致事件监听失效或远程操作静默失败。
// 独立定义而不跨端导入 server/events.ts：前后端为独立构建单元，
// 客户端不应直接引用服务端源码，保持构建边界清晰。

/** 房间相关事件（与服务端 RoomEvents 完全一致） */
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

/**
 * 游戏相关事件
 * 设计原因：仅声明客户端实际使用的事件，不镜像服务端 3 个未使用常量
 *（EVENT / EFFECT_INTENSITY / RHYTHM_REPORT），避免引入死代码
 */
export const GameEvents = {
  LEVEL_READY: 'game:level-ready',
  START: 'game:start',
  ACTION: 'game:action',
  SCORE_UPDATE: 'game:score-update',
  FINISH: 'game:finish',
} as const;
