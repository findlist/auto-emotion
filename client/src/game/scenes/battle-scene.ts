import { Container } from 'pixi.js';
import type { Socket } from 'socket.io-client';
import type { AssetLoader } from '@/game/core/asset-loader';
import type { Scene } from '@/game/core/scene-manager';
import type { GameEngine } from '@/game/core/engine';
import { BossGame, type BossLevelData } from '@/game/games/boss-game';
import { BrawlGame, type BrawlLevelData } from '@/game/games/brawl-game';
import { SpeedGame } from '@/game/games/speed-game';
import type { EffectTier } from '@/game/effects/particle';

/** 调色板 */
const PALETTE = [0xff3d7f, 0xffd93d, 0xff6b35, 0x3dd9b5];

/** 状态变更回调 */
export interface BattleSceneCallbacks {
  onScoreChange?(score: number): void;
  onTierChange?(tier: EffectTier): void;
  onCooldownChange?(remainingMs: number): void;
  onTimeChange?(seconds: number): void;
}

/** 远程玩家信息：用于初始化本地游戏实例中的所有房间玩家 */
export interface RemotePlayer {
  userId: string;
  nickname: string;
}

/** 游戏操作同步事件 payload：与后端 GameEvents.ACTION 广播格式对齐 */
interface GameActionPayload {
  userId: string;
  action: string;
  payload?: unknown;
  timestamp: number;
}

/** 游戏模式 */
type GameMode = 'boss' | 'brawl' | 'speed';

/**
 * 对战战斗场景（多人）
 * - 支持 Boss 组队战 / 自由乱斗 / 手速竞速
 * - 通过 socket.io 与后端通信
 */
export class BattleScene implements Scene {
  readonly container: Container;

  private world: Container;
  private engine: GameEngine;
  private bounds: { width: number; height: number };
  private socket: Socket | null;
  private roomId: string;
  private localUserId: string;
  private remotePlayers: RemotePlayer[];
  private callbacks: BattleSceneCallbacks;

  // 当前游戏实例
  private bossGame: BossGame | null = null;
  private brawlGame: BrawlGame | null = null;
  private speedGame: SpeedGame | null = null;
  private currentMode: GameMode | null = null;

  private score = 0;

  // 箭头函数绑定 this，便于 onEnter/onExit 注册与注销监听
  private boundOnGameAction = (data: GameActionPayload): void => {
    this.handleRemoteAction(data);
  };

  constructor(
    engine: GameEngine,
    _assets: AssetLoader,
    bounds: { width: number; height: number },
    socket: Socket | null = null,
    roomId: string = '',
    localUserId: string = '',
    remotePlayers: RemotePlayer[] = [],
    callbacks: BattleSceneCallbacks = {},
  ) {
    this.engine = engine;
    this.bounds = bounds;
    this.socket = socket;
    this.roomId = roomId;
    this.localUserId = localUserId;
    this.remotePlayers = remotePlayers;
    this.callbacks = callbacks;

    this.container = new Container();
    this.world = new Container();
    this.container.addChild(this.world);
  }

  /** 初始化游戏 */
  init(mode: GameMode, levelData?: unknown): void {
    this.currentMode = mode;
    this.cleanup();

    switch (mode) {
      case 'boss':
        this.initBossGame(levelData as BossLevelData | undefined);
        break;
      case 'brawl':
        this.initBrawlGame(levelData as BrawlLevelData | undefined);
        break;
      case 'speed':
        this.initSpeedGame();
        break;
    }
  }

  private initBossGame(levelData?: BossLevelData): void {
    // 单机演示模式（socket=null）允许继续初始化本地游戏，emitAction 内部已有 socket 守卫保证不上报
    // 多人模式 socket 非空时 localId 取业务 userId，单机模式兜底为 'local' 保证游戏实例正常创建
    const localId = this.localUserId || this.socket?.id || 'local';

    this.bossGame = new BossGame(
      this.engine.app,
      localId,
      this.bounds,
      {
        onScoreChange: (playerId, score) => {
          if (playerId === localId) {
            this.score = score;
            this.callbacks.onScoreChange?.(score);
          }
        },
        onBossHpChange: () => {},
        onBossDefeated: () => {},
        onGameOver: () => {},
        onUltimateChargeChange: () => {},
        onLocalShoot: (angle) => {
          // 本地玩家射击时上报到后端，由后端广播给房间内其他玩家
          this.emitAction('shoot', { angle });
        },
      },
    );

    const defaultLevel: BossLevelData = levelData ?? {
      bossSpawn: { x: 400, y: 150 },
      destructibles: [
        { x: 150, y: 300, width: 40, hp: 1, reward: 10 },
        { x: 250, y: 450, width: 40, hp: 1, reward: 10 },
        { x: 400, y: 500, width: 40, hp: 1, reward: 10 },
        { x: 550, y: 350, width: 40, hp: 1, reward: 10 },
        { x: 650, y: 480, width: 40, hp: 1, reward: 10 },
      ],
      difficulty: 1,
    };

    this.bossGame.init(defaultLevel);
    this.bossGame.addPlayer(localId, 400, 500, 'LocalPlayer');
    // 添加远程玩家到本地游戏实例，使远程操作可在本地重现
    this.addRemotePlayers('boss', localId);
  }

