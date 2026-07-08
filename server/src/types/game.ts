// server/src/types/game.ts
// 游戏模式类型契约：跨 WebSocket/HTTP/持久化三层共享的业务概念
// 设计原因：原后端 mode 字段散落于 room-manager/events/settle-service/record-service 均为 string，
// 缺乏统一类型约束，前端已收敛为 GameMode（见 client/src/types/game.ts），后端需对齐。
// 中立于各业务层，避免 HTTP 服务层反向依赖 WebSocket 事件契约文件（events.ts）

/** 对战模式：boss=情绪Boss组队战 / brawl=解压自由乱斗 / speed=手速竞速挑战 */
export type GameMode = 'boss' | 'brawl' | 'speed';
