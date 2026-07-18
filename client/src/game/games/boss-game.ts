import { Application, Container, Graphics } from 'pixi.js';
import type { FederatedPointerEvent, Texture } from 'pixi.js';
import { Player } from '../entities/player.js';
import { Projectile } from '../entities/projectile.js';
import { Destructible } from '../entities/destructible.js';
import { ParticleEffect } from '../effects/particle.js';
import { ScreenShake } from '../effects/screen-shake.js';

/** Boss 数据结构 */
export interface BossData {
  sprite: Graphics;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  hpBar: Graphics;
  hpBarBg: Graphics;
}

/** 等级数据 */
export interface BossLevelData {
  bossSpawn?: { x: number; y: number };
  destructibles?: Array<{
    x: number;
    y: number;
    width: number;
    hp: number;
    reward: number;
  }>;
  difficulty?: number;
}

/** 回调接口 */
export interface BossGameCallbacks {
  onScoreChange?(playerId: string, score: number): void;
  onBossHpChange?(hp: number, maxHp: number): void;
  onBossDefeated?(): void;
  onGameOver?(winner: 'players' | 'boss'): void;
  onUltimateChargeChange?(charge: number): void;
  // 本地玩家射击时触发，用于多人对战操作同步上报（远程玩家射击直接调 shoot 不触发）
  onLocalShoot?(angle: number): void;
}

// 投射物数据：关联 ownerId 用于得分归属，'boss' 标识 Boss 发射的投射物（破坏物品不计分）
interface ProjectileData {
  projectile: Projectile;
  ownerId: string;
}

/**
 * Boss 组队战模式
 * - 多玩家协作击败 Boss
 * - 通过破坏物品积攒大招能量
 * - Boss 半血以下释放技能
 */
export class BossGame {
  private app: Application;
  private world: Container;
  private players: Map<string, Player> = new Map();
  private projectiles: ProjectileData[] = [];
  private destructibles: Destructible[] = [];
  private boss: BossData | null = null;
  private particles: ParticleEffect;
  private screenShake: ScreenShake;
  // 纹理缓存：shoot/bossSkill/addPlayer 高频调用 generateTexture 会反复创建 Graphics 对象引发 GC 抖动
  // 懒加载 + 复用同一纹理，避免每次创建新 Texture 实例
  private projectileTexture: Texture | null = null;
  private bossProjectileTexture: Texture | null = null;
  private playerTexture: Texture | null = null;
  private playerIndicatorTexture: Texture | null = null;
  private localPlayerId: string;
  private scores: Map<string, number> = new Map();
  private ultimateCharge: number = 0;
  private isRunning: boolean = false;
  private callbacks: BossGameCallbacks;
  private bounds: { width: number; height: number };
  private mouse = { x: 400, y: 300 };
  private boundMouseMove: (e: FederatedPointerEvent) => void;
  private boundPointerDown: (e: FederatedPointerEvent) => void;

