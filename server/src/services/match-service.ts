// server/src/services/match-service.ts
// 快速匹配服务：使用 Redis List 实现匹配队列

import redis from '../config/redis.js';
import { roomManager } from '../websocket/room-manager.js';
import { AppError, ErrorCode } from '../utils/error.js';

const MATCH_QUEUE_KEY = 'match:queue';
const MATCH_STATUS_KEY_PREFIX = 'match:status:'; // match:status:{userId}
const MATCH_TIMEOUT_MS = 30_000; // 30秒超时
const MATCH_PLAYER_COUNT = 4; // 4人匹配

// 模块级 timer 管理：userId -> setTimeout 句柄
// 设计原因：原 setTimeout 未保存返回值，leaveQuickMatch 无法取消，玩家离开后 30 秒仍执行无意义 redis 查询；
// 玩家多次加入离开会累积 timer 导致泄漏。Map 保存句柄后，leave/匹配成功时可 clearTimeout 释放
const matchTimers = new Map<string, NodeJS.Timeout>();

/** 清除指定玩家的匹配超时 timer（存在时 clearTimeout 并删除 Map 条目） */
function clearMatchTimer(userId: string): void {
  const timer = matchTimers.get(userId);
  if (timer) {
    clearTimeout(timer);
    matchTimers.delete(userId);
  }
}

interface QueuePlayer {
  userId: string;
  nickname: string;
  socketId: string;
  joinedAt: number;
}

/**
 * 获取队列中的玩家列表
 */
async function getQueuePlayers(): Promise<QueuePlayer[]> {
  const queue = await redis.lrange(MATCH_QUEUE_KEY, 0, -1);
  const players: QueuePlayer[] = [];

  for (const item of queue) {
    try {
      // 队列以 JSON 字符串单条存储玩家对象，解析还原结构
      // 设计原因：原扁平存储 4 个独立字段，lrem 按值删除时重复值会误删其他玩家字段
      const player = JSON.parse(item) as QueuePlayer;
      players.push({
        userId: player.userId,
        nickname: player.nickname,
        socketId: player.socketId,
        joinedAt: player.joinedAt,
      });
    } catch {
      // 跳过无法解析的脏数据，避免单个坏元素导致整队列解析失败
    }
  }

  return players;
}

/**
 * 移除玩家出队
 */
async function removeFromQueue(userId: string): Promise<void> {
  const queue = await redis.lrange(MATCH_QUEUE_KEY, 0, -1);

  for (const item of queue) {
    try {
      const player = JSON.parse(item) as QueuePlayer;
      if (player.userId === userId) {
        // 删除整个玩家 JSON 字符串，保证原子性
        // 设计原因：按值删除完整对象不会误伤其他玩家，规避扁平存储下重复值误删风险
        await redis.lrem(MATCH_QUEUE_KEY, 1, item);
        break;
      }
    } catch {
      // 跳过无法解析的元素，继续查找目标玩家
    }
  }
}

/**
 * 创建房间并加入所有玩家
 */
async function createRoomWithPlayers(players: QueuePlayer[]): Promise<string> {
  // 防御性 invariant：调用方（joinQuickMatch/checkAndMatch）调用前均保证 length >= MATCH_PLAYER_COUNT，
  // 此分支理论上永不触发。即使触发也应归为系统内部错误（INTERNAL_ERROR → HTTP 500），
  // 而非用户错误，与 idle-engine 内部 invariant 错误码语义保持一致。
  if (players.length === 0) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, '创建房间失败：玩家列表为空');
  }
  
  // 第一个玩家作为房主
  const host = players[0];
  const room = await roomManager.createRoom(host.userId, host.socketId, host.nickname);
  
  // 其他玩家加入房间
  for (let i = 1; i < players.length; i++) {
    const player = players[i];
    await roomManager.joinRoom(room.id, player.userId, player.socketId, player.nickname);
  }
  
  return room.id;
}

/**
 * 清理超时的玩家
 */
async function cleanupTimeoutPlayers(): Promise<void> {
  const players = await getQueuePlayers();
  const now = Date.now();
  
  for (const player of players) {
    if (now - player.joinedAt > MATCH_TIMEOUT_MS) {
      await removeFromQueue(player.userId);
    }
  }
}

/**
 * 加入快速匹配队列
 * - 尝试与队列中已有玩家匹配
 * - 若无匹配则加入队列，30秒后自动清理
 * - 队列满4人时自动创建房间
 */
