/**
 * Trace -> per-bot pose timelines.
 *
 * The renderer draws at a *fractional* tick, so it cannot ask `replayTo` where a bot is: replay
 * only knows integer ticks and only knows the world *after* an action. Instead each bot's events
 * are compiled once, at `setTrace`, into a list of time segments; a frame is then a binary search
 * plus arithmetic. That is what makes `seek(3.5)` show a bot halfway through its move, and what
 * makes scrubbing backwards exactly as cheap as scrubbing forwards.
 *
 * DESIGN.md §11 A5 lives here too: every bot has its own clock, so every bot has its own segment
 * list and two bots at different clocks are legitimately at different points in their animations
 * on the same wall-clock frame. And a blocked move produces a *different segment shape* from a
 * successful one — a bump curve rather than a translation — rather than merely a different tint.
 *
 * Pure module: no canvas, no DOM.
 */

import { Dir } from '../engine/index.ts';
import type { Trace, TraceEvent, Vec, World } from '../engine/index.ts';

export const SEGMENT_IDLE = 'idle';

/** How far, in tiles, a bot lunges into an obstacle before recoiling. */
export const BUMP_DISTANCE = 0.26;
/** Ticks over which the arrival squash decays. */
export const SETTLE_TICKS = 0.9;
/** Ticks a tread mark stays visible. */
export const TREAD_FADE_TICKS = 7;

/**
 * Fraction of a move spent winding up.
 *
 * Anticipation is a *squash*, never a retreat. Backing up before setting off would read
 * beautifully and would also make `poseAt(0.5)` stop being the midpoint of the move, which the
 * renderer's agreement with `replayTo` depends on. Easing puts the bot only three hundredths of a
 * tile down the road by the end of the wind-up anyway, so a crouch there reads as one.
 */
export const ANTICIPATION = 0.18;

export interface BotSegment {
  t0: number;
  t1: number;
  kind: string;
  ok: boolean;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  facing: Dir;
  /** Unit vector of the attempted direction; zero for non-directional actions. */
  dx: number;
  dy: number;
  /** Cell the action targeted (mine/harvest/use/...), in tile units. */
  atX: number;
  atY: number;
}

/** Everything `sprites.ts` needs to draw one bot on one frame. Mutated in place; never allocated. */
export interface BotPose {
  id: number;
  present: boolean;
  alive: boolean;
  /** Tile units, top-left of the bot's cell. Fractional while moving. */
  x: number;
  y: number;
  facing: Dir;
  /** 0..1 through a successful move. */
  travel: number;
  /** Positive stretches along the travel axis, negative squashes. */
  stretch: number;
  /** 0..1, decays after arrival. Drives the landing squash. */
  settle: number;
  /** 0..1 intensity of the "this move failed" flash. */
  blocked: number;
  /**
   * 0..1 wind-up before a move commits. Drives the crouch and the antenna lag; the bot is a cheap
   * machine deciding to do a thing, and it should look like it takes a moment.
   */
  anticipate: number;
  /**
   * 0..1, decaying after a bump. The beat where the bot collects itself before pretending nothing
   * happened. Purely cosmetic — the blocked *signal* is `blocked`, which W7 puzzles depend on.
   */
  recoil: number;
  /** 0..1 through a non-move action. */
  action: number;
  actionKind: string;
  /**
   * 0..1 through a `wait` or `sync` span. A bot parked at a barrier must read as *waiting*, not
   * as frozen — in World 7 the two look identical without this.
   */
  idle: number;
  /** The action under the playhead reported failure. Blocked move, dead recipient, empty tile. */
  failed: boolean;
  /** Facing unit vector, for the headlight cone. */
  dx: number;
  dy: number;
  /** Cell the current action targets. */
  atX: number;
  atY: number;
  /** Bot clock at the rendered tick, for the HUD. */
  clock: number;
}

export function createPose(id = -1): BotPose {
  return {
    id,
    present: false,
    alive: true,
    x: 0,
    y: 0,
    facing: Dir.East,
    travel: 0,
    stretch: 0,
    settle: 0,
    blocked: 0,
    anticipate: 0,
    recoil: 0,
    action: 0,
    actionKind: SEGMENT_IDLE,
    idle: 0,
    failed: false,
    dx: 1,
    dy: 0,
    atX: 0,
    atY: 0,
    clock: 0,
  };
}