  constructor(
    app: Application,
    localPlayerId: string,
    bounds: { width: number; height: number },
    _callbacks: BossGameCallbacks = {},
  ) {
    this.app = app;
    this.localPlayerId = localPlayerId;
    this.bounds = bounds;
    this.callbacks = _callbacks;

    this.world = new Container();
    this.app.stage.addChild(this.world);

    // 创建粒子纹理
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

  /** 懒加载 Boss 弹幕纹理（红色圆 8px），bossSkill 一次 8 方向复用同一纹理 */
  private getBossProjectileTexture(): Texture {
    if (!this.bossProjectileTexture) {
      const g = new Graphics();
      g.circle(0, 0, 8).fill({ color: 0xff3333 });
      this.bossProjectileTexture = this.app.renderer.generateTexture({ target: g, antialias: true });
      g.destroy();
    }
    return this.bossProjectileTexture;
  }

  /** 懒加载玩家本体纹理（绿色圆 22px），所有玩家共用 */
  private getPlayerTexture(): Texture {
    if (!this.playerTexture) {
      const g = new Graphics();
      g.circle(0, 0, 22).fill({ color: 0x3dd9b5 });
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

  // 非 async：内部仅同步初始化场景对象，无异步资源加载，保留 async 会造成"假异步"误导调用方
  init(levelData: BossLevelData): void {
    this.cleanup();

    // 创建 Boss
    if (levelData.bossSpawn) {
      const bossGraphic = new Graphics();
      bossGraphic.circle(0, 0, 50).fill({ color: 0xff3333 });
      bossGraphic.x = levelData.bossSpawn.x;
      bossGraphic.y = levelData.bossSpawn.y;

      // Boss 血条背景
      const hpBarBg = new Graphics();
      hpBarBg.rect(-40, -60, 80, 8).fill({ color: 0x333333 });
      bossGraphic.addChild(hpBarBg);

      // Boss 血条
      const hpBar = new Graphics();
      hpBar.rect(-40, -60, 80, 8).fill({ color: 0x00ff00 });
      bossGraphic.addChild(hpBar);

      this.world.addChild(bossGraphic);

      const difficulty = levelData.difficulty ?? 1;
      this.boss = {
        sprite: bossGraphic,
        hp: 500 + difficulty * 200,
        maxHp: 500 + difficulty * 200,
        x: levelData.bossSpawn.x,
        y: levelData.bossSpawn.y,
        hpBar,
        hpBarBg,
      };
    }

    // 创建可破坏物
    for (const d of levelData.destructibles ?? []) {
      // generateTexture 后及时销毁临时 Graphics，避免每个可破坏物泄漏一个 Graphics 对象
      const destGfx = new Graphics().rect(0, 0, d.width, d.width).fill({ color: 0xffffff });
      const destTex = this.app.renderer.generateTexture({ target: destGfx, antialias: true });
      destGfx.destroy();
      const dest = new Destructible(
        destTex,
        d.x,
        d.y,
        d.width,
        d.width,
        0xffffff,
        d.hp,
        d.reward,
        () => this.onDestructibleDestroyed(dest),
      );
      this.destructibles.push(dest);
      this.world.addChild(dest.container);
    }

    this.isRunning = true;
    this.setupInput();
  }

  addPlayer(playerId: string, x: number, y: number, _nickname: string): void {
    const player = new Player(this.getPlayerTexture(), this.getPlayerIndicatorTexture(), 22);
    player.setPosition(x, y);
    this.players.set(playerId, player);
    this.world.addChild(player.container);
    this.scores.set(playerId, 0);
  }

  removePlayer(playerId: string): void {
    const player = this.players.get(playerId);
    if (player) {
      this.world.removeChild(player.container);
      // 显式 destroy 释放 Player 内部 Sprite，避免运行时玩家进出累积残留对象
      player.destroy();
      this.players.delete(playerId);
    }
  }

  updatePlayerPosition(playerId: string, x: number, y: number): void {
    const player = this.players.get(playerId);
    if (player) {
      player.setPosition(x, y);
    }
  }

  shoot(playerId: string, angle: number): void {
    const player = this.players.get(playerId);
    if (!player) return;

    const projectile = new Projectile(
      this.getProjectileTexture(),
      player.x,
      player.y,
      Math.cos(angle),
      Math.sin(angle),
      600,
      this.bounds,
      6,
    );
    // 关联 playerId 用于破坏物得分归属
    this.projectiles.push({ projectile, ownerId: playerId });
    this.world.addChild(projectile.sprite);
  }

  shootToward(playerId: string, targetX: number, targetY: number): void {
    const player = this.players.get(playerId);
    if (!player) return;

    const dx = targetX - player.x;
    const dy = targetY - player.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) return;

    const angle = Math.atan2(dy, dx);
    this.shoot(playerId, angle);
    // 仅本地玩家射击时触发回调，远程玩家的射击通过 shoot 直接调用不经过此方法
    if (playerId === this.localPlayerId) {
      this.callbacks.onLocalShoot?.(angle);
    }
  }

  private onDestructibleDestroyed(dest: Destructible): void {
    this.world.removeChild(dest.container);
    this.destructibles = this.destructibles.filter((d) => d !== dest);
    // 销毁可破坏物的 Container 与 Sprite，避免破碎后资源残留导致内存泄漏
    dest.destroy();

    // 粒子效果
    this.particles.spawn(dest.x, dest.y, dest.colorValue, 'low');
    this.screenShake.shake('low');

    // H-09 修复：得分归属最后命中者，Boss 投射物破坏的物品 lastHitBy 为 null 不计玩家得分
    const scorer = dest.lastHitByValue;
    if (scorer) {
      const currentScore = this.scores.get(scorer) || 0;
      // H-10 修复：分数使用关卡配置的 rewardValue，而非硬编码 10
      const newScore = currentScore + dest.rewardValue;
      this.scores.set(scorer, newScore);
      this.callbacks.onScoreChange?.(scorer, newScore);
    }

    // 充能大招
    this.ultimateCharge = Math.min(100, this.ultimateCharge + 5);
    this.callbacks.onUltimateChargeChange?.(this.ultimateCharge);
  }

  useUltimate(_playerId: string): void {
    if (this.ultimateCharge < 100) return;
    if (!this.boss) return;

    this.ultimateCharge = 0;
    this.callbacks.onUltimateChargeChange?.(0);

    // 对 Boss 造成大量伤害
    this.boss.hp -= 200;

    // 全屏粒子
    this.particles.spawn(this.boss.x, this.boss.y, 0xff3d7f, 'high', 40);
    this.screenShake.shake('high');

    // 更新血条
    this.updateBossHpBar();

    // Boss 血量低于50%释放技能
    if (this.boss && this.boss.hp < this.boss.maxHp * 0.5) {
      this.bossSkill();
    }

    // 检查 Boss 是否被击败
    if (this.boss && this.boss.hp <= 0) {
      this.onBossDefeated();
    }
  }

  private updateBossHpBar(): void {
    if (!this.boss) return;
    const hpRatio = Math.max(0, this.boss.hp / this.boss.maxHp);
    this.boss.hpBar.scale.x = hpRatio;
    this.callbacks.onBossHpChange?.(this.boss.hp, this.boss.maxHp);
  }

  private bossSkill(): void {
    if (!this.boss) return;

    // Boss 释放技能：屏幕震动 + 8方向弹幕
    this.screenShake.shake('high');

    const bossProjTex = this.getBossProjectileTexture();
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const projectile = new Projectile(
        bossProjTex,
        this.boss.x,
        this.boss.y,
        Math.cos(angle),
        Math.sin(angle),
        300,
        this.bounds,
        8,
      );
      // Boss 投射物 ownerId='boss'，破坏物品时 lastHitBy 不计入玩家得分
      this.projectiles.push({ projectile, ownerId: 'boss' });
      this.world.addChild(projectile.sprite);
    }
  }

  private handleMouseMove(e: FederatedPointerEvent): void {
    this.mouse.x = e.globalX;
    this.mouse.y = e.globalY;
  }

  private handlePointerDown(e: FederatedPointerEvent): void {
    // 状态守卫：游戏结算后 isRunning=false，禁止再射击避免：
    // 1) 投射物加入 projectiles 但 update 不再执行导致残留；
    // 2) shootToward 触发 onLocalShoot 把已结束游戏中的"射击"上报后端，造成幽灵操作
    if (!this.isRunning) return;
    if (e.button === 0) {
      // 左键射击
      const player = this.players.get(this.localPlayerId);
      if (player) {
        this.shootToward(this.localPlayerId, this.mouse.x, this.mouse.y);
      }
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

    // 玩家朝向鼠标
    const player = this.players.get(this.localPlayerId);
    if (player) {
      player.faceTo(this.mouse.x, this.mouse.y);
    }

    // 更新所有投射物
    const alive: ProjectileData[] = [];
    for (const projData of this.projectiles) {
      const proj = projData.projectile;
      proj.update(delta);

      // 碰撞检测：玩家投射物 vs Boss（Boss 自身弹幕不误伤 Boss）
      if (projData.ownerId !== 'boss' && this.boss && proj.isAlive) {
        const dx = proj.x - this.boss.x;
        const dy = proj.y - this.boss.y;
        if (Math.sqrt(dx * dx + dy * dy) < 55) {
          this.boss.hp -= 10;
          proj.destroy();
          this.updateBossHpBar();

          if (this.boss.hp <= 0) {
            this.onBossDefeated();
          }
          continue;
        }
      }

      // 碰撞检测：投射物 vs 可破坏物
      // 玩家投射物传 ownerId 记录命中者；Boss 投射物不传（lastHitBy 保持 null，不计玩家得分）
      let hitDestructible = false;
      if (proj.isAlive) {
        for (const dest of this.destructibles) {
          if (!dest.isAlive) continue;
          if (this.circleRectHit(proj.x, proj.y, proj.radiusValue, dest.x, dest.y, dest.halfWidth, dest.halfHeight)) {
            dest.takeDamage(1, projData.ownerId !== 'boss' ? projData.ownerId : undefined);
            proj.destroy();
            hitDestructible = true;
            break;
          }
        }
      }
      // 已击中可破坏物并销毁投射物，跳过出界检测避免对已销毁 sprite 二次 destroy
      if (hitDestructible) continue;

      // 投射物出界（proj.isAlive 为 false 表示 update 内已标记越界，需 destroy 释放 sprite）
      if (!proj.isAlive || proj.x < -10 || proj.x > this.bounds.width + 10 || proj.y < -10 || proj.y > this.bounds.height + 10) {
        proj.destroy();
        continue;
      }

      alive.push(projData);
    }
    this.projectiles = alive;

    // 粒子特效更新
    this.particles.update(delta);
    this.screenShake.update(delta);
  }

  private circleRectHit(cx: number, cy: number, cr: number, rcx: number, rcy: number, halfW: number, halfH: number): boolean {
    const closestX = Math.max(rcx - halfW, Math.min(cx, rcx + halfW));
    const closestY = Math.max(rcy - halfH, Math.min(cy, rcy + halfH));
    const dx = cx - closestX;
    const dy = cy - closestY;
    return dx * dx + dy * dy < cr * cr;
  }

  private onBossDefeated(): void {
    if (!this.boss) return;
    this.particles.spawn(this.boss.x, this.boss.y, 0xff3d7f, 'high', 50);
    this.screenShake.shake('high');
    this.world.removeChild(this.boss.sprite);
    this.boss = null;
    // 停止游戏逻辑：防止结算后玩家仍可操作、投射物继续飞行计分
    this.isRunning = false;
    this.callbacks.onBossDefeated?.();
    this.callbacks.onGameOver?.('players');
  }

  getScore(): number {
    return this.scores.get(this.localPlayerId) || 0;
  }

  cleanup(): void {
    this.isRunning = false;
    this.teardownInput();

    // 显式 destroy 玩家容器释放 PixiJS 资源：仅 removeChild 会让 Player 对象（含 body/indicator Sprite）残留在内存，
    // 连续开局时 cleanup 在 init 中被调用，旧 Player 不经 destroy 会持续累积导致内存泄漏
    this.players.forEach((p) => {
      this.world.removeChild(p.container);
      p.destroy();
    });
    this.players.clear();

    this.projectiles.forEach((p) => p.projectile.destroy());
    this.projectiles = [];

    this.destructibles.forEach((d) => d.destroy());
    this.destructibles = [];

    if (this.boss) {
      this.world.removeChild(this.boss.sprite);
      // 显式销毁 boss Graphics 及其子节点（hpBarBg/hpBar），与 players 同理避免连续开局内存泄漏
      this.boss.sprite.destroy({ children: true });
      this.boss = null;
    }

    this.scores.clear();
    this.ultimateCharge = 0;

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
    this.bossProjectileTexture?.destroy(true);
    this.playerTexture?.destroy(true);
    this.playerIndicatorTexture?.destroy(true);
    this.projectileTexture = null;
    this.bossProjectileTexture = null;
    this.playerTexture = null;
    this.playerIndicatorTexture = null;
  }
}
