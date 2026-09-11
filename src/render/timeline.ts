import { Dir } from '../engine/index.ts';
import type { Trace, TraceEvent, Vec, World } from '../engine/index.ts';

export const SEGMENT_IDLE = 'idle';

export const BUMP_DISTANCE = 0.26;
export const SETTLE_TICKS = 0.9;
export const TREAD_FADE_TICKS = 7;

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
  dx: number;
  dy: number;
  atX: number;
  atY: number;
}

export interface BotPose {
  id: number;
  present: boolean;
  alive: boolean;
  x: number;
  y: number;
  facing: Dir;
  travel: number;
  stretch: number;
  settle: number;
  blocked: number;
  anticipate: number;
  recoil: number;
  action: number;
  actionKind: string;
  idle: number;
  failed: boolean;
  dx: number;
  dy: number;
  atX: number;
  atY: number;
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

export function bumpCurve(u: number): number {
  if (u <= 0) return 0;
  if (u >= 1) return 0;
  if (u < 0.28) return smootherstep(u / 0.28);
  const k = u - 0.28;
  return Math.exp(-6.5 * k) * Math.cos(11 * k);
}

export function blockedFlash(u: number): number {
  if (u <= 0) return 0;
  if (u < 0.28) return u / 0.28;
  return Math.exp(-3.2 * (u - 0.28));
}

export function moveStretch(k: number): number {
  if (k <= 0 || k >= 1) return 0;
  if (k < ANTICIPATION) return -0.115 * Math.sin((Math.PI * k) / ANTICIPATION);
  return 0.19 * Math.sin((Math.PI * (k - ANTICIPATION)) / (1 - ANTICIPATION));
}

export function anticipationAt(k: number): number {
  if (k <= 0 || k >= ANTICIPATION) return 0;
  return Math.sin((Math.PI * k) / ANTICIPATION);
}

export function recoilAt(u: number): number {
  if (u <= 1 || u > 3) return 0;
  return Math.exp(-2.1 * (u - 1));
}

export function settleCurve(age: number): number {
  if (age < 0 || age > SETTLE_TICKS) return 0;
  const k = age / SETTLE_TICKS;
  return Math.exp(-5 * k) * Math.cos(k * 13);
}

const MOVE_KINDS = new Set(['move']);
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

export interface TickIndex {
  ticks: number[];
}

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
  readonly terrainTicks: TickIndex = { ticks: [] };
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
