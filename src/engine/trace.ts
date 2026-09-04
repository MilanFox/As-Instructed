import type { Bot, Dir, ItemKind, Machine, Tile, Vec, World } from './types.ts';
import {
  addGroundItems,
  addToInventory,
  botById,
  cloneBot,
  cloneTile,
  cloneWorld,
  enqueueMessage,
  machineById,
  makespan,
  removeFromInventory,
  removeGroundItems,
  reviveWorld,
  setTile,
  tileAt,
} from './world.ts';

/** DESIGN.md §4.5. A keyframe is written every this many ticks. */
export const KEYFRAME_INTERVAL = 500;

/**
 * How many distinct `sense` events a trace stores before it stops keeping them individually.
 *
 * Sensing is free in ticks, so a tight loop can issue millions of reads without ever advancing
 * the clock. Beyond this many stored reads the builder keeps one running aggregate per sense
 * name instead: the *counts* stay exact, only the per-read `detail` is dropped.
 */
export const MAX_SENSE_EVENTS = 20_000;

interface AtTick {
  t: number;
}

/**
 * Bot-scoped events carry `dt`, the tick cost charged to that bot. Replay uses it to restore
 * `bot.clock` exactly, which is what makes `replayTo` round-trip against a live Sim run.
 */
interface BotAction extends AtTick {
  botId: number;
  dt: number;
}

export type MoveEvent = BotAction & {
  kind: 'move';
  from: Vec;
  to: Vec;
  dir: Dir;
  ok: boolean;
  /** Why a failed move failed: 'bounds' | 'terrain' | 'bot' | 'dead'. */
  reason?: string;
};

export type TurnEvent = BotAction & { kind: 'turn'; facing: Dir };
export type WaitEvent = BotAction & { kind: 'wait'; ticks: number };
export type SyncEvent = BotAction & { kind: 'sync'; to: number };

/**
 * Payload shared by every event that moves a quantity of one item kind somewhere.
 *
 * Each `kind` gets its own member of the union rather than one member with a `kind` union, so
 * that `Extract<TraceEvent, { kind: 'mine' }>` resolves to the event instead of `never`.
 */
interface ItemTransfer extends BotAction {
  at: Vec;
  /** null only when the action failed because there was nothing to transfer. */
  item: ItemKind | null;
  count: number;
  ok: boolean;
}

export type HarvestEvent = ItemTransfer & { kind: 'harvest' };
export type MineEvent = ItemTransfer & { kind: 'mine' };
/** `harvest` and `mine` credit the bot's inventory. The tile edit rides on a separate tileChange. */
export type GatherEvent = HarvestEvent | MineEvent;

export type PlantEvent = BotAction & { kind: 'plant'; at: Vec; item: ItemKind; ok: boolean };

export type PickupEvent = ItemTransfer & { kind: 'pickup' };
export type DropEvent = ItemTransfer & { kind: 'drop' };
/** `pickup` moves ground -> inventory, `drop` moves inventory -> ground. */
export type TransferEvent = PickupEvent | DropEvent;

/**
 * Generic bot action, for world-specific commands added later (World 5's `link`, World 6's
 * `transmit`). Carries `dt` so replay restores the clock; any world change rides along on a
 * separate tileChange / machineChange event.
 */
export type ActEvent = BotAction & {
  kind: 'act';
  name: string;
  at?: Vec;
  ok: boolean;
  detail?: string | number;
};

/**
 * A read of the world. Sensing costs 0 ticks (DESIGN.md §4.4) but is *observable*: it counts one
 * op and leaves this behind, so a level can budget information the way it budgets time.
 *
 * `count` is how many identical consecutive reads this one event stands for — a loop that probes
 * the same machine a hundred thousand times collapses to a single event with `count: 100000`
 * rather than a hundred thousand objects. Summing `count` per `name` is always exact.
 */
export type SenseEvent = BotAction & {
  kind: 'sense';
  name: string;
  /** Whether the read found anything: a machine for `probe`, a mark for `readMark`, and so on. */
  ok: boolean;
  /** What came back, kept small and flat: a `"x,y"`, a direction name, a count, an id. */
  detail?: string | number;
  /** Always >= 1. */
  count: number;
};

export type UseEvent = BotAction & {
  kind: 'use';
  at: Vec;
  machineId: string | null;
  ok: boolean;
};

