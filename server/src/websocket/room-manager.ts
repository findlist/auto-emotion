// server/src/websocket/room-manager.ts
// 房间状态机管理：waiting→ready→generating→playing→settling→closed
// 使用 Redis 存储房间数据

import { randomBytes } from 'crypto';
import { io } from './index.js';
import { GameEvents, RoomEvents, type LevelReadyPayload } from './events.js';
import type { GameMode } from '../types/game.js';
import redis from '../config/redis.js';
import { AppError, ErrorCode } from '../utils/error.js';
import { generate } from '../ai/monster-generator.js';
import { generateLevel } from '../ai/level-generator.js';
import { generateEvents } from '../ai/event-generator.js';

export type RoomStatus = 'waiting' | 'ready' | 'generating' | 'playing' | 'settling' | 'closed';

/**
 * 关卡就绪数据类型别名
 * 设计原因：LevelReadyPayload 已移至 events.ts 作为事件 payload 契约统一管理，
 * 此处保留 LevelReadyData 别名兼容内部代码引用，避免大面积重命名
 */
export type LevelReadyData = LevelReadyPayload;

export interface Room {
  id: string;
  hostId: string;
  status: RoomStatus;
  mode: GameMode;
  players: Player[];
  stressSources: Record<string, string>; // userId -> stress source
  // 类型收敛：原为 unknown，现精确为 LevelReadyPayload，handlers 重连恢复时可类型安全地 emit
  levelData?: LevelReadyPayload;
}

interface Player {
  userId: string;
  nickname: string;
  socketId: string;
  isReady: boolean;
}

const ROOM_TTL = 5 * 60; // 5分钟 TTL

/** 生成6位房间号 */
function generateRoomId(): string {
  // 使用 crypto.randomBytes 替代 Math.random，降低房间 ID 碰撞概率与可预测性
  return randomBytes(8).readBigUInt64BE().toString(36).slice(0, 6).toUpperCase();
}

/** 将 Room 序列化时转换 Map 为对象 */
function serializeRoom(room: Room): string {
  return JSON.stringify(room);
}

/** 反序列化 Room */
function deserializeRoom(data: string): Room {
  const room = JSON.parse(data) as Room;
  return room;
}

