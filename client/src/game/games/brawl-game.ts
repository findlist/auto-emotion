import { Application, Container, Graphics } from 'pixi.js';
import type { FederatedPointerEvent, Texture } from 'pixi.js';
import { Player } from '../entities/player.js';
import { Projectile } from '../entities/projectile.js';
import { Destructible } from '../entities/destructible.js';
import { ParticleEffect } from '../effects/particle.js';
import { ScreenShake } from '../effects/screen-shake.js';

/** 玩家数据（含速度向量用于击飞） */
interface PlayerData {
  player: Player;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  nickname: string;
}

/** 投射物数据（含发射者ID） */
interface ProjectileData {
  projectile: Projectile;
  ownerId: string;
}

/** 等级数据 */
export interface BrawlLevelData {
  playerSpawns?: Array<{ x: number; y: number }>;
  destructibles?: Array<{
    x: number;
    y: number;
    width: number;
    hp: number;
    reward: number;
    color: number;
  }>;
  bounds?: { width: number; height: number };
}

/** 回调接口 */
export interface BrawlGameCallbacks {
  onScoreChange?(playerId: string, score: number): void;
  onPlayerHit?(playerId: string, damage: number, attackerId: string): void;
  onPlayerDefeated?(playerId: string): void;
  onGameOver?(winnerId: string | null): void;
  // 本地玩家射击时触发，用于多人对战操作同步上报（远程玩家射击直接调 shoot 不触发）
  onLocalShoot?(angle: number): void;
}

/** 物理常量 */
const FRICTION = 0.92;
const KNOCKBACK_FORCE = 400;
const PROJECTILE_KNOCKBACK = 200;
const PLAYER_RADIUS = 22;
const RESPAWN_TIME = 3000;

/**
 * 自由乱斗模式
 * - 多玩家互相攻击
 * - 击飞物理效果（碰撞后速度反弹）
 * - 积分统计（攻击命中 + 破坏物品）
 */
export class BrawlGame {
  private app: Application;
  private world: Container;
  private players: Map<string, PlayerData> = new Map();
  private projectiles: ProjectileData[] = [];
  private destructibles: Destructible[] = [];
  private particles: ParticleEffect;
  private screenShake: ScreenShake;
  // 纹理缓存：shoot/addPlayer 高频调用 generateTexture 会反复创建 Graphics 对象引发 GC 抖动
  // 懒加载 + 复用同一纹理，避免每次创建新 Texture 实例（与 boss-game 同模式）
  private projectileTexture: Texture | null = null;
  private playerTexture: Texture | null = null;
  private playerIndicatorTexture: Texture | null = null;
  // 可破坏物纹理缓存：同色同尺寸的可破坏物复用同一纹理，避免 init 时逐个 generateTexture 产生 GPU 开销
  // key 为 `${color}-${width}`，Destructible.destroy 不销毁纹理故共享安全，destroy() 时统一释放
  private destructibleTextureCache: Map<string, Texture> = new Map();
  private localPlayerId: string;
  private scores: Map<string, number> = new Map();
  private isRunning: boolean = false;
  private callbacks: BrawlGameCallbacks;
  private bounds: { width: number; height: number };
  private mouse = { x: 400, y: 300 };
  private respawnTimers: Map<string, number> = new Map();
  private boundMouseMove: (e: FederatedPointerEvent) => void;
  private boundPointerDown: (e: FederatedPointerEvent) => void;

  constructor(
    app: Application,
    localPlayerId: string,
    bounds: { width: number; height: number },
    callbacks: BrawlGameCallbacks = {},
  ) {
    this.app = app;
    this.localPlayerId = localPlayerId;
    this.bounds = bounds;
    this.callbacks = callbacks;

    this.world = new Container();
    this.app.stage.addChild(this.world);

    const particleTexture = this.createParticleTexture();
    this.particles = new ParticleEffect(this.world, particleTexture);
    this.screenShake = new ScreenShake(this.world);

    this.boundMouseMove = this.handleMouseMove.bind(this);
    this.boundPointerDown = this.handlePointerDown.bind(this);
  }