export type MarkEvent = BotAction & { kind: 'mark'; at: Vec; text: string | null };
/** `to` is the resulting fuel level, so replay never has to know `fuelMax`. */
export type RefuelEvent = BotAction & { kind: 'refuel'; at: Vec; ok: boolean; to: number };
/** Generic resource accounting. Feeds `Verdict.stats.spend`. DESIGN.md §11 A5. */
export type SpendEvent = AtTick & {
  kind: 'spend';
  resource: string;
  amount: number;
  botId?: number;
};
/**
 * Only a successful spawn produces one — there is no `bot` to describe otherwise, so a refused
 * spawn is reported as an `act` named 'spawn' with `ok: false`.
 */
export type SpawnEvent = BotAction & { kind: 'spawn'; bot: Bot };
export type DieEvent = BotAction & { kind: 'die'; at: Vec; reason: string };
/** `ok` is false when `to` names no bot, or a dead one. The message is then never delivered. */
export type SendEvent = BotAction & {
  kind: 'send';
  to: number;
  body: string | number;
  ok: boolean;
};
export type RecvEvent = BotAction & {
  kind: 'recv';
  from: number | null;
  body: string | number | null;
};

export type PrintEvent = AtTick & { kind: 'print'; text: string; line?: number; botId?: number };
export type TileChangeEvent = AtTick & { kind: 'tileChange'; at: Vec; before: Tile; after: Tile };
export type MachineChangeEvent = AtTick & {
  kind: 'machineChange';
  id: string;
  before: Machine;
  after: Machine;
};
export type ObjectiveEvent = AtTick & { kind: 'objective'; id: string; state: 'met' | 'lost' };
export type FxEvent = AtTick & { kind: 'fx'; at: Vec; fx: string; botId?: number };

export type TraceEvent =
  | MoveEvent
  | TurnEvent
  | WaitEvent
  | SyncEvent
  | GatherEvent
  | PlantEvent
  | TransferEvent
  | ActEvent
  | SenseEvent
  | UseEvent
  | MarkEvent
  | RefuelEvent
  | SpendEvent
  | SpawnEvent
  | DieEvent
  | SendEvent
  | RecvEvent
  | PrintEvent
  | TileChangeEvent
  | MachineChangeEvent
  | ObjectiveEvent
  | FxEvent;

export type TraceEventKind = TraceEvent['kind'];

/**
 * Event kinds that burn fuel equal to their `dt`. Single source of truth: `Sim.charge` and
 * `applyEvent` both consult it, so a live run and its replay can never disagree about fuel.
 *
 * Idling (`wait`, `sync`), sensing (`recv`) and `refuel` itself are deliberately free.
 */
export const FUEL_BURNING: ReadonlySet<TraceEventKind> = new Set<TraceEventKind>([
  'move',
  'turn',
  'harvest',
  'mine',
  'plant',
  'pickup',
  'drop',
  'use',
  'mark',
  'send',
  'spawn',
  'act',
]);

export interface Keyframe {
  /** State here is "every event with `e.t < t` applied". */
  t: number;
  world: World;
  /** Index into `Trace.events` of the first event NOT yet applied. */
  eventIndex: number;
}

export interface Trace {
  /** Deep snapshot for replay from t=0. */
  initialWorld: World;
  /** Sorted by `t`, stable within a tick (issue order preserved). */
  events: TraceEvent[];
  keyframes: Keyframe[];
  endTick: number;
}

function isBotAction(event: TraceEvent): event is TraceEvent & BotAction {
  return 'botId' in event && 'dt' in event;
}

/**
 * Applies one event to `world` in place. Every event carries absolute after-state (or an exact
 * delta), so events from different bots may be applied in pure `t` order without divergence.
 */
