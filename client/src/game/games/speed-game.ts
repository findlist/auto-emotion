import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import { ParticleEffect } from '../effects/particle.js';
import { ScreenShake } from '../effects/screen-shake.js';

/** 小游戏类型 */
export type MiniGameType = 'bubble' | 'tape' | 'watermelon';

/** 可点击目标基类 */
interface ClickTarget {
  container: Container;
  x: number;
  y: number;
  hit: boolean;
  checkHit(px: number, py: number): boolean;
  onHit(): void;
  destroy(): void;
}

/** 泡泡 */
class Bubble implements ClickTarget {
  container: Container;
  x: number;
  y: number;
  hit = false;
  private sprite: Graphics;
  private radius: number;

  constructor(_app: Application, x: number, y: number, radius: number, color: number) {
    this.x = x;
    this.y = y;
    this.radius = radius;

    this.sprite = new Graphics();
    this.sprite.circle(0, 0, radius).fill({ color });
    this.sprite.circle(0, -radius * 0.3, radius * 0.2).fill({ color: 0xffffff, alpha: 0.6 });

    this.container = new Container();
    this.container.position.set(x, y);
    this.container.addChild(this.sprite);
    this.container.eventMode = 'static';
    this.container.cursor = 'pointer';
  }

  checkHit(px: number, py: number): boolean {
    if (this.hit) return false;
    const dx = px - this.x;
    const dy = py - this.y;
    return dx * dx + dy * dy < this.radius * this.radius;
  }

