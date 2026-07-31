import { makeSprite, type SpriteKind, type SpriteSet } from "./sprites";
import type { InvaderSpec, WaveConfig } from "./waves";

export const LOGICAL_W = 448;
export const LOGICAL_H = 512;

const PLAYER_Y = 456;
const BASELINE_Y = 496;
const BUNKER_Y = 398;
const INVASION_Y = 440;
const CELL_W = 34;
const CELL_H = 27;
const DESCEND = 12;
const STEP_DX = 8;
const EDGE_MARGIN = 10;

export interface WaveResult {
  scoreDelta: number;
  shots: number;
  hits: number;
  livesLeft: number;
  deaths: number;
  ufosKilled: number;
  cleared: boolean;
  bonus: { clear: number; accuracy: number } | null;
}

export type GameEvent =
  | { type: "shoot" }
  | { type: "invaderKilled"; spec: InvaderSpec; points: number }
  | { type: "eliteHit" }
  | { type: "eliteKilled"; spec: InvaderSpec; points: number }
  | { type: "ufoStart" }
  | { type: "ufoGone" }
  | { type: "ufoKilled"; points: number }
  | { type: "playerHit"; livesLeft: number }
  | { type: "march"; step: number }
  | { type: "score"; total: number }
  | { type: "waveClear"; result: WaveResult }
  | { type: "gameOver"; result: WaveResult };

export interface EngineConfig {
  wave: WaveConfig;
  lives: number;
  multiplier: number;
}

