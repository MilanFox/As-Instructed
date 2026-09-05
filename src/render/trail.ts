/**
 * The visited-tile trail: how often the bots have stood on each cell, drawn on the floor.
 *
 * DESIGN.md §11 A5 makes RENDER responsible for the visuals a level's *failure* is argued
 * through. `w4-02` is the case that named this one: the cave loops, the w4-01 rule rides the
 * loop until the tick budget halts it, and until now the replay drew a bot moving around with
 * nothing to say it had been there twenty-five times already. CURRICULUM.md's `naive-fails` line
 * for that level asks for exactly this — "the replay should show the bot going round and round".
 *
 * Two decisions are load-bearing and both come from measuring real traces (docs/FIX-TRAIL.md §1):
 *
 * - **Heat is a count, not a flag.** `w4-02` solved correctly touches its worst tile 3 times;
 *   `w4-02` failed touches it 25 to 113 times. A trail that saturated on the first visit would
 *   paint the two runs identically, which is the whole defect restated.
 * - **Only revisits draw.** One visit is free and invisible. That makes the feature always-on
 *   without a per-level opt-in: on `w4-01`, `w2-02`, `w2-05` and every other level whose solution
 *   never doubles back, nothing is drawn at all, so there is nothing to switch off.
 *
 * Everything here is derived from `TraceTimeline` — the arrival ticks the replay already draws.
 * No trace field, no engine change.
 */

import { alpha, mix, palette } from './theme.ts';
import type { TraceTimeline } from './timeline.ts';
import type { ViewRange } from './camera.ts';

/** Visits below this draw nothing. Standing somewhere once is not information. */
export const TRAIL_MIN_VISITS = 2;

/**
 * Visits at which the ramp saturates.
 *
 * Chosen from the census, not from taste: the hottest *correct* solution in the campaign reaches
 * 6 (`w4-04`, `w3-01`), so a ceiling of 10 leaves working play in the lower half of the ramp and
 * hands the top of it to runs that are genuinely stuck.
 */
export const TRAIL_MAX_VISITS = 10;

/** Visits by which the wash has finished turning red. Alpha keeps climbing past it. */
const TRAIL_HOT_VISITS = 6;

/**
 * Cold-to-hot fill for each visit count.
 *
 * `bgVoid` to `danger`, both already in the palette. The cold end is a *darkening* rather than a
 * tint, which is what makes the first step legible: the first draft ran the ramp from `inkDim`,
 * and `#6a7a8c` turned out to be within a few points of the cave floor's own grey, so two visits
 * rendered as nothing at all on the one level this exists for. Luminance first, hue second, works
 * on every biome. `danger` is what the renderer already means by "this did not work"
 * (`drawBlockedTell`), so the hot end needed no new accent.
 *
 * The ramp deliberately does not pass through `accent2`, which would read as a smoother heat
 * gradient but is also `overlay.goal`; a mid-heat floor the colour of the objective brackets is
 * the one confusion `w4-02` cannot afford.
 *
 * Hue and alpha are on separate curves on purpose. Red arrives by `TRAIL_HOT_VISITS`, so the
 * second lap of a loop reads as trouble while the player is still watching; alpha goes on
 * deepening to `TRAIL_MAX_VISITS`, so a run that is well past trouble keeps saying so.
 *
 * Built once. `alpha()` memoises per hue, so this is nine small tables and no per-frame strings.
 */
const RAMP: readonly string[] = (() => {
  const table = new Array<string>(TRAIL_MAX_VISITS + 1).fill('');
  const span = TRAIL_MAX_VISITS - TRAIL_MIN_VISITS;
  const hotSpan = TRAIL_HOT_VISITS - TRAIL_MIN_VISITS;
  for (let v = TRAIL_MIN_VISITS; v <= TRAIL_MAX_VISITS; v++) {
    const hue = Math.min(1, (v - TRAIL_MIN_VISITS) / hotSpan);
    const depth = (v - TRAIL_MIN_VISITS) / span;
    table[v] = alpha(mix(palette.bgVoid, palette.danger, hue), 0.16 + depth * 0.2);
  }
  return table;
})();

export function trailFill(visits: number): string {
  if (visits < TRAIL_MIN_VISITS) return '';
  return RAMP[Math.min(visits, TRAIL_MAX_VISITS)] as string;
}

export class VisitTrail {
  readonly w: number;
  readonly h: number;

  /** Arrival ticks, ascending. Parallel to `cells`. */
  private readonly ticks: Float64Array;
  private readonly cells: Int32Array;

  private readonly counts: Uint16Array;
  /** Cells at or past `TRAIL_MIN_VISITS`, in the order they crossed it. The draw list. */
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

    const order = ticks.map((_, i) => i).sort((a, b) => (ticks[a] as number) - (ticks[b] as number));
    this.ticks = new Float64Array(order.length);
    this.cells = new Int32Array(order.length);
    for (let i = 0; i < order.length; i++) {
      const from = order[i] as number;
      this.ticks[i] = ticks[from] as number;
      this.cells[i] = cells[from] as number;
    }
  }

  /**
   * Brings the heat map up to `tick`.
   *
   * Forwards is an incremental walk of the arrival list. Backwards rebuilds from zero, which is
   * the same bargain `refreshSnapshot` already makes and for the same reason: the alternative is
   * a per-cell undo stack to make scrubbing back cheaper than it already is. The whole rebuild is
   * one `Uint16Array.fill` plus at most one increment per tick in the trace.
   */
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

  /** Times the bots have stood on this cell at or before the last `sync`. */
  visitsAt(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.counts[y * this.w + x] as number;
  }

  /** Cells currently drawing. Bounded by the grid, not by the tick budget. */
  get hotCount(): number {
    return this.hot.length;
  }

  /**
   * Fills every revisited cell in view. Runs after the terrain blit and before the grid, so the
   * grid lines stay on top and a run of hot tiles reads as a chain of tiles rather than a blob.
   */
  draw(ctx: CanvasRenderingContext2D, tilePx: number, range: ViewRange): void {
    if (this.hot.length === 0) return;
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