  private initBrawlGame(levelData?: BrawlLevelData): void {
    // 单机演示模式（socket=null）允许继续初始化本地游戏，emitAction 内部已有 socket 守卫保证不上报
    const localId = this.localUserId || this.socket?.id || 'local';

    this.brawlGame = new BrawlGame(
      this.engine.app,
      localId,
      this.bounds,
      {
        onScoreChange: (playerId, score) => {
          if (playerId === localId) {
            this.score = score;
            this.callbacks.onScoreChange?.(score);
          }
        },
        onPlayerHit: () => {},
        onPlayerDefeated: () => {},
        onGameOver: () => {},
        onLocalShoot: (angle) => {
          // 本地玩家射击时上报到后端，由后端广播给房间内其他玩家
          this.emitAction('shoot', { angle });
        },
      },
    );

    const defaultLevel: BrawlLevelData = levelData ?? {
      playerSpawns: [
        { x: 100, y: 100 },
        { x: 700, y: 500 },
        { x: 100, y: 500 },
        { x: 700, y: 100 },
      ],
      destructibles: [
        { x: 200, y: 200, width: 40, hp: 2, reward: 20, color: PALETTE[0] },
        { x: 400, y: 300, width: 40, hp: 2, reward: 20, color: PALETTE[1] },
        { x: 600, y: 200, width: 40, hp: 2, reward: 20, color: PALETTE[2] },
        { x: 300, y: 400, width: 40, hp: 2, reward: 20, color: PALETTE[3] },
        { x: 500, y: 450, width: 40, hp: 2, reward: 20, color: PALETTE[0] },
      ],
    };

    this.brawlGame.init(defaultLevel);
    this.brawlGame.addPlayer(localId, 400, 300, 'LocalPlayer');
    // 添加远程玩家到本地游戏实例，使远程操作可在本地重现
    this.addRemotePlayers('brawl', localId);
  }

  private initSpeedGame(): void {
    // 单机演示模式（socket=null）允许继续初始化本地游戏，speed 模式无远程同步需求

    this.speedGame = new SpeedGame(
      this.engine.app,
      this.bounds,
      {
        onScoreChange: (score) => {
          this.score = score;
          this.callbacks.onScoreChange?.(score);
        },
        onComboChange: () => {},
        onTimeChange: (s) => this.callbacks.onTimeChange?.(s),
        onMiniGameChange: () => {},
        // MVP 改由 battle.tsx 按 finalScores 前端计算，后端无 mvp-report 监听，
        // 此处保留空回调以满足 SpeedGame 接口约束，避免误加无效事件上报
        onGameOver: () => {},
      },
    );

    this.speedGame.start();
  }

  onEnter(): void {
    // 注册 game:action 监听，接收远程玩家操作并在本地重现
    this.socket?.on('game:action', this.boundOnGameAction);
  }

  onExit(): void {
    // 注销监听避免内存泄漏与重复触发
    this.socket?.off('game:action', this.boundOnGameAction);
  }

  /** 上报本地操作到后端，由后端广播给房间内所有玩家 */
  private emitAction(action: string, payload?: unknown): void {
    if (!this.socket || !this.roomId) return;
    this.socket.emit('game:action', { roomId: this.roomId, action, payload });
  }

  /** 处理远程玩家操作：过滤自己发出的广播，按 action 类型分发到对应游戏实例 */
  private handleRemoteAction(data: GameActionPayload): void {
    // 后端 JWT 中 userId 可能是 number，room.players 中为 string，统一转 string 比较
    const userId = String(data.userId);
    // 后端广播会发给房间所有人包括发送者，过滤自身避免本地操作重复执行
    if (userId === this.localUserId) return;

    switch (data.action) {
      case 'shoot': {
        const angle = (data.payload as { angle?: number })?.angle;
        if (typeof angle === 'number') {
          this.handleRemoteShoot(userId, angle);
        }
        break;
      }
      // 后续可扩展 move/skill 等 action 类型
    }
  }

