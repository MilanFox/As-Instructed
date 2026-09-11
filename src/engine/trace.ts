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

export const KEYFRAME_INTERVAL = 500;

export const MAX_SENSE_EVENTS = 20_000;

interface AtTick {
  t: number;
}

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
  reason?: string;
};

export type TurnEvent = BotAction & { kind: 'turn'; facing: Dir };
export type WaitEvent = BotAction & { kind: 'wait'; ticks: number };
export type SyncEvent = BotAction & { kind: 'sync'; to: number };

interface ItemTransfer extends BotAction {
  at: Vec;
  item: ItemKind | null;
  count: number;
  ok: boolean;
  reason?: string;
}

export type HarvestEvent = ItemTransfer & { kind: 'harvest' };
export type MineEvent = ItemTransfer & { kind: 'mine' };
export type GatherEvent = HarvestEvent | MineEvent;

export type PlantEvent = BotAction & {
  kind: 'plant';
  at: Vec;
  item: ItemKind;
  ok: boolean;
  reason?: string;
};

export type PickupEvent = ItemTransfer & {
  kind: 'pickup';
  reason?: string;
};
export type DropEvent = ItemTransfer & {
  kind: 'drop';
  reason?: string;
};
export type TransferEvent = PickupEvent | DropEvent;

export type ActEvent = BotAction & {
  kind: 'act';
  name: string;
  at?: Vec;
  ok: boolean;
  detail?: string | number;
};

export type SenseEvent = BotAction & {
  kind: 'sense';
  name: string;
  ok: boolean;
  detail?: string | number;
  count: number;
};

export type UseEvent = BotAction & {
  kind: 'use';
  at: Vec;
  machineId: string | null;
  ok: boolean;
};

export type MarkEvent = BotAction & { kind: 'mark'; at: Vec; text: string | null };
export type RefuelEvent = BotAction & { kind: 'refuel'; at: Vec; ok: boolean; to: number };
export type SpendEvent = AtTick & {
  kind: 'spend';
  resource: string;
  amount: number;
  botId?: number;
};
export type SpawnEvent = BotAction & { kind: 'spawn'; bot: Bot };
export type DieEvent = BotAction & { kind: 'die'; at: Vec; reason: string };
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
  t: number;
  world: World;
  eventIndex: number;
}

export interface Trace {
  initialWorld: World;
  events: TraceEvent[];
  keyframes: Keyframe[];
  endTick: number;
}

function isBotAction(event: TraceEvent): event is TraceEvent & BotAction {
  return 'botId' in event && 'dt' in event;
}

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
  private readonly senseOverflow = new Map<string, SenseEvent>();

  constructor(initialWorld: World, maxSenseEvents: number = MAX_SENSE_EVENTS) {
    this.initialWorld = cloneWorld(initialWorld);
    this.maxSenseEvents = maxSenseEvents;
  }

  push(event: TraceEvent): void {
    this.events.push(event);
  }

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

export function reviveTrace(trace: Trace): Trace {
  reviveWorld(trace.initialWorld);
  for (const keyframe of trace.keyframes) reviveWorld(keyframe.world);
  return trace;
}

export function senseTotals(trace: Trace): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const event of trace.events) {
    if (event.kind !== 'sense') continue;
    totals[event.name] = (totals[event.name] ?? 0) + event.count;
  }
  return totals;
}

export function printsUpTo(trace: Trace, tick: number = Number.POSITIVE_INFINITY): PrintEvent[] {
  return trace.events.filter((e): e is PrintEvent => e.kind === 'print' && e.t <= tick);
}

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