const DIR_DX = [0, 1, 0, -1];
const DIR_DY = [-1, 0, 1, 0];

export function dirVectorX(dir: Dir): number {
  return DIR_DX[dir] ?? 0;
}

export function dirVectorY(dir: Dir): number {
  return DIR_DY[dir] ?? 0;
}

function smootherstep(u: number): number {
  return u * u * u * (u * (u * 6 - 15) + 10);
}

/**
 * The bump curve for a blocked move: a fast lunge into the obstruction, a hard stop, then a
 * damped recoil. Returns a multiplier on `BUMP_DISTANCE`, 0 at rest.
 */
export function bumpCurve(u: number): number {
  if (u <= 0) return 0;
  // Exactly at rest once the tick is spent, so a blocked move ends on its origin tile to the
  // last decimal and the pose can be compared against `replayTo` without a tolerance.
  if (u >= 1) return 0;
  if (u < 0.28) return smootherstep(u / 0.28);
  const k = u - 0.28;
  return Math.exp(-6.5 * k) * Math.cos(11 * k);
}

/** Impact flash for a blocked move: ramps in with the lunge, decays fast after the hit. */
export function blockedFlash(u: number): number {
  if (u <= 0) return 0;
  if (u < 0.28) return u / 0.28;
  return Math.exp(-3.2 * (u - 0.28));
}

/**
 * The stretch profile of one successful move: crouch, launch, and back to neutral on arrival so
 * the landing wobble can take over cleanly. Squash-and-stretch is the whole reason a bot that
 * moves *correctly* can still move *badly*.
 */
export function moveStretch(k: number): number {
  if (k <= 0 || k >= 1) return 0;
  if (k < ANTICIPATION) return -0.115 * Math.sin((Math.PI * k) / ANTICIPATION);
  return 0.19 * Math.sin((Math.PI * (k - ANTICIPATION)) / (1 - ANTICIPATION));
}

/** How hard the wind-up is being felt at `k` through a move. */
export function anticipationAt(k: number): number {
  if (k <= 0 || k >= ANTICIPATION) return 0;
  return Math.sin((Math.PI * k) / ANTICIPATION);
}

/**
 * The beat after a bump. Zero until the tick is spent, then a decaying shimmy — the bot shaking
 * itself off. Ends at hard zero so a trace that finishes on a blocked move is not left twitching.
 */
export function recoilAt(u: number): number {
  if (u <= 1 || u > 3) return 0;
  return Math.exp(-2.1 * (u - 1));
}

/** Damped landing wobble, in "stretch" units. `age` is in ticks since arrival. */
export function settleCurve(age: number): number {
  if (age < 0 || age > SETTLE_TICKS) return 0;
  const k = age / SETTLE_TICKS;
  return Math.exp(-5 * k) * Math.cos(k * 13);
}

const MOVE_KINDS = new Set(['move']);
/** Spans where the bot is deliberately doing nothing. `sync` is one event per bot that idled. */
const IDLE_KINDS = new Set(['wait', 'sync']);
const HOLD_KINDS = new Set([
  'harvest',
  'mine',
  'plant',
  'pickup',
  'drop',
  'use',
  'mark',
  'refuel',
  'act',
  'send',
  'recv',
  'spawn',
]);

export class BotTimeline {
  readonly id: number;
  readonly segments: BotSegment[] = [];
  /** Tick the bot first exists at. `-Infinity` for bots present in `initialWorld`. */
  bornAt: number;
  diedAt = Number.POSITIVE_INFINITY;
  name: string;
  startX: number;
  startY: number;
  startFacing: Dir;

  constructor(id: number, at: Vec, facing: Dir, name: string, bornAt: number) {
    this.id = id;
    this.startX = at.x;
    this.startY = at.y;
    this.startFacing = facing;
    this.name = name;
    this.bornAt = bornAt;
  }

  get endTick(): number {
    const last = this.segments[this.segments.length - 1];
    return last ? last.t1 : this.bornAt;
  }