export async function joinQuickMatch(
  userId: string,
  nickname: string,
  socketId: string
): Promise<{ roomId: string }> {
  // 先清理超时玩家
  await cleanupTimeoutPlayers();
  
  const players = await getQueuePlayers();
  const joinedAt = Date.now();
  
  // 检查是否已在队列中（处理状态过期但队列残留的边缘场景）
  if (players.some(p => p.userId === userId)) {
    throw new AppError(ErrorCode.BAD_REQUEST, '已在匹配队列中');
  }

  // 原子占位：SET NX EX 保证同一用户并发请求仅一个能继续，消除上方 some 检查与 rpush 之间的竞态窗口
  // 设计原因：some 检查与 rpush 非原子，双击匹配按钮等并发场景下两个请求都通过检查后重复入队
  const acquired = await redis.set(
    `${MATCH_STATUS_KEY_PREFIX}${userId}`,
    'matching',
    'EX',
    MATCH_TIMEOUT_MS / 1000,
    'NX'
  );
  if (!acquired) {
    throw new AppError(ErrorCode.BAD_REQUEST, '已在匹配队列中');
  }

  // 单条 JSON 字符串入队，确保 lrem 可按完整对象原子删除
  // 设计原因：扁平存储 4 字段时重复值会误删其他玩家，JSON 单条存储规避该风险
  const player: QueuePlayer = { userId, nickname, socketId, joinedAt };
  await redis.rpush(MATCH_QUEUE_KEY, JSON.stringify(player));
  
  // 检查队列是否已满
  const updatedPlayers = await getQueuePlayers();
  
  if (updatedPlayers.length >= MATCH_PLAYER_COUNT) {
    // 取前4个玩家创建房间
    const matchedPlayers = updatedPlayers.slice(0, MATCH_PLAYER_COUNT);
    
    // 批量移除
    for (const player of matchedPlayers) {
      await removeFromQueue(player.userId);
      // 清除匹配状态
      await redis.del(`${MATCH_STATUS_KEY_PREFIX}${player.userId}`);
      // 清除匹配超时 timer：玩家已匹配成功，无需再等 30 秒超时回调
      // 设计原因：未清除则 timer 在 30 秒后仍触发，回调内 getQueuePlayers 找不到该玩家虽不会误删，
      // 但会产生 1 次无意义的 Redis 查询；累积下会产生大量空转 IO
      clearMatchTimer(player.userId);
    }

    // 创建房间
    const roomId = await createRoomWithPlayers(matchedPlayers);
    return { roomId };
  }
  
  // 30秒超时清理：保存句柄到 matchTimers，供 leaveQuickMatch / 匹配成功路径取消
  // 设计原因：原 setTimeout 未保存返回值，玩家离开或匹配成功后 30 秒仍执行无意义 Redis 查询；
  // 多次加入离开会累积 timer 导致泄漏。Map 保存句柄后可在适当时机 clearTimeout 释放
  const timer = setTimeout(async () => {
    try {
      // 回调执行后无论是否清理成功，都先删除 Map 条目，避免 Map 无限增长
      matchTimers.delete(userId);
      const currentPlayers = await getQueuePlayers();
      const player = currentPlayers.find(p => p.userId === userId);

      if (player) {
        await removeFromQueue(userId);
        await redis.del(`${MATCH_STATUS_KEY_PREFIX}${userId}`);
      }
    } catch {
      // timer 回调无调用方可传递错误，静默失败即可：
      // 最坏情况下 match:status 会随 setex 30 秒自然过期，不会永久残留
    }
  }, MATCH_TIMEOUT_MS);
  matchTimers.set(userId, timer);

  // 匹配状态已在入队前通过 SET NX EX 原子设置，此处无需重复 setex
  throw new AppError(ErrorCode.BAD_REQUEST, `正在匹配中，请稍候（${updatedPlayers.length}/${MATCH_PLAYER_COUNT}）`);
}

/**
 * 离开匹配队列
 */
export async function leaveQuickMatch(userId: string): Promise<void> {
  // 先清除匹配超时 timer：玩家已主动离开，无需再等 30 秒回调执行无意义 Redis 查询
  // 设计原因：未清除则 timer 在 30 秒后仍触发，回调内 getQueuePlayers 找不到该玩家虽不会误删，
  // 但会产生 1 次无意义的 Redis 查询；多次加入离开会累积 timer 导致内存泄漏
  clearMatchTimer(userId);
  await removeFromQueue(userId);
  await redis.del(`${MATCH_STATUS_KEY_PREFIX}${userId}`);
}

/**
 * 获取匹配状态
 */
export async function getMatchStatus(userId: string): Promise<{ inQueue: boolean; queueCount?: number }> {
  const inQueue = await redis.exists(`${MATCH_STATUS_KEY_PREFIX}${userId}`);

  if (inQueue) {
    const players = await getQueuePlayers();
    // joinQuickMatch 先 rpush 入队再 setex 设状态，正常情况下队列已包含自己，players.length 即正确人数；
    // 边缘情况：被其他路径（如 cleanupTimeoutPlayers）移除出队列但状态未清时，players 不含自己，需 +1 补偿。
    // 统一检查是否包含自己，避免正常路径多算 1
    const meInQueue = players.some(p => p.userId === userId);
    return { inQueue: true, queueCount: meInQueue ? players.length : players.length + 1 };
  }

  return { inQueue: false };
}

/**
 * 检查并触发匹配（供定时任务调用）
 */
export async function checkAndMatch(): Promise<void> {
  const players = await getQueuePlayers();
  
  while (players.length >= MATCH_PLAYER_COUNT) {
    const matchedPlayers = players.slice(0, MATCH_PLAYER_COUNT);
    
    // 批量移除
    for (const player of matchedPlayers) {
      await removeFromQueue(player.userId);
      await redis.del(`${MATCH_STATUS_KEY_PREFIX}${player.userId}`);
      // 与 joinQuickMatch 匹配成功路径一致：清除超时 timer，避免 30 秒后无意义回调
      clearMatchTimer(player.userId);
    }

    // 创建房间
    await createRoomWithPlayers(matchedPlayers);

    // 更新剩余玩家列表
    players.splice(0, MATCH_PLAYER_COUNT);
  }
}
