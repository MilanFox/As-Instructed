import { fxColors, alpha } from './theme.ts';

export const FX_LAYER_UNDER = 0;
export const FX_LAYER_OVER = 1;

const SHAPE_DOT = 0;
const SHAPE_RECT = 1;
const SHAPE_RING = 2;
const SHAPE_SHARD = 3;

interface Particle {
  active: boolean;
  serial: number;
  delay: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  size1: number;
  rot: number;
  spin: number;
  drag: number;
  gravity: number;
  shape: number;
  layer: number;
  color: string;
  alpha0: number;
}

function makeParticle(): Particle {
  return {
    active: false,
    serial: 0,
    delay: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 1,
    size: 0.1,
    size1: 0.1,
    rot: 0,
    spin: 0,
    drag: 0.9,
    gravity: 0,
    shape: SHAPE_DOT,
    layer: FX_LAYER_OVER,
    color: '#ffffff',
    alpha0: 1,
  };
}

export type FxName =
  | 'harvest'
  | 'plant'
  | 'mine'
  | 'pickup'
  | 'drop'
  | 'use'
  | 'power'
  | 'refuel'
  | 'spawn'
  | 'die'
  | 'move'
  | 'blocked'
  | 'send'
  | 'sendFail'
  | 'objective'
  | 'land'
  | 'flourish'
  | 'medal';

export interface FxOptions {
  dx?: number;
  dy?: number;
  accent?: string;
  seed?: number;
  strength?: number;
  delay?: number;
}

export class ParticleSystem {
  private readonly pool: Particle[];
  private readonly free: Int32Array;
  private freeCount: number;
  private stealCursor = 0;
  private serial = 0;
  private liveCount = 0;
  private emitDelay = 0;
  timeScale = 1;

  constructor(capacity = 900) {
    this.pool = new Array<Particle>(capacity);
    for (let i = 0; i < capacity; i++) this.pool[i] = makeParticle();
    this.free = new Int32Array(capacity);
    for (let i = 0; i < capacity; i++) this.free[i] = i;
    this.freeCount = capacity;
  }

  get capacity(): number {
    return this.pool.length;
  }

  get live(): number {
    return this.liveCount;
  }

