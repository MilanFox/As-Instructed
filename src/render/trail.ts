import { alpha, artVersion, mix, trailRamp } from './theme.ts';
import type { TraceTimeline } from './timeline.ts';
import type { ViewRange } from './camera.ts';

export const TRAIL_MIN_VISITS = 2;

export const TRAIL_MAX_VISITS = 10;

const TRAIL_HOT_VISITS = 6;

let RAMP: string[] = [];
let rampVersion = -1;

export function rebuildTrailRamp(): void {
  const table = new Array<string>(TRAIL_MAX_VISITS + 1).fill('');
  const span = TRAIL_MAX_VISITS - TRAIL_MIN_VISITS;
  const hotSpan = TRAIL_HOT_VISITS - TRAIL_MIN_VISITS;
  const ramp = trailRamp;
  const range = ramp.maxAlpha - ramp.minAlpha;
  for (let v = TRAIL_MIN_VISITS; v <= TRAIL_MAX_VISITS; v++) {
    const hue = Math.min(1, (v - TRAIL_MIN_VISITS) / hotSpan);
    const depth = (v - TRAIL_MIN_VISITS) / span;
    table[v] = alpha(mix(ramp.cold, ramp.hot, hue), ramp.minAlpha + depth * range);
  }
  RAMP = table;
  rampVersion = artVersion();
}

function syncRamp(): void {
  if (rampVersion !== artVersion()) rebuildTrailRamp();
}

export function trailFill(visits: number): string {
  syncRamp();
  if (visits < TRAIL_MIN_VISITS) return '';
  return RAMP[Math.min(visits, TRAIL_MAX_VISITS)] as string;
}

export class VisitTrail {
  readonly w: number;
  readonly h: number;

  private readonly ticks: Float64Array;
  private readonly cells: Int32Array;

  private readonly counts: Uint16Array;
  private readonly hot: number[] = [];

  private cursor = 0;
  private syncedTo = -1;

  constructor(timeline: TraceTimeline) {
    const world = timeline.trace.initialWorld;
    this.w = world.w;
    this.h = world.h;
    this.counts = new Uint16Array(world.w * world.h);

    const ticks: number[] = [];
    const cells: number[] = [];
    const push = (t: number, x: number, y: number): void => {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
      ticks.push(Math.max(0, t));
      cells.push(y * this.w + x);
    };

    for (const bot of timeline.bots.values()) {
      push(bot.bornAt, bot.startX, bot.startY);
      for (const segment of bot.segments) {
        if (segment.kind !== 'move' || !segment.ok) continue;
        push(segment.t1, segment.toX, segment.toY);
      }
    }

    const order = ticks
      .map((_, i) => i)
      .sort((a, b) => (ticks[a] as number) - (ticks[b] as number));
    this.ticks = new Float64Array(order.length);
    this.cells = new Int32Array(order.length);
    for (let i = 0; i < order.length; i++) {
      const from = order[i] as number;
      this.ticks[i] = ticks[from] as number;
      this.cells[i] = cells[from] as number;
    }
  }

  sync(tick: number): void {
    if (tick < this.syncedTo) {
      this.counts.fill(0);
      this.hot.length = 0;
      this.cursor = 0;
    }
    while (this.cursor < this.ticks.length && (this.ticks[this.cursor] as number) <= tick) {
      const cell = this.cells[this.cursor] as number;
      const next = (this.counts[cell] as number) + 1;
      this.counts[cell] = next;
      if (next === TRAIL_MIN_VISITS) this.hot.push(cell);
      this.cursor++;
    }
    this.syncedTo = tick;
  }

  visitsAt(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.counts[y * this.w + x] as number;
  }

  get hotCount(): number {
    return this.hot.length;
  }

  draw(ctx: CanvasRenderingContext2D, tilePx: number, range: ViewRange): void {
    if (this.hot.length === 0) return;
    syncRamp();
    let style = '';
    for (let i = 0; i < this.hot.length; i++) {
      const cell = this.hot[i] as number;
      const x = cell % this.w;
      const y = (cell / this.w) | 0;
      if (x < range.x0 - 1 || x > range.x1 + 1 || y < range.y0 - 1 || y > range.y1 + 1) continue;
      const fill = RAMP[Math.min(this.counts[cell] as number, TRAIL_MAX_VISITS)] as string;
      if (fill !== style) {
        ctx.fillStyle = fill;
        style = fill;
      }
      ctx.fillRect(x * tilePx, y * tilePx, tilePx, tilePx);
    }
  }
}