  onHit(): void {
    this.hit = true;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

/** 胶带 */
class Tape implements ClickTarget {
  container: Container;
  x: number;
  y: number;
  hit = false;
  private width: number;
  private height: number;
  private torn = false;
  private tearProgress = 0;
  private tearLine: Graphics;
  private onTorn: () => void;

  constructor(
    _app: Application,
    x: number,
    y: number,
    width: number,
    height: number,
    onTorn: () => void,
  ) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.onTorn = onTorn;

    const g = new Graphics();
    g.rect(0, 0, width, height).fill({ color: 0xf5deb3, alpha: 0.8 });
    g.rect(0, 0, width, 2).fill({ color: 0xdaa520 });
    g.rect(0, height - 2, width, 2).fill({ color: 0xdaa520 });

    this.tearLine = new Graphics();

    this.container = new Container();
    this.container.position.set(x, y);
    this.container.addChild(g);
    this.container.addChild(this.tearLine);
    this.container.eventMode = 'static';
    this.container.cursor = 'grab';
  }

  checkHit(px: number, py: number): boolean {
    if (this.hit || this.torn) return false;
    return (
      px >= this.x &&
      px <= this.x + this.width &&
      py >= this.y &&
      py <= this.y + this.height
    );
  }

  tear(px: number): void {
    if (this.torn) return;
    const relX = px - this.x;
    if (relX < 0 || relX > this.width) return;

    this.tearProgress = relX / this.width;
    this.tearLine.clear();
    this.tearLine.rect(relX - 2, 0, 4, this.height).fill({ color: 0x8b4513 });

    if (this.tearProgress >= 0.7) {
      this.torn = true;
      this.hit = true;
      this.container.cursor = 'default';
      this.onTorn();
    }
  }

  onHit(): void {
    // 胶带需要拖动，不是点击
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

/** 西瓜 */
class Watermelon implements ClickTarget {
  container: Container;
  x: number;
  y: number;
  hit = false;
  private radius: number;
  private shakeOffset = 0;
  private shaking = false;
  private onSmash: () => void;

  constructor(_app: Application, x: number, y: number, radius: number, onSmash: () => void) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.onSmash = onSmash;

    const g = new Graphics();
    // 西瓜主体
    g.circle(0, 0, radius).fill({ color: 0x228b22 });
    g.circle(0, 0, radius - 3).fill({ color: 0x90ee90 });
    // 西瓜纹路
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const px = Math.cos(angle) * (radius - 8);
      const py = Math.sin(angle) * (radius - 8);
      g.circle(px, py, 3).fill({ color: 0x006400 });
    }

    this.container = new Container();
    this.container.position.set(x, y);
    this.container.addChild(g);
    this.container.eventMode = 'static';
    this.container.cursor = 'pointer';

    this.startShake();
  }

  private startShake(): void {
    this.shaking = true;
  }

  update(_delta: number): void {
    if (this.shaking && !this.hit) {
      this.shakeOffset = Math.sin(Date.now() * 0.05) * 3;
      this.container.x = this.x + this.shakeOffset;
    }
  }

  checkHit(px: number, py: number): boolean {
    if (this.hit) return false;
    const dx = px - this.x;
    const dy = py - this.y;
    return dx * dx + dy * dy < this.radius * this.radius;
  }

  onHit(): void {
    this.hit = true;
    this.shaking = false;
    this.container.x = this.x;
    this.onSmash();
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

/** 回调接口 */
export interface SpeedGameCallbacks {
  onScoreChange?(score: number): void;
  onComboChange?(combo: number, multiplier: number): void;
  onTimeChange?(remainingSeconds: number): void;
  onMiniGameChange?(type: MiniGameType): void;
  onGameOver?(finalScore: number): void;
}

const GAME_DURATION = 90; // 秒
const BUBBLE_SCORE = 10;
const TAPE_SCORE = 20;
const WATERMELON_SCORE = 30;

/**
 * 手速竞速模式
 * - 90秒倒计时
 * - 3种小游戏循环：
 *   1. 捏泡泡：点击随机出现的圆形泡泡，+10分
 *   2. 撕胶带：拖动撕开胶带，+20分
 *   3. 砸西瓜：点击西瓜，西瓜爆炸，+30分
 * - 连击 × 倍率计分
 */
export class SpeedGame {
  private app: Application;
  private world: Container;
  private particles: ParticleEffect;
  private screenShake: ScreenShake;
  private isRunning = false;
  private callbacks: SpeedGameCallbacks;
  private bounds: { width: number; height: number };

  private score = 0;
  private combo = 0;
  private multiplier = 1;
  private timeRemaining = GAME_DURATION;
  private currentMiniGame: MiniGameType = 'bubble';
  private miniGameTimer = 0;
  private targets: ClickTarget[] = [];
  private spawnTimer = 0;

  private hud: Container;
  private scoreText: Text;
  private comboText: Text;
  private timeText: Text;
  private gameTypeText: Text;

  // 延迟移除目标的定时器集合：onTapeTorn/onWatermelonSmash 用 setTimeout 延迟移除容器，
  // 若用户在定时器触发前退出游戏，未清理的定时器会操作已销毁的 world 抛 PixiJS 错误。
  // 用 Set 收集 timer id，cleanup 时统一 clearTimeout 保障资源及时释放
  private pendingTimers: Set<ReturnType<typeof setTimeout>> = new Set();

  private boundPointerDown: (e: FederatedPointerEvent) => void;
  private boundPointerMove: (e: FederatedPointerEvent) => void;

  constructor(
    app: Application,
    bounds: { width: number; height: number },
    callbacks: SpeedGameCallbacks = {},
  ) {
    this.app = app;
    this.bounds = bounds;
    this.callbacks = callbacks;

    this.world = new Container();
    this.app.stage.addChild(this.world);

    const particleTexture = this.createParticleTexture();
    this.particles = new ParticleEffect(this.world, particleTexture);
    this.screenShake = new ScreenShake(this.world);

    // HUD
    this.hud = new Container();
    this.app.stage.addChild(this.hud);

    const textStyle = new TextStyle({
      fontFamily: 'monospace',
      fontSize: 24,
      fill: 0x1a1a1a,
      fontWeight: 'bold',
    });

    this.scoreText = new Text({ text: '分数: 0', style: textStyle });
    this.scoreText.position.set(10, 10);
    this.hud.addChild(this.scoreText);

    this.comboText = new Text({ text: '连击: 0 x1', style: textStyle });
    this.comboText.position.set(10, 40);
    this.hud.addChild(this.comboText);

    this.timeText = new Text({ text: '时间: 90', style: textStyle });
    this.timeText.position.set(this.bounds.width - 120, 10);
    this.hud.addChild(this.timeText);

    this.gameTypeText = new Text({ text: '捏泡泡', style: { ...textStyle, fontSize: 18 } });
    this.gameTypeText.position.set(this.bounds.width / 2 - 40, 10);
    this.hud.addChild(this.gameTypeText);

    this.boundPointerDown = this.handlePointerDown.bind(this);
    this.boundPointerMove = this.handlePointerMove.bind(this);
  }

  private createParticleTexture() {
    const g = new Graphics();
    g.circle(0, 0, 5).fill({ color: 0xffffff });
    const texture = this.app.renderer.generateTexture({ target: g, antialias: true });
    g.destroy();
    return texture;
  }

  async start() {
    this.cleanup();
    this.isRunning = true;
    this.score = 0;
    this.combo = 0;
    this.multiplier = 1;
    this.timeRemaining = GAME_DURATION;
    this.currentMiniGame = 'bubble';
    this.miniGameTimer = 0;
    this.spawnTimer = 0;

    this.updateHUD();
    this.switchMiniGame('bubble');
    this.setupInput();

    // 立即生成一个目标
    this.spawnTarget();
  }

  private switchMiniGame(type: MiniGameType) {
    this.currentMiniGame = type;
    this.miniGameTimer = 0;

    // 清除旧目标
    for (const t of this.targets) {
      t.destroy();
    }
    this.targets = [];

    const names: Record<MiniGameType, string> = {
      bubble: '捏泡泡',
      tape: '撕胶带',
      watermelon: '砸西瓜',
    };
    this.gameTypeText.text = names[type];
    this.callbacks.onMiniGameChange?.(type);
  }

  private spawnTarget() {
    switch (this.currentMiniGame) {
      case 'bubble':
        this.spawnBubble();
        break;
      case 'tape':
        this.spawnTape();
        break;
      case 'watermelon':
        this.spawnWatermelon();
        break;
    }
  }

  private spawnBubble() {
    const margin = 80;
    const x = margin + Math.random() * (this.bounds.width - margin * 2);
    const y = margin + Math.random() * (this.bounds.height - margin * 2);
    const radius = 20 + Math.random() * 25;
    const colors = [0xff69b4, 0x87ceeb, 0xdaa520, 0x98fb98, 0xdda0dd];
    const color = colors[Math.floor(Math.random() * colors.length)];

    const bubble = new Bubble(this.app, x, y, radius, color);
    bubble.onHit = () => this.onBubbleHit(bubble);
    this.targets.push(bubble);
    this.world.addChild(bubble.container);
  }

  private spawnTape() {
    const margin = 100;
    const x = margin + Math.random() * (this.bounds.width - margin * 2);
    const y = margin + Math.random() * (this.bounds.height - margin * 2);
    const width = 150 + Math.random() * 100;
    const height = 40;

    const tape = new Tape(this.app, x, y, width, height, () => this.onTapeTorn(tape));
    this.targets.push(tape);
    this.world.addChild(tape.container);
  }

  private spawnWatermelon() {
    const margin = 100;
    const x = margin + Math.random() * (this.bounds.width - margin * 2);
    const y = margin + Math.random() * (this.bounds.height - margin * 2);
    const radius = 40;

    const watermelon = new Watermelon(this.app, x, y, radius, () => this.onWatermelonSmash(watermelon));
    this.targets.push(watermelon);
    this.world.addChild(watermelon.container);
  }

  private onBubbleHit(bubble: Bubble) {
    bubble.hit = true;
    this.world.removeChild(bubble.container);
    this.targets = this.targets.filter((t) => t !== bubble);

    this.particles.spawn(bubble.x, bubble.y, 0xff69b4, 'mid');
    this.screenShake.shake('low');
    this.addScore(BUBBLE_SCORE);
  }

  private onTapeTorn(tape: Tape) {
    this.particles.spawn(tape.x + tape.container.width / 2, tape.y, 0xf5deb3, 'mid');
    this.screenShake.shake('mid');
    this.addScore(TAPE_SCORE);

    // 收集 timer id 供 cleanup 清理，避免组件销毁后定时器仍触发 world.removeChild 抛错
    const timer = setTimeout(() => {
      this.pendingTimers.delete(timer);
      this.world.removeChild(tape.container);
      this.targets = this.targets.filter((t) => t !== tape);
    }, 500);
    this.pendingTimers.add(timer);
  }

  private onWatermelonSmash(watermelon: Watermelon) {
    // 西瓜爆炸：复用 this.particles 分批 spawn 红/绿粒子
    // 原实现每次创建 8 个临时 ParticleEffect 实例，其粒子既不进入 update() 循环也不被 destroy()，
    // 每次砸西瓜累积 40 个永久 Sprite 造成内存泄漏；Particle 通过 tint 着色，单一纹理即可显示任意颜色
    this.particles.spawn(watermelon.x, watermelon.y, 0xff0000, 'high', 4);
    this.particles.spawn(watermelon.x, watermelon.y, 0x90ee90, 'high', 4);
    this.screenShake.shake('high');
    this.addScore(WATERMELON_SCORE);

    const timer = setTimeout(() => {
      this.pendingTimers.delete(timer);
      this.world.removeChild(watermelon.container);
      this.targets = this.targets.filter((t) => t !== watermelon);
    }, 300);
    this.pendingTimers.add(timer);
  }

  private addScore(base: number) {
    this.combo++;
    this.multiplier = Math.min(5, 1 + Math.floor(this.combo / 5));

    const points = base * this.multiplier;
    this.score += points;

    this.callbacks.onScoreChange?.(this.score);
    this.callbacks.onComboChange?.(this.combo, this.multiplier);
    this.updateHUD();
  }

  private missTarget() {
    this.combo = 0;
    this.multiplier = 1;
    this.callbacks.onComboChange?.(this.combo, this.multiplier);
    this.updateHUD();
  }

  private updateHUD() {
    this.scoreText.text = `分数: ${this.score}`;
    this.comboText.text = `连击: ${this.combo} x${this.multiplier}`;
    this.timeText.text = `时间: ${Math.ceil(this.timeRemaining)}`;
  }

  private handlePointerDown(e: FederatedPointerEvent): void {
    if (!this.isRunning) return;

    const { x, y } = e;

    // 检查是否命中目标
    for (const target of this.targets) {
      if (target.checkHit(x, y)) {
        target.onHit();
        return;
      }
    }

    // 未命中任何目标
    this.missTarget();
  }

  private handlePointerMove(e: FederatedPointerEvent): void {
    if (!this.isRunning) return;
    if (this.currentMiniGame !== 'tape') return;

    // 使用实际指针 y 坐标做命中检测：原代码传 y=0 导致 checkHit 恒返回 false
    // （Tape.y 最小为 100，py=0 永远不满足 py >= this.y），撕胶带小游戏完全失效
    const { x, y } = e;
    for (const target of this.targets) {
      if (target instanceof Tape && target.checkHit(x, y)) {
        target.tear(x);
        break;
      }
    }
  }

  private setupInput(): void {
    this.world.eventMode = 'static';
    this.world.hitArea = { contains: () => true };
    this.world.on('pointerdown', this.boundPointerDown);
    this.world.on('pointermove', this.boundPointerMove);
  }

  private teardownInput(): void {
    this.world.removeAllListeners();
  }

  update(delta: number): void {
    if (!this.isRunning) return;

    const deltaSeconds = delta / 1000;
    this.timeRemaining -= deltaSeconds;
    this.miniGameTimer += deltaSeconds;

    // 更新西瓜抖动
    for (const target of this.targets) {
      if (target instanceof Watermelon) {
        target.update(delta);
      }
    }

    // 检查时间
    if (this.timeRemaining <= 0) {
      this.timeRemaining = 0;
      this.isRunning = false;
      this.callbacks.onGameOver?.(this.score);
      this.updateHUD();
      return;
    }

    // 每15秒切换小游戏
    if (this.miniGameTimer >= 15) {
      const games: MiniGameType[] = ['bubble', 'tape', 'watermelon'];
      const currentIdx = games.indexOf(this.currentMiniGame);
      const nextIdx = (currentIdx + 1) % games.length;
      this.switchMiniGame(games[nextIdx]);
    }

    // 自动生成目标
    this.spawnTimer += delta;
    if (this.spawnTimer >= 1000 && this.targets.length < 3) {
      this.spawnTarget();
      this.spawnTimer = 0;
    }

    // 粒子 & 震动
    this.particles.update(delta);
    this.screenShake.update(delta);

    this.updateHUD();
  }

  cleanup(): void {
    this.isRunning = false;
    this.teardownInput();

    // 清理未触发的延迟移除定时器，防止销毁后操作 world 抛错
    this.pendingTimers.forEach(clearTimeout);
    this.pendingTimers.clear();

    for (const t of this.targets) {
      t.destroy();
    }
    this.targets = [];
  }

  destroy(): void {
    this.cleanup();
    this.world.destroy({ children: true });
    this.hud.destroy({ children: true });
    this.particles.destroy();
    this.screenShake.destroy();
  }
}