  clear(): void {
    const pool = this.pool;
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i] as Particle;
      p.active = false;
      p.delay = 0;
      this.free[i] = i;
    }
    this.freeCount = pool.length;
    this.liveCount = 0;
  }

  private claim(): Particle {
    if (this.freeCount > 0) {
      const index = this.free[--this.freeCount] as number;
      const p = this.pool[index] as Particle;
      p.active = true;
      p.serial = this.serial++;
      this.liveCount++;
      return p;
    }
    const victim = this.pool[this.stealCursor] as Particle;
    this.stealCursor = (this.stealCursor + 1) % this.pool.length;
    victim.serial = this.serial++;
    return victim;
  }

  private add(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    size1: number,
    color: string,
    shape: number,
    layer: number,
    alpha0: number,
    gravity: number,
    drag: number,
    spin: number,
  ): Particle {
    const p = this.claim();
    p.delay = this.emitDelay;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.maxLife = life;
    p.size = size;
    p.size1 = size1;
    p.color = color;
    p.shape = shape;
    p.layer = layer;
    p.alpha0 = alpha0;
    p.gravity = gravity;
    p.drag = drag;
    p.rot = 0;
    p.spin = spin;
    return p;
  }

  emit(name: FxName, x: number, y: number, options: FxOptions = {}): void {
    const dx = options.dx ?? 0;
    const dy = options.dy ?? 0;
    const accent = options.accent ?? fxColors.pulse;
    const strength = options.strength ?? 1;
    this.emitDelay = options.delay ?? 0;
    let s = (options.seed ?? 0) | 0;
    const rand = (): number => {
      s = (s * 1664525 + 1013904223) | 0;
      return ((s >>> 8) & 0xffff) / 0xffff;
    };

    switch (name) {
      case 'move': {
        for (let i = 0; i < 8; i++) {
          const spread = (rand() - 0.5) * 0.5;
          this.add(
            x - dx * 0.3 + spread * 0.35,
            y - dy * 0.3 + spread * 0.35,
            -dx * (0.2 + rand() * 0.25) + spread * 0.4,
            -dy * (0.2 + rand() * 0.25) + spread * 0.4,
            0.28 + rand() * 0.2,
            0.018 + rand() * 0.022,
            0.075,
            fxColors.dust,
            SHAPE_DOT,
            FX_LAYER_UNDER,
            0.3,
            0,
            0.86,
            0,
          );
        }
        break;
      }
      case 'blocked': {
        for (let i = 0; i < 10; i++) {
          const a = (rand() - 0.5) * 2.2 + Math.atan2(-dy, -dx);
          const speed = 0.7 + rand() * 1.1;
          this.add(
            x + dx * 0.34,
            y + dy * 0.34,
            Math.cos(a) * speed,
            Math.sin(a) * speed,
            0.22 + rand() * 0.2,
            0.035,
            0,
            i % 3 === 0 ? '#ffffff' : fxColors.bad,
            SHAPE_SHARD,
            FX_LAYER_OVER,
            1,
            1.4,
            0.82,
            (rand() - 0.5) * 24,
          );
        }
        this.add(
          x + dx * 0.4,
          y + dy * 0.4,
          0,
          0,
          0.4,
          0.14,
          0.6,
          fxColors.bad,
          SHAPE_RING,
          FX_LAYER_OVER,
          0.9,
          0,
          1,
          0,
        );
        break;
      }
      case 'harvest': {
        for (let i = 0; i < 12; i++) {
          const a = rand() * Math.PI * 2;
          this.add(
            x + Math.cos(a) * 0.18,
            y + Math.sin(a) * 0.18,
            Math.cos(a) * (0.25 + rand() * 0.35),
            Math.sin(a) * (0.25 + rand() * 0.35) - 0.5,
            0.5 + rand() * 0.4,
            0.05 + rand() * 0.04,
            0,
            i % 2 === 0 ? fxColors.spark : fxColors.good,
            SHAPE_SHARD,
            FX_LAYER_OVER,
            1,
            0.5,
            0.9,
            (rand() - 0.5) * 12,
          );
        }
        this.add(
          x,
          y,
          0,
          0,
          0.45,
          0.1,
          0.55,
          fxColors.good,
          SHAPE_RING,
          FX_LAYER_OVER,
          0.7,
          0,
          1,
          0,
        );
        break;
      }
      case 'plant': {
        for (let i = 0; i < 8; i++) {
          const a = rand() * Math.PI * 2;
          this.add(
            x,
            y,
            Math.cos(a) * 0.3,
            Math.sin(a) * 0.3,
            0.45,
            0.05,
            0.01,
            fxColors.good,
            SHAPE_DOT,
            FX_LAYER_UNDER,
            0.8,
            0.4,
            0.88,
            0,
          );
        }
        break;
      }
      case 'mine': {
        for (let i = 0; i < 14; i++) {
          const a = Math.atan2(dy, dx) + (rand() - 0.5) * 1.6;
          const speed = 0.5 + rand() * 1.0;
          this.add(
            x - dx * 0.2,
            y - dy * 0.2,
            -Math.cos(a) * speed,
            -Math.sin(a) * speed,
            0.4 + rand() * 0.35,
            0.045 + rand() * 0.045,
            0.01,
            i % 4 === 0 ? fxColors.spark : fxColors.chip,
            SHAPE_RECT,
            FX_LAYER_OVER,
            1,
            2.2,
            0.9,
            (rand() - 0.5) * 20,
          );
        }
        break;
      }
      case 'pickup':
      case 'drop': {
        const up = name === 'pickup' ? -1 : 1;
        for (let i = 0; i < 7; i++) {
          this.add(
            x + (rand() - 0.5) * 0.5,
            y + (rand() - 0.5) * 0.4,
            (rand() - 0.5) * 0.2,
            up * (0.3 + rand() * 0.3),
            0.35,
            0.04,
            0,
            accent,
            SHAPE_DOT,
            FX_LAYER_OVER,
            0.9,
            0,
            0.9,
            0,
          );
        }
        break;
      }
      case 'use': {
        this.add(x, y, 0, 0, 0.55, 0.12, 0.75, accent, SHAPE_RING, FX_LAYER_OVER, 0.9, 0, 1, 0);
        this.add(x, y, 0, 0, 0.75, 0.05, 0.5, accent, SHAPE_RING, FX_LAYER_OVER, 0.5, 0, 1, 0);
        break;
      }
      case 'power': {
        this.add(x, y, 0, 0, 0.7, 0.1, 0.9, fxColors.power, SHAPE_RING, FX_LAYER_OVER, 1, 0, 1, 0);
        for (let i = 0; i < 10; i++) {
          const a = rand() * Math.PI * 2;
          this.add(
            x,
            y,
            Math.cos(a) * 1.2,
            Math.sin(a) * 1.2,
            0.35,
            0.03,
            0,
            fxColors.power,
            SHAPE_SHARD,
            FX_LAYER_OVER,
            1,
            0,
            0.8,
            0,
          );
        }
        break;
      }
      case 'refuel': {
        for (let i = 0; i < 10; i++) {
          this.add(
            x + (rand() - 0.5) * 0.6,
            y + 0.3,
            (rand() - 0.5) * 0.15,
            -0.35 - rand() * 0.3,
            0.6,
            0.045,
            0.01,
            fxColors.power,
            SHAPE_DOT,
            FX_LAYER_OVER,
            0.9,
            0,
            0.95,
            0,
          );
        }
        break;
      }
      case 'spawn': {
        this.add(x, y, 0, 0, 0.6, 0.7, 0.05, accent, SHAPE_RING, FX_LAYER_UNDER, 1, 0, 1, 0);
        break;
      }
      case 'die': {
        for (let i = 0; i < 18; i++) {
          const a = rand() * Math.PI * 2;
          const speed = 0.4 + rand() * 1.3;
          this.add(
            x,
            y,
            Math.cos(a) * speed,
            Math.sin(a) * speed,
            0.6 + rand() * 0.4,
            0.05,
            0.01,
            i % 3 === 0 ? fxColors.bad : fxColors.chip,
            SHAPE_RECT,
            FX_LAYER_OVER,
            1,
            1.8,
            0.9,
            (rand() - 0.5) * 26,
          );
        }
        break;
      }
      case 'send': {
        this.add(x, y, 0, 0, 0.6, 0.15, 0.95, accent, SHAPE_RING, FX_LAYER_OVER, 0.75, 0, 1, 0);
        this.add(x, y, 0, 0, 0.8, 0.05, 0.55, accent, SHAPE_RING, FX_LAYER_OVER, 0.45, 0, 1, 0);
        break;
      }
      case 'sendFail': {
        this.add(x, y, 0, 0, 0.5, 0.9, 0.12, fxColors.bad, SHAPE_RING, FX_LAYER_OVER, 0.9, 0, 1, 0);
        for (let i = 0; i < 6; i++) {
          const a = rand() * Math.PI * 2;
          this.add(
            x,
            y,
            Math.cos(a) * 0.5,
            Math.sin(a) * 0.5,
            0.3,
            0.035,
            0,
            fxColors.bad,
            SHAPE_SHARD,
            FX_LAYER_OVER,
            1,
            0,
            0.85,
            0,
          );
        }
        break;
      }
      case 'objective': {
        this.add(x, y, 0, 0, 0.9, 0.15, 1.1, fxColors.good, SHAPE_RING, FX_LAYER_OVER, 1, 0, 1, 0);
        this.add(
          x,
          y,
          0,
          0,
          0.7,
          0.1,
          0.7,
          fxColors.good,
          SHAPE_RING,
          FX_LAYER_OVER,
          0.5,
          0,
          1,
          0,
        ).delay = this.emitDelay + 0.09;
        break;
      }
      case 'land': {
        const count = 3 + Math.round(strength * 3);
        for (let i = 0; i < count; i++) {
          const a = rand() * Math.PI * 2;
          const speed = 0.12 + rand() * 0.16;
          this.add(
            x + Math.cos(a) * 0.12,
            y + Math.sin(a) * 0.08 + 0.08,
            Math.cos(a) * speed,
            Math.sin(a) * speed * 0.5,
            0.32 + rand() * 0.18,
            0.02 + rand() * 0.02,
            0.09,
            fxColors.dust,
            SHAPE_DOT,
            FX_LAYER_UNDER,
            0.22 * strength,
            0,
            0.84,
            0,
          );
        }
        break;
      }
      case 'flourish': {
        for (let i = 0; i < 3; i++) {
          this.add(
            x,
            y,
            0,
            0,
            0.85 + i * 0.12,
            0.12,
            1.05 + i * 0.35,
            i === 1 ? fxColors.spark : fxColors.good,
            SHAPE_RING,
            FX_LAYER_OVER,
            (1 - i * 0.24) * strength,
            0,
            1,
            0,
          ).delay = this.emitDelay + i * 0.11;
        }
        const motes = Math.round(7 * strength);
        for (let i = 0; i < motes; i++) {
          const a = rand() * Math.PI * 2;
          this.add(
            x + Math.cos(a) * 0.3,
            y + Math.sin(a) * 0.3,
            Math.cos(a) * 0.12,
            -0.28 - rand() * 0.22,
            0.75 + rand() * 0.35,
            0.028,
            0.004,
            i % 3 === 0 ? fxColors.spark : fxColors.good,
            SHAPE_DOT,
            FX_LAYER_OVER,
            0.85,
            -0.05,
            0.94,
            0,
          ).delay = this.emitDelay + rand() * 0.22;
        }
        break;
      }
      case 'medal': {
        const notes = Math.max(2, Math.min(4, Math.round(strength)));
        const step = notes >= 4 ? 0.075 : notes === 3 ? 0.08 : 0.085;
        for (let i = 0; i < notes; i++) {
          this.add(
            x,
            y,
            0,
            0,
            0.6 + i * 0.14,
            0.1 + i * 0.06,
            0.9 + i * 0.55,
            accent,
            SHAPE_RING,
            FX_LAYER_OVER,
            0.85 - i * 0.12,
            0,
            1,
            0,
          ).delay = this.emitDelay + i * step;
        }
        const motes = notes >= 4 ? 14 : notes === 3 ? 8 : 4;
        for (let i = 0; i < motes; i++) {
          const a = rand() * Math.PI * 2;
          const speed = 0.3 + rand() * 0.5;
          this.add(
            x,
            y,
            Math.cos(a) * speed,
            Math.sin(a) * speed - 0.2,
            0.9 + rand() * 0.6,
            0.022 + rand() * 0.016,
            0.004,
            i % 4 === 0 ? '#ffffff' : accent,
            SHAPE_DOT,
            FX_LAYER_OVER,
            0.8,
            0.16,
            0.93,
            0,
          ).delay = this.emitDelay + (notes - 1) * step + rand() * 0.16;
        }
        break;
      }
      default:
        break;
    }
    this.emitDelay = 0;
  }

  update(dt: number): void {
    const step = dt * this.timeScale;
    if (step <= 0) return;
    const pool = this.pool;
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i] as Particle;
      if (!p.active) continue;
      if (p.delay > 0) {
        p.delay -= step;
        continue;
      }
      p.life -= step;
      if (p.life <= 0) {
        p.active = false;
        this.liveCount--;
        this.free[this.freeCount++] = i;
        continue;
      }
      p.vy += p.gravity * step;
      const damp = Math.pow(p.drag, step * 60);
      p.vx *= damp;
      p.vy *= damp;
      p.x += p.vx * step;
      p.y += p.vy * step;
      p.rot += p.spin * step;
    }
  }

  draw(ctx: CanvasRenderingContext2D, layer: number, tilePx: number): void {
    const pool = this.pool;
    ctx.save();
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i] as Particle;
      if (!p.active || p.layer !== layer || p.delay > 0) continue;
      const u = 1 - p.life / p.maxLife;
      const a = p.alpha0 * (1 - u * u);
      if (a <= 0.01) continue;
      const size = (p.size + (p.size1 - p.size) * u) * tilePx;
      if (size <= 0.2) continue;
      const px = p.x * tilePx;
      const py = p.y * tilePx;
      ctx.globalAlpha = a;
      switch (p.shape) {
        case SHAPE_RING:
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(1, tilePx * 0.045);
          ctx.beginPath();
          ctx.arc(px, py, size, 0, Math.PI * 2);
          ctx.stroke();
          break;
        case SHAPE_RECT:
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(p.rot);
          ctx.fillRect(-size, -size, size * 2, size * 2);
          ctx.restore();
          break;
        case SHAPE_SHARD:
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(p.rot === 0 ? Math.atan2(p.vy, p.vx) : p.rot);
          ctx.fillRect(-size * 2.2, -size * 0.5, size * 4.4, size);
          ctx.restore();
          break;
        default:
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(px, py, size, 0, Math.PI * 2);
          ctx.fill();
          break;
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

export function glowStyle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
): CanvasGradient {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, alpha(color, 0.35));
  g.addColorStop(1, alpha(color, 0));
  return g;
}