  private createParticleTexture() {
    const g = new Graphics();
    g.circle(0, 0, 5).fill({ color: 0xffffff });
    const texture = this.app.renderer.generateTexture({ target: g, antialias: true });
    g.destroy();
    return texture;
  }

  /** 懒加载玩家投射物纹理（黄色圆 6px），shoot 高频调用复用避免反复生成 */
  private getProjectileTexture(): Texture {
    if (!this.projectileTexture) {
      const g = new Graphics();
      g.circle(0, 0, 6).fill({ color: 0xffd93d });
      this.projectileTexture = this.app.renderer.generateTexture({ target: g, antialias: true });
      g.destroy();
    }
    return this.projectileTexture;
  }

  /** 懒加载玩家本体纹理（绿色圆 PLAYER_RADIUS），所有玩家共用 */
  private getPlayerTexture(): Texture {
    if (!this.playerTexture) {
      const g = new Graphics();
      g.circle(0, 0, PLAYER_RADIUS).fill({ color: 0x3dd9b5 });
      this.playerTexture = this.app.renderer.generateTexture({ target: g, antialias: true });
      g.destroy();
    }
    return this.playerTexture;
  }

  /** 懒加载玩家朝向指示器纹理（黑色矩形 14x6），所有玩家共用 */
  private getPlayerIndicatorTexture(): Texture {
    if (!this.playerIndicatorTexture) {
      const g = new Graphics();
      g.rect(0, 0, 14, 6).fill({ color: 0x1a1a1a });
      this.playerIndicatorTexture = this.app.renderer.generateTexture({ target: g, antialias: true });
      g.destroy();
    }
    return this.playerIndicatorTexture;
  }

  // 非 async：内部仅同步初始化可破坏物与输入监听，无异步资源加载，保留 async 会造成"假异步"误导调用方
  init(levelData: BrawlLevelData): void {
    this.cleanup();

    // 创建可破坏物
    for (const d of levelData.destructibles ?? []) {
      // 纹理缓存：同色同尺寸的可破坏物复用纹理，避免逐个 generateTexture 产生 GPU 开销
      const cacheKey = `${d.color}-${d.width}`;
      let tex = this.destructibleTextureCache.get(cacheKey);
      if (!tex) {
        // generateTexture 后及时销毁临时 Graphics，避免每个可破坏物泄漏一个 Graphics 对象
        const destGfx = new Graphics().rect(0, 0, d.width, d.width).fill({ color: d.color });
        tex = this.app.renderer.generateTexture({ target: destGfx, antialias: true });
        destGfx.destroy();
        this.destructibleTextureCache.set(cacheKey, tex);
      }
      const dest = new Destructible(tex, d.x, d.y, d.width, d.width, d.color, d.hp, d.reward, () =>
        this.onDestructibleDestroyed(dest),
      );
      this.destructibles.push(dest);
      this.world.addChild(dest.container);
    }

    // 玩家不在 init 中创建：上方 cleanup() 已清空 this.scores，遍历 scores 永不执行（原为死代码）。
    // 玩家由 battle-scene.syncPlayers 在 init 完成后通过 addPlayer 逐个注入（M-11 清理死代码）

    this.isRunning = true;
    this.setupInput();
  }

  addPlayer(playerId: string, x: number, y: number, nickname: string): void {
    const player = new Player(this.getPlayerTexture(), this.getPlayerIndicatorTexture(), PLAYER_RADIUS);
    player.setPosition(x, y);

    const playerData: PlayerData = {
      player,
      vx: 0,
      vy: 0,
      hp: 100,
      maxHp: 100,
      alive: true,
      nickname,
    };

    this.players.set(playerId, playerData);
    this.world.addChild(player.container);
    this.scores.set(playerId, 0);
  }

  removePlayer(playerId: string): void {
    const data = this.players.get(playerId);
    if (data) {
      this.world.removeChild(data.player.container);
      // 显式 destroy 释放 Player 内部 Sprite，避免运行时玩家进出累积残留对象
      data.player.destroy();
      this.players.delete(playerId);
    }
  }