  /** 远程玩家射击：在对应模式的游戏实例中重现投射物 */
  private handleRemoteShoot(userId: string, angle: number): void {
    switch (this.currentMode) {
      case 'boss':
        this.bossGame?.shoot(userId, angle);
        break;
      case 'brawl':
        this.brawlGame?.shoot(userId, angle);
        break;
      // speed 模式为单人玩法，无需同步
    }
  }

  /** 远程玩家出生点：避开本地玩家位置，分布在画布四角 */
  private static readonly REMOTE_SPAWNS = [
    { x: 200, y: 400 },
    { x: 600, y: 400 },
    { x: 300, y: 200 },
    { x: 500, y: 200 },
  ];

  /** 添加远程玩家到本地游戏实例，使远程操作可在本地渲染 */
  private addRemotePlayers(mode: GameMode, localId: string): void {
    let spawnIdx = 0;
    for (const p of this.remotePlayers) {
      // 跳过本地玩家避免重复添加
      if (p.userId === localId) continue;
      const spawn = BattleScene.REMOTE_SPAWNS[spawnIdx % BattleScene.REMOTE_SPAWNS.length];
      this.addRemotePlayerAt(mode, p, spawn.x, spawn.y);
      spawnIdx++;
    }
  }

  /** 按当前游戏模式添加单个远程玩家到对应游戏实例 */
  private addRemotePlayerAt(mode: GameMode, player: RemotePlayer, x: number, y: number): void {
    if (mode === 'boss') {
      this.bossGame?.addPlayer(player.userId, x, y, player.nickname);
    } else if (mode === 'brawl') {
      this.brawlGame?.addPlayer(player.userId, x, y, player.nickname);
    }
    // speed 模式为单人玩法，无需添加远程玩家
  }

  /** 按当前游戏模式从对应游戏实例移除单个远程玩家 */
  private removeRemotePlayerAt(userId: string): void {
    switch (this.currentMode) {
      case 'boss':
        this.bossGame?.removePlayer(userId);
        break;
      case 'brawl':
        this.brawlGame?.removePlayer(userId);
        break;
      // speed 模式无远程玩家，无需处理
    }
  }

  /**
   * 同步远程玩家列表：对比新旧列表，新增玩家添加到游戏实例，离开玩家从游戏实例移除
   * 设计原因：对局运行中远程玩家可能主动离开房间（后端 leaveRoom 广播 room:state），
   * 若不从游戏实例移除，其角色会留在画面上成幽灵玩家
   */
  syncPlayers(players: RemotePlayer[]): void {
    const newIds = new Set(players.map((p) => p.userId));
    const oldIds = new Set(this.remotePlayers.map((p) => p.userId));

    // 移除已离开的远程玩家（本地玩家由 init 时 addPlayer 添加，不在此处理）
    for (const old of this.remotePlayers) {
      if (old.userId === this.localUserId) continue;
      if (!newIds.has(old.userId)) {
        this.removeRemotePlayerAt(old.userId);
      }
    }

    // 新增远程玩家：出生点索引基于现有远程玩家数量，避免与已有玩家位置重叠
    // currentMode 为 null 表示游戏尚未 init，此时无法确定目标游戏实例，
    // 原代码用 'brawl' 兜底会把玩家错加到 brawlGame（若已创建）。改为跳过添加，
    // 仅更新 remotePlayers 列表，由 init 完成后 addRemotePlayers 统一注入正确实例。
    if (this.currentMode) {
      const existingRemoteCount = this.remotePlayers.filter(
        (p) => p.userId !== this.localUserId,
      ).length;
      let spawnIdx = existingRemoteCount;
      for (const p of players) {
        if (p.userId === this.localUserId) continue;
        if (oldIds.has(p.userId)) continue;
        const spawn = BattleScene.REMOTE_SPAWNS[spawnIdx % BattleScene.REMOTE_SPAWNS.length];
        this.addRemotePlayerAt(this.currentMode, p, spawn.x, spawn.y);
        spawnIdx++;
      }
    }

    this.remotePlayers = players;
  }

  update(deltaMS: number): void {
    switch (this.currentMode) {
      case 'boss':
        this.bossGame?.update(deltaMS);
        break;
      case 'brawl':
        this.brawlGame?.update(deltaMS);
        break;
      case 'speed':
        this.speedGame?.update(deltaMS);
        break;
    }
  }

  /** 切换特效档位 */
  setTier(tier: EffectTier): void {
    // _tier 已移除，直接回调通知
    this.callbacks.onTierChange?.(tier);
  }

  getScore(): number {
    return this.score;
  }

  private cleanup(): void {
    this.bossGame?.destroy();
    this.bossGame = null;
    this.brawlGame?.destroy();
    this.brawlGame = null;
    this.speedGame?.destroy();
    this.speedGame = null;
  }

  destroy(): void {
    this.cleanup();
    this.container.destroy({ children: true });
  }
}