  /** Index of the segment covering `t`, or the last one before it. `-1` before the first. */
  indexAt(t: number): number {
    const segments = this.segments;
    let low = 0;
    let high = segments.length - 1;
    let found = -1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if ((segments[mid] as BotSegment).t0 <= t) {
        found = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return found;
  }

  /** Writes the bot's pose at fractional tick `t` into `out`. Allocation-free. */
  poseAt(t: number, out: BotPose): BotPose {
    out.id = this.id;
    out.present = t >= this.bornAt;
    out.alive = t < this.diedAt;
    out.travel = 0;
    out.stretch = 0;
    out.settle = 0;
    out.blocked = 0;
    out.anticipate = 0;
    out.recoil = 0;
    out.action = 0;
    out.actionKind = SEGMENT_IDLE;
    out.idle = 0;
    out.failed = false;
    out.clock = 0;

    const index = this.indexAt(t);
    if (index < 0) {
      out.x = this.startX;
      out.y = this.startY;
      out.facing = this.startFacing;
      out.atX = this.startX;
      out.atY = this.startY;
      out.dx = dirVectorX(out.facing);
      out.dy = dirVectorY(out.facing);
      return out;
    }

    const seg = this.segments[index] as BotSegment;
    const span = Math.max(1e-6, seg.t1 - seg.t0);
    const u = (t - seg.t0) / span;
    out.facing = seg.facing;
    out.dx = dirVectorX(seg.facing);
    out.dy = dirVectorY(seg.facing);
    out.atX = seg.atX;
    out.atY = seg.atY;
    out.clock = Math.min(seg.t1, Math.max(seg.t0, t));

    if (MOVE_KINDS.has(seg.kind) && seg.ok) {
      const k = Math.max(0, Math.min(1, u));
      const e = smootherstep(k);
      out.x = seg.fromX + (seg.toX - seg.fromX) * e;
      out.y = seg.fromY + (seg.toY - seg.fromY) * e;
      out.travel = k;
      out.stretch = moveStretch(k);
      out.anticipate = anticipationAt(k);
      if (t >= seg.t1) {
        const age = t - seg.t1;
        out.settle = Math.max(0, 1 - age / SETTLE_TICKS);
        out.stretch = settleCurve(age) * -0.22;
      }
      return out;
    }

    out.x = seg.fromX;
    out.y = seg.fromY;

    if (MOVE_KINDS.has(seg.kind)) {
      // Blocked. Lunge and recoil in place; never leaves the origin cell.
      const k = Math.max(0, (t - seg.t0) / span);
      const push = bumpCurve(Math.min(k, 2)) * BUMP_DISTANCE;
      out.x = seg.fromX + seg.dx * push;
      out.y = seg.fromY + seg.dy * push;
      out.blocked = Math.max(0, Math.min(1, blockedFlash(Math.min(k, 2))));
      out.recoil = recoilAt(k);
      out.anticipate = anticipationAt(Math.min(k, 1));
      out.stretch = -Math.abs(push) * 0.9;
      out.actionKind = 'blocked';
      return out;
    }

    if (IDLE_KINDS.has(seg.kind)) {
      out.idle = Math.max(0, Math.min(1, u));
      out.actionKind = seg.kind;
      return out;
    }

    if (HOLD_KINDS.has(seg.kind)) {
      const k = Math.max(0, Math.min(1, u));
      out.action = k;
      out.actionKind = seg.kind;
      out.failed = !seg.ok && u <= 1.6;
      const lean = Math.sin(Math.PI * k) * 0.09;
      out.x = seg.fromX + seg.dx * lean;
      out.y = seg.fromY + seg.dy * lean;
      return out;
    }

    out.actionKind = seg.kind;
    return out;
  }
}

/** Ticks at which the terrain layer's contents change. Used for cache invalidation. */
export interface TickIndex {
  ticks: number[];
}

/** Number of entries in `index` at or before `t`. Binary search; the value is a cheap revision id. */
export function revisionAt(index: TickIndex, t: number): number {
  const ticks = index.ticks;
  let low = 0;
  let high = ticks.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if ((ticks[mid] as number) <= t) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** World-mutating event kinds that do not change terrain but do change what is drawn on top. */
const WORLD_KINDS = new Set([
  'pickup',
  'drop',
  'machineChange',
  'mark',
  'spawn',
  'die',
  'refuel',
  'harvest',
  'plant',
  'mine',
]);

export class TraceTimeline {
  readonly trace: Trace;
  readonly bots = new Map<number, BotTimeline>();
  readonly botOrder: number[] = [];
  /** Ticks of `tileChange` events — the terrain cache's invalidation points. */
  readonly terrainTicks: TickIndex = { ticks: [] };
  /** Ticks of everything else that changes the drawn world. */
  readonly worldTicks: TickIndex = { ticks: [] };
  readonly endTick: number;

  constructor(trace: Trace) {
    this.trace = trace;
    this.endTick = trace.endTick;
    const initial: World = trace.initialWorld;

    for (const bot of initial.bots) {
      const timeline = new BotTimeline(
        bot.id,
        bot.at,
        bot.facing,
        bot.name,
        Number.NEGATIVE_INFINITY,
      );
      this.bots.set(bot.id, timeline);
      this.botOrder.push(bot.id);
    }

    for (const event of trace.events) {
      if (event.kind === 'tileChange') this.terrainTicks.ticks.push(event.t);
      else if (WORLD_KINDS.has(event.kind)) this.worldTicks.ticks.push(event.t);

      if (event.kind === 'spawn') {
        const child = event.bot;
        if (!this.bots.has(child.id)) {
          const timeline = new BotTimeline(child.id, child.at, child.facing, child.name, event.t);
          this.bots.set(child.id, timeline);
          this.botOrder.push(child.id);
        }
      }
      this.appendSegment(event);
    }

    this.terrainTicks.ticks.sort((a, b) => a - b);
    this.worldTicks.ticks.sort((a, b) => a - b);
    this.botOrder.sort((a, b) => a - b);
  }

  private appendSegment(event: TraceEvent): void {
    if (!('botId' in event) || typeof event.botId !== 'number') return;
    const timeline = this.bots.get(event.botId);
    if (!timeline) return;
    const prev = timeline.segments[timeline.segments.length - 1];
    const fromX = prev ? prev.toX : timeline.startX;
    const fromY = prev ? prev.toY : timeline.startY;
    const dt = 'dt' in event && typeof event.dt === 'number' ? event.dt : 0;

    if (event.kind === 'die') {
      timeline.diedAt = event.t;
    }

    let facing = prev ? prev.facing : timeline.startFacing;
    let dx = 0;
    let dy = 0;
    let toX = fromX;
    let toY = fromY;
    let atX = fromX;
    let atY = fromY;
    let ok = true;

    switch (event.kind) {
      case 'move':
        facing = event.dir;
        dx = dirVectorX(event.dir);
        dy = dirVectorY(event.dir);
        ok = event.ok;
        if (event.ok) {
          toX = event.to.x;
          toY = event.to.y;
        }
        atX = fromX + dx;
        atY = fromY + dy;
        break;
      case 'turn':
        facing = event.facing;
        dx = dirVectorX(facing);
        dy = dirVectorY(facing);
        break;
      case 'harvest':
      case 'mine':
      case 'plant':
      case 'pickup':
      case 'drop':
      case 'use':
      case 'mark':
      case 'refuel':
        atX = event.at.x;
        atY = event.at.y;
        dx = Math.sign(atX - fromX);
        dy = Math.sign(atY - fromY);
        if (dx === 0 && dy === 0) {
          dx = dirVectorX(facing);
          dy = dirVectorY(facing);
        }
        ok = 'ok' in event ? Boolean(event.ok) : true;
        break;
      case 'send':
        // A failed `send` (dead or unknown recipient) is drawn like a blocked move: the engine
        // now reports `ok` rather than shimming an `act` event, so the renderer can show it.
        ok = event.ok;
        dx = dirVectorX(facing);
        dy = dirVectorY(facing);
        break;
      case 'act':
        ok = event.ok;
        dx = dirVectorX(facing);
        dy = dirVectorY(facing);
        break;
      case 'spawn':
      case 'recv':
        dx = dirVectorX(facing);
        dy = dirVectorY(facing);
        break;
      default:
        dx = dirVectorX(facing);
        dy = dirVectorY(facing);
        break;
    }

    timeline.segments.push({
      t0: event.t,
      t1: event.t + Math.max(dt, dt === 0 ? 0.001 : dt),
      kind: event.kind,
      ok,
      fromX,
      fromY,
      toX,
      toY,
      facing,
      dx,
      dy,
      atX,
      atY,
    });
  }

  terrainRevision(t: number): number {
    return revisionAt(this.terrainTicks, t);
  }

  worldRevision(t: number): number {
    return revisionAt(this.worldTicks, t) + this.terrainRevision(t);
  }

  timelineFor(botId: number): BotTimeline | undefined {
    return this.bots.get(botId);
  }
}