  updatePlayerPosition(playerId: string, x: number, y: number): void {
    const data = this.players.get(playerId);
    if (data) {
      data.player.setPosition(x, y);
    }
  }

  shoot(playerId: string, angle: number): void {
    const data = this.players.get(playerId);
    if (!data || !data.alive) return;

    const projectile = new Projectile(
      this.getProjectileTexture(),
      data.player.x,
      data.player.y,
      Math.cos(angle),
      Math.sin(angle),
      600,
      this.bounds,
      6,
    );
    this.projectiles.push({ projectile, ownerId: playerId });
    this.world.addChild(projectile.sprite);
  }

  shootToward(playerId: string, targetX: number, targetY: number): void {
    const data = this.players.get(playerId);
    if (!data) return;

    const dx = targetX - data.player.x;
    const dy = targetY - data.player.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) return;

    const angle = Math.atan2(dy, dx);
    this.shoot(playerId, angle);
    // 仅本地玩家射击时触发回调，远程玩家的射击通过 shoot 直接调用不经过此方法
    if (playerId === this.localPlayerId) {
      this.callbacks.onLocalShoot?.(angle);
    }
  }

  applyKnockback(playerId: string, fromX: number, fromY: number, force: number): void {
    const data = this.players.get(playerId);
    if (!data || !data.alive) return;

    const dx = data.player.x - fromX;
    const dy = data.player.y - fromY;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) return;

    data.vx += (dx / len) * force;
    data.vy += (dy / len) * force;
  }

  private onDestructibleDestroyed(dest: Destructible): void {
    this.world.removeChild(dest.container);
    this.destructibles = this.destructibles.filter((d) => d !== dest);
    // 销毁可破坏物的 Container 与 Sprite，避免破碎后资源残留导致内存泄漏
    dest.destroy();

    this.particles.spawn(dest.x, dest.y, dest.colorValue, 'mid');
    this.screenShake.shake('low');

    // H-09 修复：得分归属最后命中者（dest.lastHitByValue），而非固定归本地玩家
    // H-10 修复：分数使用关卡配置的 reward，而非 container.width 渲染值（Sprite 未渲染时 width 可能为 0）
    const scorer = dest.lastHitByValue ?? this.localPlayerId;
    const currentScore = this.scores.get(scorer) || 0;
    const newScore = currentScore + dest.rewardValue;
    this.scores.set(scorer, newScore);
    this.callbacks.onScoreChange?.(scorer, newScore);
  }

  private handleMouseMove(e: FederatedPointerEvent): void {
    this.mouse.x = e.globalX;
    this.mouse.y = e.globalY;
  }

  private handlePointerDown(e: FederatedPointerEvent): void {
    if (e.button === 0) {
      this.shootToward(this.localPlayerId, this.mouse.x, this.mouse.y);
    }
  }

  private setupInput(): void {
    this.world.eventMode = 'static';
    this.world.hitArea = { contains: () => true };
    this.world.on('pointermove', this.boundMouseMove);
    this.world.on('pointerdown', this.boundPointerDown);
  }

  private teardownInput(): void {
    this.world.removeAllListeners();
  }

  update(delta: number): void {
    if (!this.isRunning) return;

    // 玩家朝向鼠标 + 物理更新
    for (const [id, data] of this.players) {
      if (!data.alive) continue;

      // 朝向鼠标（仅本地玩家）
      if (id === this.localPlayerId) {
        data.player.faceTo(this.mouse.x, this.mouse.y);
      }

      // 应用速度
      data.player.container.x += data.vx * (delta / 1000);
      data.player.container.y += data.vy * (delta / 1000);

      // 摩擦力
      data.vx *= FRICTION;
      data.vy *= FRICTION;

      // 边界反弹
      const r = PLAYER_RADIUS;
      if (data.player.x < r) {
        data.player.container.x = r;
        data.vx = Math.abs(data.vx) * 0.5;
      }
      if (data.player.x > this.bounds.width - r) {
        data.player.container.x = this.bounds.width - r;
        data.vx = -Math.abs(data.vx) * 0.5;
      }
      if (data.player.y < r) {
        data.player.container.y = r;
        data.vy = Math.abs(data.vy) * 0.5;
      }
      if (data.player.y > this.bounds.height - r) {
        data.player.container.y = this.bounds.height - r;
        data.vy = -Math.abs(data.vy) * 0.5;
      }

      // 玩家间碰撞
      // 设计原因：otherId <= id 字典序守卫确保每对无序玩家组合仅处理一次。
      // 若不守卫，id=A 时处理 A↔B，id=B 时又处理 B↔A，checkPlayerCollision
      // 会对同一对施加二次分离与击飞，导致碰撞响应翻倍、玩家被弹飞过远。
      for (const [otherId, otherData] of this.players) {
        if (otherId <= id || !otherData.alive) continue;
        this.checkPlayerCollision(id, data, otherId, otherData);
      }
    }

    // 更新投射物
    const alive: ProjectileData[] = [];
    for (const projData of this.projectiles) {
      const proj = projData.projectile;
      proj.update(delta);

      if (!proj.isAlive) {
        proj.destroy();
        continue;
      }

      // 投射物 vs 玩家
      for (const [playerId, data] of this.players) {
        if (!data.alive) continue;
        if (playerId === projData.ownerId) continue; // 不打自己

        const dx = proj.x - data.player.x;
        const dy = proj.y - data.player.y;
        if (Math.sqrt(dx * dx + dy * dy) < PLAYER_RADIUS + proj.radiusValue) {
          // 命中
          data.hp -= 20;
          this.applyKnockback(playerId, proj.x, proj.y, PROJECTILE_KNOCKBACK);
          this.particles.spawn(proj.x, proj.y, 0xff3d7f, 'low');
          this.screenShake.shake('low');
          proj.destroy();
          this.callbacks.onPlayerHit?.(playerId, 20, projData.ownerId);

          if (data.hp <= 0) {
            this.onPlayerDefeated(playerId, projData.ownerId);
          }
          break;
        }
      }

      if (!proj.isAlive) continue;

      // 投射物 vs 可破坏物：传入 ownerId 记录命中者，用于破碎时得分归属
      for (const dest of this.destructibles) {
        if (!dest.isAlive) continue;
        if (this.circleRectHit(proj.x, proj.y, proj.radiusValue, dest.x, dest.y, dest.halfWidth, dest.halfHeight)) {
          dest.takeDamage(1, projData.ownerId);
          proj.destroy();
          break;
        }
      }

      // 出界
      if (proj.x < -10 || proj.x > this.bounds.width + 10 || proj.y < -10 || proj.y > this.bounds.height + 10) {
        proj.destroy();
        continue;
      }

      alive.push(projData);
    }
    this.projectiles = alive;

    // 粒子 & 震动
    this.particles.update(delta);
    this.screenShake.update(delta);

    // 处理复活计时
    for (const [playerId, timer] of this.respawnTimers) {
      const remaining = timer - delta;
      if (remaining <= 0) {
        this.respawnPlayer(playerId);
        this.respawnTimers.delete(playerId);
      } else {
        this.respawnTimers.set(playerId, remaining);
      }
    }
  }

  private checkPlayerCollision(_id1: string, d1: PlayerData, _id2: string, d2: PlayerData): void {
    const dx = d2.player.x - d1.player.x;
    const dy = d2.player.y - d1.player.y;
    const dist = Math.hypot(dx, dy);
    const minDist = PLAYER_RADIUS * 2;

    if (dist < minDist && dist > 0) {
      // 分离
      const overlap = (minDist - dist) / 2;
      const nx = dx / dist;
      const ny = dy / dist;

      d1.player.container.x -= nx * overlap;
      d1.player.container.y -= ny * overlap;
      d2.player.container.x += nx * overlap;
      d2.player.container.y += ny * overlap;

      // 速度交换 + 击飞
      const relVelX = d1.vx - d2.vx;
      const relVelY = d1.vy - d2.vy;
      const relVelDotN = relVelX * nx + relVelY * ny;

      if (relVelDotN > 0) {
        d1.vx -= relVelDotN * nx;
        d1.vy -= relVelDotN * ny;
        d2.vx += relVelDotN * nx;
        d2.vy += relVelDotN * ny;

        // 额外击飞
        d1.vx += nx * KNOCKBACK_FORCE * 0.3;
        d1.vy += ny * KNOCKBACK_FORCE * 0.3;
        d2.vx -= nx * KNOCKBACK_FORCE * 0.3;
        d2.vy -= ny * KNOCKBACK_FORCE * 0.3;
      }
    }
  }

  private onPlayerDefeated(playerId: string, killerId: string): void {
    const data = this.players.get(playerId);
    if (!data) return;

    data.alive = false;
    this.world.removeChild(data.player.container);
    this.callbacks.onPlayerDefeated?.(playerId);

    // 击杀者得分
    const killerScore = this.scores.get(killerId) || 0;
    this.scores.set(killerId, killerScore + 100);
    this.callbacks.onScoreChange?.(killerId, killerScore + 100);

    // 复活计时
    this.respawnTimers.set(playerId, RESPAWN_TIME);

    // 检查是否只剩一个玩家
    const alivePlayers = [...this.players.values()].filter((d) => d.alive);
    if (alivePlayers.length === 1) {
      const winner = [...this.players.entries()].find(([, d]) => d.alive);
      // 停止游戏逻辑：结算后禁止玩家继续操作、投射物继续飞行计分
      this.isRunning = false;
      this.callbacks.onGameOver?.(winner?.[0] ?? null);
    } else if (alivePlayers.length === 0) {
      this.isRunning = false;
      this.callbacks.onGameOver?.(null);
    }
  }

  private respawnPlayer(playerId: string): void {
    const data = this.players.get(playerId);
    if (!data) return;

    // 随机出生点
    const x = 100 + Math.random() * (this.bounds.width - 200);
    const y = 100 + Math.random() * (this.bounds.height - 200);
    data.player.setPosition(x, y);
    data.hp = data.maxHp;
    data.alive = true;
    data.vx = 0;
    data.vy = 0;
    this.world.addChild(data.player.container);
  }

  private circleRectHit(cx: number, cy: number, cr: number, rcx: number, rcy: number, halfW: number, halfH: number): boolean {
    const closestX = Math.max(rcx - halfW, Math.min(cx, rcx + halfW));
    const closestY = Math.max(rcy - halfH, Math.min(cy, rcy + halfH));
    const dx = cx - closestX;
    const dy = cy - closestY;
    return dx * dx + dy * dy < cr * cr;
  }

  getScore(): number {
    return this.scores.get(this.localPlayerId) || 0;
  }

  cleanup(): void {
    this.isRunning = false;
    this.teardownInput();

    // 显式 destroy 玩家容器释放 PixiJS 资源：仅 removeChild 会让 Player 对象残留在内存，
    // 连续开局时 cleanup 在 init 中被调用，旧 Player 不经 destroy 会持续累积导致内存泄漏
    this.players.forEach((d) => {
      this.world.removeChild(d.player.container);
      d.player.destroy();
    });
    this.players.clear();

    this.projectiles.forEach((p) => p.projectile.destroy());
    this.projectiles = [];

    this.destructibles.forEach((d) => d.destroy());
    this.destructibles = [];

    this.scores.clear();
    this.respawnTimers.clear();

    // 复位 screenShake：震动未完成时 world 位置停留在偏移值，下次开局画面会初始偏移
    this.screenShake.destroy();
  }

  destroy(): void {
    this.cleanup();
    this.world.destroy({ children: true });
    this.particles.destroy();
    this.screenShake.destroy();
    // 销毁缓存的纹理释放 GPU 资源，避免场景多次创建销毁后的纹理泄漏
    this.projectileTexture?.destroy(true);
    this.playerTexture?.destroy(true);
    this.playerIndicatorTexture?.destroy(true);
    this.projectileTexture = null;
    this.playerTexture = null;
    this.playerIndicatorTexture = null;
    // 销毁可破坏物纹理缓存释放 GPU 资源，cleanup 不清理缓存（跨 init 复用），仅 destroy 释放
    this.destructibleTextureCache.forEach((t) => t.destroy(true));
    this.destructibleTextureCache.clear();
  }
}