interface FieldInvader {
  spec: InvaderSpec;
  row: number;
  col: number;
  alive: boolean;
  hp: number;
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Bomb {
  x: number;
  y: number;
  vy: number;
  phase: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface Popup {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

interface Bunker {
  x: number;
  y: number;
  cells: boolean[][];
}

const BUNKER_SHAPE = [
  "..#######..",
  ".#########.",
  "###########",
  "###########",
  "###########",
  "###.....###",
  "##.......##",
  "##.......##",
];
const BUNKER_CELL = 4;

type Phase = "ready" | "playing" | "playerDying" | "cleared" | "over" | "done";

export class GameEngine {
  private ctx: CanvasRenderingContext2D;
  private sprites: Partial<Record<SpriteKind, SpriteSet>> = {};
  private rafId = 0;
  private timerId = 0;
  private destroyed = false;
  private lastTime = 0;
  private phase: Phase = "ready";
  private paused = false;

  private invaders: FieldInvader[] = [];
  private originX = 0;
  private originY = 84;
  private dir = 1;
  private stepTimer = 0;
  private marchStep = 0;

  private playerX = LOGICAL_W / 2;
  private lives: number;
  private invincible = 0;
  private dyingTimer = 0;
  private endTimer = 0;

  private bullets: Bullet[] = [];
  private bombs: Bomb[] = [];
  private fireCooldown = 0;
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private bunkers: Bunker[] = [];

  private elite: { spec: InvaderSpec; hp: number; t: number; alive: boolean } | null;
  private eliteFlash = 0;

  private ufo: { x: number; dir: number; points: number } | null = null;
  private ufoTimer: number;

  private score = 0;
  private shots = 0;
  private hits = 0;
  private deaths = 0;
  private ufosKilled = 0;

  private keys = new Set<string>();
  private shake = 0;
  private pointerTarget: number | null = null;
  private pointerHeld = false;

  constructor(
    canvas: HTMLCanvasElement,
    private config: EngineConfig,
    private onEvent: (event: GameEvent) => void,
  ) {
    canvas.width = LOGICAL_W;
    canvas.height = LOGICAL_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;

    for (const kind of ["squid", "crab", "octopus", "bug", "ufo", "player"] as const) {
      this.sprites[kind] = makeSprite(kind);
    }

    this.lives = config.lives;
    const { invaders, cols } = config.wave;
    invaders.forEach((spec, i) => {
      this.invaders.push({
        spec,
        row: Math.floor(i / cols),
        col: i % cols,
        alive: true,
        hp: spec.hp,
      });
    });
    this.originX = Math.max(EDGE_MARGIN, (LOGICAL_W - cols * CELL_W) / 2);
    this.elite = config.wave.elite
      ? { spec: config.wave.elite, hp: config.wave.elite.hp, t: 0, alive: true }
      : null;
    this.ufoTimer = 11 + Math.random() * 9;
    this.stepTimer = this.stepInterval();

    this.bunkers = [0, 1, 2, 3].map((i) => ({
      x: (LOGICAL_W * (i + 0.5)) / 4 - (BUNKER_SHAPE[0].length * BUNKER_CELL) / 2,
      y: BUNKER_Y,
      cells: BUNKER_SHAPE.map((row) => [...row].map((c) => c === "#")),
    }));

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.lastTime = performance.now();
    this.scheduleFrame();
  }

  /**
   * rAF normally, but fall back to a timer when the document is hidden —
   * browsers stop firing rAF entirely for hidden tabs, which would freeze
   * the wave mid-flight.
   */
  private scheduleFrame() {
    if (this.destroyed) return;
    if (document.hidden) {
      this.timerId = window.setTimeout(() => this.loop(performance.now()), 16);
    } else {
      this.rafId = requestAnimationFrame(this.loop);
    }
  }

  /** Switch from the READY freeze-frame into live play. */
  launch() {
    if (this.phase === "ready") this.phase = "playing";
  }

  setPaused(paused: boolean) {
    this.paused = paused;
  }

  /** Virtual button input (touch controls / on-screen arcade buttons). */
  setControl(control: "left" | "right" | "fire", active: boolean) {
    const key = control === "left" ? "arrowleft" : control === "right" ? "arrowright" : " ";
    if (active) this.keys.add(key);
    else this.keys.delete(key);
  }

  /** Pointer steering: glide the cannon toward x (logical coords) and auto-fire while held. */
  setPointer(x: number | null) {
    this.pointerTarget = x;
    this.pointerHeld = x !== null;
  }

  /** Current tallies, for bailing out of a wave early (ESC skip). */
  snapshot(): WaveResult {
    return {
      scoreDelta: this.score,
      shots: this.shots,
      hits: this.hits,
      livesLeft: this.lives,
      deaths: this.deaths,
      ufosKilled: this.ufosKilled,
      cleared: false,
      bonus: null,
    };
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.rafId);
    window.clearTimeout(this.timerId);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (["ArrowLeft", "ArrowRight", " ", "a", "d", "A", "D"].includes(e.key)) {
      e.preventDefault();
      this.keys.add(e.key.toLowerCase());
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };

  // ------------------------------------------------------------------
  // Simulation
  // ------------------------------------------------------------------

  private aliveCount() {
    return this.invaders.filter((i) => i.alive).length;
  }

  private stepInterval() {
    const total = this.invaders.length;
    const fraction = total > 0 ? this.aliveCount() / total : 0;
    const base = Math.max(0.3, 0.52 - this.config.wave.waveIndex * 0.015);
    // Small formations patrol a wide arena, so speed them up to keep the
    // pressure on.
    const sizeFactor = Math.min(Math.max(total / 16, 0.55), 1);
    return (0.055 + (base - 0.055) * Math.pow(fraction, 1.15)) * sizeFactor;
  }

  private invaderRect(inv: FieldInvader) {
    const sprite = this.sprites[inv.spec.kind]!;
    const x = this.originX + inv.col * CELL_W + (CELL_W - sprite.w) / 2;
    const y = this.originY + inv.row * CELL_H;
    return { x, y, w: sprite.w, h: sprite.h };
  }

  private loop = (now: number) => {
    this.scheduleFrame();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    if (!this.paused) this.update(dt);
    this.draw();
  };

  private update(dt: number) {
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.invincible = Math.max(0, this.invincible - dt);
    this.eliteFlash = Math.max(0, this.eliteFlash - dt);
    this.shake = Math.max(0, this.shake - dt * 3);
    this.updateEffects(dt);

    if (this.phase === "playerDying") {
      this.dyingTimer -= dt;
      if (this.dyingTimer <= 0) {
        if (this.lives <= 0) {
          this.finish(false);
        } else {
          this.phase = "playing";
          this.playerX = LOGICAL_W / 2;
          this.invincible = 1.8;
          this.bombs = [];
        }
      }
      return;
    }

    if (this.phase === "cleared" || this.phase === "over") {
      this.endTimer -= dt;
      if (this.endTimer <= 0 && this.phase === "cleared") this.emitClear();
      if (this.endTimer <= 0 && this.phase === "over") this.emitOver();
      return;
    }

    if (this.phase !== "playing") return;

    // Player movement + firing
    const speed = 175;
    if (this.keys.has("arrowleft") || this.keys.has("a")) this.playerX -= speed * dt;
    if (this.keys.has("arrowright") || this.keys.has("d")) this.playerX += speed * dt;
    if (this.pointerTarget !== null) {
      const delta = this.pointerTarget - this.playerX;
      const step = Math.min(Math.abs(delta), speed * 1.4 * dt);
      this.playerX += Math.sign(delta) * step;
    }
    this.playerX = Math.min(Math.max(this.playerX, 18), LOGICAL_W - 18);
    if (this.keys.has(" ") || this.pointerHeld) this.tryFire();

    this.updateFormation(dt);
    this.updateElite(dt);
    this.updateUfo(dt);
    this.updateBullets(dt);
    this.updateBombs(dt);
    this.maybeDropBombs(dt);
    this.checkEndConditions();
  }

  private updateFormation(dt: number) {
    this.stepTimer -= dt;
    if (this.stepTimer > 0) return;
    this.stepTimer = this.stepInterval();

    const alive = this.invaders.filter((i) => i.alive);
    if (alive.length === 0) return;
    const rects = alive.map((i) => this.invaderRect(i));
    const minX = Math.min(...rects.map((r) => r.x));
    const maxX = Math.max(...rects.map((r) => r.x + r.w));

    const nextMin = minX + this.dir * STEP_DX;
    const nextMax = maxX + this.dir * STEP_DX;
    if (nextMin < EDGE_MARGIN || nextMax > LOGICAL_W - EDGE_MARGIN) {
      this.dir *= -1;
      this.originY += DESCEND;
    } else {
      this.originX += this.dir * STEP_DX;
    }
    this.marchStep = (this.marchStep + 1) % 4;
    this.onEvent({ type: "march", step: this.marchStep });
  }

  private updateElite(dt: number) {
    if (!this.elite?.alive) return;
    this.elite.t += dt;
  }

  private eliteRect() {
    const sprite = this.sprites.bug!;
    const t = this.elite?.t ?? 0;
    const x = LOGICAL_W / 2 + Math.sin(t * 0.9) * (LOGICAL_W / 2 - 60) - sprite.w / 2;
    const y = 34 + Math.sin(t * 2.3) * 8;
    return { x, y, w: sprite.w, h: sprite.h };
  }

  private updateUfo(dt: number) {
    if (this.ufo) {
      this.ufo.x += this.ufo.dir * 68 * dt;
      if (this.ufo.x < -40 || this.ufo.x > LOGICAL_W + 40) {
        this.ufo = null;
        this.onEvent({ type: "ufoGone" });
        this.ufoTimer = 14 + Math.random() * 10;
      }
      return;
    }
    this.ufoTimer -= dt;
    if (this.ufoTimer <= 0 && this.originY < 240) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      this.ufo = {
        x: dir === 1 ? -36 : LOGICAL_W + 36,
        dir,
        points: [50, 100, 150, 300][Math.floor(Math.random() * 4)],
      };
      this.onEvent({ type: "ufoStart" });
    }
  }

  private tryFire() {
    const spread = this.config.wave.flagged;
    const maxInFlight = spread ? 6 : 2;
    if (this.fireCooldown > 0 || this.bullets.length >= maxInFlight) return;
    this.fireCooldown = spread ? 0.32 : 0.22;
    this.shots += spread ? 3 : 1;
    const y = PLAYER_Y - 6;
    if (spread) {
      this.bullets.push(
        { x: this.playerX, y, vx: 0, vy: -420 },
        { x: this.playerX, y, vx: -70, vy: -410 },
        { x: this.playerX, y, vx: 70, vy: -410 },
      );
    } else {
      this.bullets.push({ x: this.playerX, y, vx: 0, vy: -420 });
    }
    this.onEvent({ type: "shoot" });
  }

  private updateBullets(dt: number) {
    for (const bullet of this.bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
    }
    this.bullets = this.bullets.filter((bullet) => {
      if (bullet.y < 8 || bullet.x < 0 || bullet.x > LOGICAL_W) return false;

      for (const inv of this.invaders) {
        if (!inv.alive) continue;
        const r = this.invaderRect(inv);
        if (this.pointInRect(bullet.x, bullet.y, r, 4)) {
          inv.hp--;
          this.hits++;
          if (inv.hp <= 0) {
            inv.alive = false;
            const points = Math.round(inv.spec.points * this.config.multiplier);
            this.score += points;
            this.explode(r.x + r.w / 2, r.y + r.h / 2, this.spriteColor(inv.spec.kind), points);
            this.onEvent({ type: "invaderKilled", spec: inv.spec, points });
            this.onEvent({ type: "score", total: this.score });
          }
          return false;
        }
      }

      if (this.elite?.alive) {
        const r = this.eliteRect();
        if (this.pointInRect(bullet.x, bullet.y, r, 2)) {
          this.hits++;
          this.elite.hp--;
          this.eliteFlash = 0.15;
          if (this.elite.hp <= 0) {
            this.elite.alive = false;
            const points = Math.round(this.elite.spec.points * this.config.multiplier);
            this.score += points;
            this.explode(r.x + r.w / 2, r.y + r.h / 2, "#ffb000", points, 26);
            this.onEvent({ type: "eliteKilled", spec: this.elite.spec, points });
            this.onEvent({ type: "score", total: this.score });
          } else {
            this.onEvent({ type: "eliteHit" });
          }
          return false;
        }
      }

      if (this.ufo) {
        const sprite = this.sprites.ufo!;
        const r = { x: this.ufo.x, y: 14, w: sprite.w, h: sprite.h };
        if (this.pointInRect(bullet.x, bullet.y, r, 2)) {
          this.hits++;
          this.ufosKilled++;
          const points = Math.round(this.ufo.points * this.config.multiplier);
          this.score += points;
          this.explode(r.x + r.w / 2, r.y + r.h / 2, "#ff55ff", points, 20);
          this.ufo = null;
          this.ufoTimer = 16 + Math.random() * 10;
          this.onEvent({ type: "ufoKilled", points });
          this.onEvent({ type: "score", total: this.score });
          return false;
        }
      }

      if (this.hitBunker(bullet.x, bullet.y)) return false;
      return true;
    });
  }

  private maybeDropBombs(dt: number) {
    const rate = Math.min(0.55 + this.config.wave.waveIndex * 0.12, 2.2);
    if (Math.random() < rate * dt) {
      const bottoms = new Map<number, FieldInvader>();
      for (const inv of this.invaders) {
        if (!inv.alive) continue;
        const existing = bottoms.get(inv.col);
        if (!existing || inv.row > existing.row) bottoms.set(inv.col, inv);
      }
      const shooters = [...bottoms.values()];
      if (shooters.length > 0) {
        const shooter = shooters[Math.floor(Math.random() * shooters.length)];
        const r = this.invaderRect(shooter);
        this.bombs.push({
          x: r.x + r.w / 2,
          y: r.y + r.h,
          vy: 120 + this.config.wave.waveIndex * 7,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }
    // The elite bug drops aimed bombs.
    if (this.elite?.alive && Math.random() < 0.35 * dt * 2) {
      const r = this.eliteRect();
      this.bombs.push({ x: r.x + r.w / 2, y: r.y + r.h, vy: 165, phase: 0 });
    }
  }

  private updateBombs(dt: number) {
    for (const bomb of this.bombs) {
      bomb.y += bomb.vy * dt;
      bomb.phase += dt * 14;
    }
    this.bombs = this.bombs.filter((bomb) => {
      if (bomb.y > BASELINE_Y) return false;
      if (this.hitBunker(bomb.x, bomb.y)) return false;
      if (
        this.phase === "playing" &&
        this.invincible <= 0 &&
        bomb.y >= PLAYER_Y &&
        bomb.y <= PLAYER_Y + 16 &&
        Math.abs(bomb.x - this.playerX) < 13
      ) {
        this.killPlayer();
        return false;
      }
      return true;
    });
  }

  private killPlayer() {
    this.lives--;
    this.deaths++;
    this.phase = "playerDying";
    this.dyingTimer = 1.3;
    this.shake = 1;
    this.explode(this.playerX, PLAYER_Y + 8, "#33ddff", null, 30);
    this.onEvent({ type: "playerHit", livesLeft: this.lives });
  }

  private hitBunker(x: number, y: number): boolean {
    for (const bunker of this.bunkers) {
      const col = Math.floor((x - bunker.x) / BUNKER_CELL);
      const row = Math.floor((y - bunker.y) / BUNKER_CELL);
      if (row < 0 || row >= bunker.cells.length) continue;
      if (col < 0 || col >= bunker.cells[0].length) continue;
      if (!bunker.cells[row][col]) continue;
      // Erode the impact cell plus a random splash of neighbours.
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = row + dr;
          const cc = col + dc;
          if (rr < 0 || rr >= bunker.cells.length) continue;
          if (cc < 0 || cc >= bunker.cells[0].length) continue;
          if (dr === 0 && dc === 0) bunker.cells[rr][cc] = false;
          else if (Math.random() < 0.55) bunker.cells[rr][cc] = false;
        }
      }
      this.explode(x, y, "#33ff66", null, 4);
      return true;
    }
    return false;
  }

  private checkEndConditions() {
    const alive = this.invaders.filter((i) => i.alive);
    const eliteAlive = this.elite?.alive ?? false;
    if (alive.length === 0 && !eliteAlive) {
      this.phase = "cleared";
      this.endTimer = 0.9;
      return;
    }
    for (const inv of alive) {
      const r = this.invaderRect(inv);
      if (r.y + r.h >= INVASION_Y) {
        this.lives = 0;
        this.finish(false);
        return;
      }
      // Invaders grind bunkers away as they pass through them.
      if (r.y + r.h >= BUNKER_Y) {
        this.hitBunker(r.x + r.w / 2, r.y + r.h);
      }
    }
  }

  private finish(cleared: boolean) {
    if (this.phase === "done" || this.phase === "over") return;
    this.phase = cleared ? "cleared" : "over";
    this.endTimer = cleared ? 0.9 : 1.4;
  }

  private buildResult(cleared: boolean): WaveResult {
    let bonus: WaveResult["bonus"] = null;
    if (cleared) {
      const clear = 100 + this.config.wave.waveIndex * 50;
      const accuracy =
        this.shots > 0 && this.hits / this.shots >= 0.5
          ? Math.round((this.hits / this.shots) * 200)
          : 0;
      bonus = { clear, accuracy };
      this.score += clear + accuracy;
    }
    return {
      scoreDelta: this.score,
      shots: this.shots,
      hits: this.hits,
      livesLeft: this.lives,
      deaths: this.deaths,
      ufosKilled: this.ufosKilled,
      cleared,
      bonus,
    };
  }

  private emitClear() {
    this.phase = "done";
    this.onEvent({ type: "waveClear", result: this.buildResult(true) });
  }

  private emitOver() {
    this.phase = "done";
    this.onEvent({ type: "gameOver", result: this.buildResult(false) });
  }

  private pointInRect(
    x: number,
    y: number,
    r: { x: number; y: number; w: number; h: number },
    pad: number,
  ) {
    return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
  }

  private spriteColor(kind: SpriteKind): string {
    return {
      squid: "#33ff66",
      crab: "#ff4466",
      octopus: "#7fd694",
      bug: "#ffb000",
      ufo: "#ff55ff",
      player: "#33ddff",
    }[kind];
  }

  private explode(x: number, y: number, color: string, points: number | null, count = 14) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 120;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.35 + Math.random() * 0.35,
        maxLife: 0.7,
        color,
        size: Math.random() < 0.3 ? 3 : 2,
      });
    }
    if (points !== null) {
      this.popups.push({ x, y: y - 6, text: `+${points}`, color, life: 0.9 });
    }
  }

  private updateEffects(dt: number) {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 60 * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const popup of this.popups) {
      popup.y -= 22 * dt;
      popup.life -= dt;
    }
    this.popups = this.popups.filter((p) => p.life > 0);
  }

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------

  private draw() {
    const { ctx } = this;
    ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);
    ctx.save();
    if (this.shake > 0) {
      ctx.translate((Math.random() - 0.5) * this.shake * 8, (Math.random() - 0.5) * this.shake * 8);
    }

    // Ground baseline
    ctx.fillStyle = "#33ff66";
    ctx.fillRect(0, BASELINE_Y, LOGICAL_W, 2);

    // Bunkers
    for (const bunker of this.bunkers) {
      for (let row = 0; row < bunker.cells.length; row++) {
        for (let col = 0; col < bunker.cells[row].length; col++) {
          if (bunker.cells[row][col]) {
            ctx.fillRect(
              bunker.x + col * BUNKER_CELL,
              bunker.y + row * BUNKER_CELL,
              BUNKER_CELL,
              BUNKER_CELL,
            );
          }
        }
      }
    }

    // Formation
    const frameIndex = this.marchStep % 2;
    for (const inv of this.invaders) {
      if (!inv.alive) continue;
      const sprite = this.sprites[inv.spec.kind]!;
      const r = this.invaderRect(inv);
      ctx.drawImage(sprite.frames[frameIndex % sprite.frames.length], r.x, r.y);
    }

    // Elite bug
    if (this.elite?.alive) {
      const sprite = this.sprites.bug!;
      const r = this.eliteRect();
      if (this.eliteFlash > 0) {
        ctx.globalAlpha = 0.4 + Math.random() * 0.6;
      }
      ctx.drawImage(sprite.frames[frameIndex % sprite.frames.length], r.x, r.y);
      ctx.globalAlpha = 1;
      // HP pips
      ctx.fillStyle = "#ffb000";
      for (let i = 0; i < this.elite.hp; i++) {
        ctx.fillRect(r.x + i * 6, r.y - 6, 4, 3);
      }
    }

    // UFO
    if (this.ufo) {
      ctx.drawImage(this.sprites.ufo!.frames[0], this.ufo.x, 14);
    }

    // Player
    if (this.phase !== "playerDying" && this.phase !== "over" && this.phase !== "done") {
      const blink = this.invincible > 0 && Math.floor(this.invincible * 10) % 2 === 0;
      if (!blink) {
        const sprite = this.sprites.player!;
        ctx.drawImage(sprite.frames[0], this.playerX - sprite.w / 2, PLAYER_Y);
      }
    }

    // Bullets
    ctx.fillStyle = "#eaffea";
    for (const bullet of this.bullets) {
      ctx.fillRect(bullet.x - 1, bullet.y - 4, 2, 8);
    }

    // Bombs (zigzag)
    ctx.fillStyle = "#ffb000";
    for (const bomb of this.bombs) {
      const wiggle = Math.sin(bomb.phase) > 0 ? 2 : -2;
      ctx.fillRect(bomb.x - 1 + wiggle, bomb.y - 6, 2, 4);
      ctx.fillRect(bomb.x - 1, bomb.y - 2, 2, 4);
      ctx.fillRect(bomb.x - 1 - wiggle, bomb.y + 2, 2, 4);
    }

    // Particles
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(p.life / p.maxLife, 0);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // Score popups
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    for (const popup of this.popups) {
      ctx.globalAlpha = Math.min(1, popup.life * 2);
      ctx.fillStyle = popup.color;
      ctx.fillText(popup.text, popup.x, popup.y);
    }
    ctx.globalAlpha = 1;

    ctx.restore();
  }
}