export function applyEvent(world: World, event: TraceEvent): void {
  switch (event.kind) {
    case 'move': {
      const bot = botById(world, event.botId);
      if (!bot) break;
      bot.facing = event.dir;
      if (event.ok) {
        const fromTile = tileAt(world, event.from);
        if (fromTile?.occupant === bot.id) delete fromTile.occupant;
        bot.at = { x: event.to.x, y: event.to.y };
        const toTile = tileAt(world, event.to);
        if (toTile) toTile.occupant = bot.id;
      }
      break;
    }
    case 'turn': {
      const bot = botById(world, event.botId);
      if (bot) bot.facing = event.facing;
      break;
    }
    case 'wait':
    case 'sync':
      break;
    case 'harvest':
    case 'mine': {
      const bot = botById(world, event.botId);
      if (bot && event.ok && event.item) addToInventory(bot, event.item, event.count);
      break;
    }
    case 'plant': {
      const bot = botById(world, event.botId);
      if (bot && event.ok) removeFromInventory(bot, event.item, 1);
      break;
    }
    case 'pickup': {
      const bot = botById(world, event.botId);
      if (bot && event.ok && event.item) {
        removeGroundItems(world, event.at, event.item, event.count);
        addToInventory(bot, event.item, event.count);
      }
      break;
    }
    case 'drop': {
      const bot = botById(world, event.botId);
      if (bot && event.ok && event.item) {
        removeFromInventory(bot, event.item, event.count);
        addGroundItems(world, event.at, event.item, event.count);
      }
      break;
    }
    case 'use':
    case 'act':
    case 'sense':
      break;
    case 'mark': {
      const tile = tileAt(world, event.at);
      if (tile) {
        if (event.text === null) delete tile.mark;
        else tile.mark = event.text;
      }
      break;
    }
    case 'spawn': {
      if (botById(world, event.bot.id)) break;
      const spawned = cloneBot(event.bot);
      world.bots.push(spawned);
      const tile = tileAt(world, spawned.at);
      if (tile) tile.occupant = spawned.id;
      break;
    }
    case 'die': {
      const bot = botById(world, event.botId);
      if (!bot) break;
      bot.alive = false;
      const tile = tileAt(world, bot.at);
      if (tile?.occupant === bot.id) delete tile.occupant;
      break;
    }
    case 'send': {
      if (!event.ok) break;
      const target = botById(world, event.to);
      if (target) enqueueMessage(target, { from: event.botId, body: event.body, t: event.t });
      break;
    }
    case 'recv': {
      const bot = botById(world, event.botId);
      if (bot && event.from !== null) bot.inbox.shift();
      break;
    }
    case 'tileChange':
      setTile(world, event.at, cloneTile(event.after));
      break;
    case 'machineChange': {
      const machine = machineById(world, event.id);
      if (!machine) break;
      const next = event.after;
      machine.state = next.state;
      machine.inventory = next.inventory.map((s) => ({ kind: s.kind, count: s.count }));
      machine.vars = { ...next.vars };
      if (next.facing !== undefined) machine.facing = next.facing;
      break;
    }
    case 'refuel': {
      const bot = botById(world, event.botId);
      if (bot && event.ok) bot.fuel = event.to;
      break;
    }
    case 'objective':
    case 'fx':
    case 'print':
    case 'spend':
      break;
  }

  if (isBotAction(event)) {
    const bot = botById(world, event.botId);
    if (bot) {
      bot.clock = Math.max(bot.clock, event.t + event.dt);
      if (FUEL_BURNING.has(event.kind)) bot.fuel -= event.dt;
    }
  }
  world.tick = makespan(world);
}

/**
 * Keyframes are produced by replaying the finished event list, never by snapshotting the live
 * world. With per-bot virtual clocks the live world is not "the world at tick T" — bot A may be
 * at t=900 while bot B is still at t=100 — so a live snapshot would not match a replay.
 */
function buildKeyframes(
  initialWorld: World,
  events: readonly TraceEvent[],
  interval: number,
): Keyframe[] {
  const keyframes: Keyframe[] = [];
  const world = cloneWorld(initialWorld);
  let boundary = interval;
  let i = 0;
  let lastIndex = 0;

  while (i < events.length) {
    const event = events[i] as TraceEvent;
    if (event.t >= boundary) {
      if (i > lastIndex) {
        keyframes.push({ t: boundary, world: cloneWorld(world), eventIndex: i });
        lastIndex = i;
      }
      boundary += interval;
      continue;
    }
    applyEvent(world, event);
    i++;
  }
  return keyframes;
}

export class TraceBuilder {
  readonly initialWorld: World;
  readonly events: TraceEvent[] = [];

  private readonly maxSenseEvents: number;
  private senseEventCount = 0;
  /** One running aggregate per sense name, used once `maxSenseEvents` individual reads are stored. */
  private readonly senseOverflow = new Map<string, SenseEvent>();