export const roomManager = {
  /**
   * 房间更新锁：包装 read-modify-write 操作，防止并发修改丢失
   * 设计原因：原 joinRoom/setReady 等方法先 getRoom 读取再 setex 写回，
   * 两个并发请求都读到同一房间状态，各自修改后第二个写回覆盖第一个，导致丢失更新。
   * SET NX EX 是单命令原子操作，获取锁失败的请求短暂等待后重试一次；
   * TTL 5 秒兜底防止持锁进程崩溃导致死锁。
   */
  async withRoomLock<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
    const lockKey = `room:lock:update:${roomId}`;
    // 尝试获取锁，失败则短暂等待后重试一次，避免高频并发时直接抛错影响体验
    let acquired = await redis.set(lockKey, '1', 'EX', 5, 'NX');
    if (!acquired) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      acquired = await redis.set(lockKey, '1', 'EX', 5, 'NX');
      if (!acquired) throw new AppError(ErrorCode.CONFLICT, '房间正忙，请稍后重试');
    }
    try {
      return await fn();
    } finally {
      // 释放锁，忽略释放错误（TTL 兜底）
      redis.del(lockKey).catch(() => {});
    }
  },

  /** 创建房间 */
  async createRoom(hostId: string, hostSocketId: string, hostNickname: string): Promise<Room> {
    const room: Room = {
      id: generateRoomId(),
      hostId,
      status: 'waiting',
      mode: 'boss',
      players: [{ userId: hostId, nickname: hostNickname, socketId: hostSocketId, isReady: false }],
      stressSources: {},
    };

    await redis.setex(`room:${room.id}`, ROOM_TTL, serializeRoom(room));
    return room;
  },

  /** 获取房间 */
  async getRoom(roomId: string): Promise<Room | null> {
    const data = await redis.get(`room:${roomId}`);
    if (!data) return null;
    return deserializeRoom(data);
  },

  /** 加入房间（支持断线重连：玩家已在房间时更新 socketId 并返回当前状态） */
  async joinRoom(roomId: string, userId: string, socketId: string, nickname: string): Promise<Room> {
    return this.withRoomLock(roomId, async () => {
      const room = await this.getRoom(roomId);
      if (!room) throw new AppError(ErrorCode.NOT_FOUND, '房间不存在');

      // 重连场景：玩家已在房间，刷新 socketId 与昵称后直接返回当前房间状态
      const existingPlayer = room.players.find((p) => p.userId === userId);
      if (existingPlayer) {
        existingPlayer.socketId = socketId;
        existingPlayer.nickname = nickname;
        await redis.setex(`room:${roomId}`, ROOM_TTL, serializeRoom(room));
        return room;
      }

      // 新玩家加入：仅 waiting 状态允许
      if (room.status !== 'waiting') throw new AppError(ErrorCode.BAD_REQUEST, '房间已开始，无法加入');
      if (room.players.length >= 8) throw new AppError(ErrorCode.BAD_REQUEST, '房间已满');

      room.players.push({ userId, nickname, socketId, isReady: false });
      await redis.setex(`room:${roomId}`, ROOM_TTL, serializeRoom(room));
      return room;
    });
  },

  /** 离开房间 */
  async leaveRoom(roomId: string, userId: string): Promise<Room | null> {
    return this.withRoomLock(roomId, async () => {
      const room = await this.getRoom(roomId);
      if (!room) return null;

      room.players = room.players.filter((p) => p.userId !== userId);
      delete room.stressSources[userId];

      // 房主离开，转移给第一个玩家
      if (room.hostId === userId && room.players.length > 0) {
        room.hostId = room.players[0].userId;
      }

      if (room.players.length === 0) {
        await redis.del(`room:${roomId}`);
        return null;
      }

      await redis.setex(`room:${roomId}`, ROOM_TTL, serializeRoom(room));
      return room;
    });
  },

  /** 设置准备状态 */
  async setReady(roomId: string, userId: string, isReady: boolean): Promise<Room> {
    return this.withRoomLock(roomId, async () => {
      const room = await this.getRoom(roomId);
      if (!room) throw new AppError(ErrorCode.NOT_FOUND, '房间不存在');

      const player = room.players.find((p) => p.userId === userId);
      // 非房间成员调用 setReady 会错误聚合状态（如其他人已就绪时把房间置为 ready），需拒绝
      if (!player) throw new AppError(ErrorCode.FORBIDDEN, '不在房间内');
      player.isReady = isReady;

      // 所有玩家都准备好了？
      if (room.players.every((p) => p.isReady) && room.players.length >= 1) {
        room.status = 'ready';
      } else {
        room.status = 'waiting';
      }

      await redis.setex(`room:${roomId}`, ROOM_TTL, serializeRoom(room));
      return room;
    });
  },

  /** 设置游戏模式（仅房主） */
  async setMode(roomId: string, userId: string, mode: GameMode): Promise<Room> {
    return this.withRoomLock(roomId, async () => {
      const room = await this.getRoom(roomId);
      if (!room) throw new AppError(ErrorCode.NOT_FOUND, '房间不存在');
      if (room.hostId !== userId) throw new AppError(ErrorCode.FORBIDDEN, '只有房主可以设置模式');

      room.mode = mode;
      await redis.setex(`room:${roomId}`, ROOM_TTL, serializeRoom(room));
      return room;
    });
  },

  /** 提交压力源 */
  async submitStress(roomId: string, userId: string, stressSource: string): Promise<Room> {
    return this.withRoomLock(roomId, async () => {
      const room = await this.getRoom(roomId);
      if (!room) throw new AppError(ErrorCode.NOT_FOUND, '房间不存在');

      room.stressSources[userId] = stressSource;
      await redis.setex(`room:${roomId}`, ROOM_TTL, serializeRoom(room));
      return room;
    });
  },

  /** 开始游戏（仅房主）：触发 AI 关卡生成 */
  async startGame(roomId: string, userId: string): Promise<Room> {
    const room = await this.getRoom(roomId);
    if (!room) throw new AppError(ErrorCode.NOT_FOUND, '房间不存在');
    if (room.hostId !== userId) throw new AppError(ErrorCode.FORBIDDEN, '只有房主可以开始游戏');
    if (room.status !== 'ready') throw new AppError(ErrorCode.CONFLICT, '游戏已开始或未准备');

    // 原子获取开始锁，防止房主连点两次重复触发关卡生成
    // 设计原因：原实现 getRoom 读取 status=ready 后 setex 写回 generating，并发请求都读到 ready
    // 都设置 generating 并触发 generateLevelAndEvents，导致 AI 生成两次（成本高）+ 广播两次 LEVEL_READY
    // SET NX EX 是单命令原子操作，获取锁失败的请求直接抛错；TTL 30 秒兜底防止进程崩溃死锁
    const lockKey = `room:lock:start:${roomId}`;
    const acquired = await redis.set(lockKey, '1', 'EX', 30, 'NX');
    if (!acquired) throw new AppError(ErrorCode.CONFLICT, '游戏正在开始，请勿重复点击');

    room.status = 'generating';
    await redis.setex(`room:${roomId}`, ROOM_TTL, serializeRoom(room));

    // 异步生成关卡和事件，完成后释放锁允许下一局重新开始
    this.generateLevelAndEvents(room)
      .catch((err) => {
        console.error('关卡生成失败:', err);
        // 关卡生成失败后恢复房间状态为 ready，避免房间卡死在 generating 无法重新开局
        // 设计原因：原 catch 仅记录日志，room.status 留在 generating，而 startGame 要求 status===ready
        // 才允许开局，导致房主无法再次开始，房间永久不可用；恢复为 ready 后玩家可重试
        room.status = 'ready';
        // Promise.resolve 包装防止 setex 返回非 Promise（如降级场景）时 .catch 报错
        Promise.resolve(redis.setex(`room:${room.id}`, ROOM_TTL, serializeRoom(room))).catch(() => {});
        this.broadcast(room.id, RoomEvents.ERROR, { message: '开局失败，请重试' });
      })
      .finally(() => {
        // 释放开始锁，忽略释放错误（TTL 兜底）
        redis.del(lockKey).catch(() => {});
      });

    return room;
  },

  /** AI 生成关卡和事件并广播 */
  async generateLevelAndEvents(room: Room): Promise<void> {
    const stressSources = Object.values(room.stressSources);
    if (stressSources.length === 0) {
      stressSources.push('工作压力');
    }

    const difficulty = Math.min(5, Math.max(1, room.players.length));

    // 并行调用三个生成器
    const [monsterResult, levelResult, eventsResult] = await Promise.allSettled([
      Promise.resolve().then(() => generate({ stressKeywords: stressSources, difficulty })),
      generateLevel(room.mode, difficulty, stressSources),
      Promise.resolve().then(() => generateEvents(3, 30, 20)),
    ]);

    // 怪兽兜底数据：结构与 MonsterConfig 对齐，避免 generator 失败时字段缺失导致后续取值异常
    const monster = monsterResult.status === 'fulfilled'
      ? monsterResult.value
      : {
          name: '压力怪兽',
          avatar: '👾',
          hp: difficulty * 1000,
          attack: 50 + difficulty * 10,
          skills: [
            { name: '压力冲击', type: 'attack', effect: '造成伤害', cooldown: 5 },
            { name: '焦虑波', type: 'debuff', effect: '降低移速', cooldown: 8 },
          ],
          weakness: '被情绪释放技能击破',
          stressTags: ['压力'],
          appearance: { color: '#888888', shape: 'circle', size: 1.0 + difficulty * 0.5 },
        };

    // 关卡兜底数据
    const level = levelResult.status === 'fulfilled'
      ? levelResult.value
      : {
          mode: room.mode,
          difficulty,
          destructibles: [],
          spawnPoints: [{ x: 400, y: 500 }, { x: 600, y: 500 }],
          bossSpawn: room.mode === 'boss' ? { x: 400, y: 150 } : undefined,
        };

    // 事件兜底数据
    const events = eventsResult.status === 'fulfilled'
      ? eventsResult.value
      : [];

    // 记录失败的生成器
    if (monsterResult.status === 'rejected') {
      console.warn('怪兽生成失败，使用兜底数据:', monsterResult.reason);
    }
    if (levelResult.status === 'rejected') {
      console.warn('关卡生成失败，使用兜底数据:', levelResult.reason);
    }
    if (eventsResult.status === 'rejected') {
      console.warn('事件生成失败，使用兜底数据:', eventsResult.reason);
    }

    // 情绪标签取首个压力关键词：stressTags 是玩家输入的压力来源（如"加班""KPI"），
    // 才是怪兽的"情绪"语义；weakness 是弱点描述（如"被连击 10 次眩晕"），语义不符
    const monsterEmotion = monster.stressTags[0] ?? '压力';

    const levelReadyData: LevelReadyData = {
      monster: {
        name: monster.name,
        hp: monster.hp,
        // attack 由 monster-generator 基于 difficulty 统一计算，避免数据来源分散
        attack: monster.attack,
        skills: monster.skills.map((s) => s.name),
        emotion: monsterEmotion,
      },
      level: {
        destructibles: level.destructibles.map((d) => ({
          type: d.type,
          x: d.x,
          y: d.y,
          hp: d.hp,
        })),
        spawnPoints: level.spawnPoints,
        bossPoint: level.bossSpawn || { x: 400, y: 150 },
      },
      events: events.map((e) => ({
        type: e.type,
        description: e.name,
        effect: e.effect,
      })),
    };

    // 存储关卡数据到房间
    room.levelData = levelReadyData;
    await redis.setex(`room:${room.id}`, ROOM_TTL, serializeRoom(room));

    // 更新房间状态为 playing
    room.status = 'playing';
    await redis.setex(`room:${room.id}`, ROOM_TTL, serializeRoom(room));

    // 广播关卡就绪事件给所有玩家
    this.broadcast(room.id, GameEvents.LEVEL_READY, levelReadyData);
  },

  /** 更新房间状态 */
  async updateRoomStatus(roomId: string, status: RoomStatus): Promise<Room | null> {
    const room = await this.getRoom(roomId);
    if (!room) return null;

    room.status = status;
    await redis.setex(`room:${roomId}`, ROOM_TTL, serializeRoom(room));
    return room;
  },

  /** 向房间内所有玩家广播事件 */
  broadcast(roomId: string, event: string, data: unknown): void {
    io.to(roomId).emit(event, data);
  },
};