  constructor(initialWorld: World, maxSenseEvents: number = MAX_SENSE_EVENTS) {
    this.initialWorld = cloneWorld(initialWorld);
    this.maxSenseEvents = maxSenseEvents;
  }

  push(event: TraceEvent): void {
    this.events.push(event);
  }

  /**
   * Appends a sensing read, folding it away wherever that costs no accuracy.
   *
   * Two levels of folding, in order: an identical read issued back-to-back bumps the previous
   * event's `count`; past `maxSenseEvents` distinct stored reads, everything else collapses into
   * one running aggregate per sense name. Either way the summed `count` per name is exact — only
   * the per-read `detail` and interleaving are lossy, and only on traces nobody could read anyway.
   */
  pushSense(event: SenseEvent): void {
    const last = this.events[this.events.length - 1];
    if (
      last !== undefined &&
      last.kind === 'sense' &&
      last.t === event.t &&
      last.botId === event.botId &&
      last.name === event.name &&
      last.ok === event.ok &&
      last.detail === event.detail
    ) {
      last.count += event.count;
      return;
    }

    if (this.senseEventCount >= this.maxSenseEvents) {
      const running = this.senseOverflow.get(event.name);
      if (running) {
        running.count += event.count;
        return;
      }
      const aggregate: SenseEvent = {
        t: event.t,
        botId: event.botId,
        dt: 0,
        kind: 'sense',
        name: event.name,
        ok: event.ok,
        count: event.count,
      };
      this.senseOverflow.set(event.name, aggregate);
      this.events.push(aggregate);
      return;
    }

    this.events.push(event);
    this.senseEventCount += 1;
  }

  get length(): number {
    return this.events.length;
  }

  /** Finalizes into an immutable-by-convention Trace. Sorting is stable, so ties keep issue order. */
  build(endTick: number, keyframeInterval: number = KEYFRAME_INTERVAL): Trace {
    const events = this.events.slice().sort((a, b) => a.t - b.t);
    return {
      initialWorld: cloneWorld(this.initialWorld),
      events,
      keyframes: buildKeyframes(this.initialWorld, events, keyframeInterval),
      endTick,
    };
  }
}

/**
 * The world as of `tick`: every event with `e.t <= tick` applied, starting from the nearest
 * keyframe. Guaranteed identical to replaying from `initialWorld` with no keyframes at all.
 *
 * `world.tick` on the result is `max(bot.clock)`, which may lag `tick` when no bot has acted yet.
 */
export function replayTo(trace: Trace, tick: number): World {
  let start = trace.initialWorld;
  let index = 0;
  for (const keyframe of trace.keyframes) {
    if (keyframe.t > tick) break;
    start = keyframe.world;
    index = keyframe.eventIndex;
  }

  const world = cloneWorld(start);
  for (let i = index; i < trace.events.length; i++) {
    const event = trace.events[i] as TraceEvent;
    if (event.t > tick) break;
    applyEvent(world, event);
  }
  return world;
}

/**
 * Heals a Trace that arrived from the worker over `postMessage`. See `reviveWorld` — every World
 * inside the trace (initial plus keyframes) needs its Rng prototype back. Idempotent.
 */
export function reviveTrace(trace: Trace): Trace {
  reviveWorld(trace.initialWorld);
  for (const keyframe of trace.keyframes) reviveWorld(keyframe.world);
  return trace;
}

/**
 * How many times each sensing command ran, keyed by command name. Exact even when the trace
 * folded reads away, because every `sense` event carries the `count` it stands for.
 */
export function senseTotals(trace: Trace): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const event of trace.events) {
    if (event.kind !== 'sense') continue;
    totals[event.name] = (totals[event.name] ?? 0) + event.count;
  }
  return totals;
}

/** All print output up to `tick`, in order. Convenience for the console panel. */
export function printsUpTo(trace: Trace, tick: number = Number.POSITIVE_INFINITY): PrintEvent[] {
  return trace.events.filter((e): e is PrintEvent => e.kind === 'print' && e.t <= tick);
}

/** Index of the first event at or after `tick`. Useful for stepping the renderer forward. */
export function eventIndexAt(trace: Trace, tick: number): number {
  let low = 0;
  let high = trace.events.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if ((trace.events[mid] as TraceEvent).t < tick) low = mid + 1;
    else high = mid;
  }
  return low;
}
