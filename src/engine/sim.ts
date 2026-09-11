import type { CostOverrides, CostTable } from './costs.ts';
import { resolveCosts } from './costs.ts';
import {
  HaltError,
  IllegalActionError,
  LivelockError,
  OpLimitError,
  OutOfFuelError,
} from './errors.ts';
import type { SenseEvent, Trace } from './trace.ts';
import { KEYFRAME_INTERVAL, MAX_SENSE_EVENTS, TraceBuilder } from './trace.ts';
import type { Bot, Dir, ItemKind, ItemStack, Machine, Message, Tile, Vec, World } from './types.ts';
import { FED_BY, MANUAL_ONLY, Terrain } from './types.ts';
import {
  addGroundItems,
  addToInventory,
  botById,
  cloneBot,
  cloneMachine,
  cloneTile,
  cloneWorld,
  dirName,
  enqueueMessage,
  indexOf,
  inBounds,
  inventoryCount,
  itemsAt,
  machineAt,
  machineById,
  removeFromInventory,
  removeGroundItems,
  step,
  terrainProps,
  tileAt,
} from './world.ts';

export const DEFAULT_MAX_TICKS = 20_000;
export const DEFAULT_MAX_OPS = 2_000_000;
export const DEFAULT_GROW_TIME = 8;

export const DEFAULT_LIVELOCK_ROUNDS = 8;

export interface SimOptions {
  maxTicks?: number;
  maxOps?: number;
  costs?: CostOverrides;
  keyframeInterval?: number;
  livelockRounds?: number;
  maxSenseEvents?: number;
}

export interface TileView {
  at: Vec;
  inBounds: boolean;
  terrain: Terrain;
  walkable: boolean;
  lethal: boolean;
  growth: number;
  maxGrowth: number;
  sproutsIn: number;
  crop: ItemKind | null;
  items: ItemStack[];
  botId: number | null;
  machineId: string | null;
  mark: string | null;
}

export interface MachineView {
  id: string;
  kind: string;
  at: Vec;
  state: string;
  vars: Record<string, number>;
  inventory: ItemStack[];
  links: Vec[];
}

const OUT_OF_BOUNDS_TERRAIN = Terrain.Void;

interface Occupancy {
  botId: number;
  from: number;
  to: number;
}

export function maturity(tile: Tile, t: number): number {
  const max = tile.maxGrowth ?? 0;
  const plantedAt = tile.meta?.['plantedAt'];
  if (typeof plantedAt === 'number') {
    return Math.max(0, Math.min(max, t - plantedAt));
  }
  return tile.growth ?? 0;
}

export function sproutsIn(tile: Tile, t: number): number {
  const plantedAt = tile.meta?.['plantedAt'];
  if (typeof plantedAt !== 'number') return 0;
  return Math.max(0, plantedAt - t);
}

const PLANT_YIELD: Partial<Record<ItemKind, ItemKind>> = { seed: 'crop' };

export class Sim {
  readonly world: World;
  readonly costs: CostTable;
  readonly maxTicks: number;
  readonly maxOps: number;

  private readonly builder: TraceBuilder;
  private readonly keyframeInterval: number;
  private readonly occupancy = new Map<number, Occupancy[]>();
  private readonly spendLedger = new Map<string, number>();
  private readonly senseLedger = new Map<string, number>();
  private readonly livelockRounds: number;
  private readonly blockedSince = new Set<number>();
  private blockedStreak = 0;
  private opCount = 0;
  private peakClock = 0;

  constructor(world: World, options: SimOptions = {}) {
    this.world = world;
    this.costs = resolveCosts(options.costs);
    this.maxTicks = options.maxTicks ?? DEFAULT_MAX_TICKS;
    this.maxOps = options.maxOps ?? DEFAULT_MAX_OPS;
    this.keyframeInterval = options.keyframeInterval ?? KEYFRAME_INTERVAL;
    this.livelockRounds = options.livelockRounds ?? DEFAULT_LIVELOCK_ROUNDS;
    this.builder = new TraceBuilder(world, options.maxSenseEvents ?? MAX_SENSE_EVENTS);

    for (const bot of world.bots) {
      if (!bot.alive) continue;
      if (bot.clock > this.peakClock) this.peakClock = bot.clock;
      this.reserve(bot.at, bot.id, bot.clock);
    }
    world.tick = this.peakClock;
  }

  get ops(): number {
    return this.opCount;
  }

  get ticks(): number {
    return this.peakClock;
  }

  botIds(): number[] {
    this.op();
    return this.world.bots.filter((b) => b.alive).map((b) => b.id);
  }

  finish(): Trace {
    return this.builder.build(this.peakClock, this.keyframeInterval);
  }

  noteObjective(id: string, state: 'met' | 'lost'): void {
    this.builder.push({ t: this.peakClock, kind: 'objective', id, state });
  }

  pos(botId: number): Vec {
    const bot = this.requireBot(botId);
    this.sense(bot, 'pos', true, `${bot.at.x},${bot.at.y}`);
    return { x: bot.at.x, y: bot.at.y };
  }

  facing(botId: number): Dir {
    const bot = this.requireBot(botId);
    this.sense(bot, 'facing', true, dirName(bot.facing));
    return bot.facing;
  }

  clock(botId: number): number {
    const bot = this.requireBot(botId);
    this.sense(bot, 'clock', true, bot.clock);
    return bot.clock;
  }

  canMove(botId: number, dir: Dir): boolean {
    const bot = this.requireBot(botId);
    const free = this.blockReason(bot, step(bot.at, dir), bot.clock + this.costs.move) === null;
    this.sense(bot, 'canMove', free, dirName(dir));
    return free;
  }

  scan(botId: number, dir?: Dir): TileView {
    const bot = this.requireBot(botId);
    const at = dir === undefined ? bot.at : step(bot.at, dir);
    const view = this.view(at, bot.clock);
    this.sense(bot, 'scan', view.inBounds, `${at.x},${at.y}`);
    return view;
  }

  look(botId: number, dir: Dir, range = 8): TileView[] {
    const bot = this.requireBot(botId);
    const out: TileView[] = [];
    let at = bot.at;
    for (let i = 0; i < range; i++) {
      at = step(at, dir);
      const view = this.view(at, bot.clock);
      out.push(view);
      if (!view.inBounds) break;
      const tile = tileAt(this.world, at);
      if (tile && terrainProps(tile.terrain).opaque) break;
    }
    this.sense(bot, 'look', out.length > 0, `${dirName(dir)}:${out.length}`);
    return out;
  }

  inventory(botId: number, kind?: ItemKind): number {
    const bot = this.requireBot(botId);
    const held = inventoryCount(bot, kind);
    this.sense(bot, 'inventory', held > 0, kind ?? '*');
    return held;
  }

  carrying(botId: number): ItemKind[] {
    const bot = this.requireBot(botId);
    const kinds = bot.inventory.filter((s) => s.count > 0).map((s) => s.kind);
    this.sense(bot, 'carrying', kinds.length > 0, kinds.length);
    return kinds;
  }

  capacity(botId: number): number {
    const bot = this.requireBot(botId);
    this.sense(bot, 'capacity', true, bot.capacity);
    return bot.capacity;
  }

  fuel(botId: number): number {
    const bot = this.requireBot(botId);
    this.sense(bot, 'fuel', Number.isFinite(bot.fuel), finiteDetail(bot.fuel));
    return bot.fuel;
  }

  fuelMax(botId: number): number {
    const bot = this.requireBot(botId);
    this.sense(bot, 'fuelMax', Number.isFinite(bot.fuelMax), finiteDetail(bot.fuelMax));
    return bot.fuelMax;
  }

  spendTotals(): Record<string, number> {
    return Object.fromEntries(this.spendLedger);
  }

  senseTotals(): Record<string, number> {
    return Object.fromEntries(this.senseLedger);
  }

  readMark(botId: number): string | null {
    const bot = this.requireBot(botId);
    const mark = tileAt(this.world, bot.at)?.mark ?? null;
    this.sense(bot, 'readMark', mark !== null, mark === null ? undefined : clip(mark));
    return mark;
  }

  probe(botId: number, machineId?: string): MachineView | null {
    const bot = this.requireBot(botId);
    const machine =
      machineId === undefined ? this.machineNear(bot) : machineById(this.world, machineId);
    this.sense(bot, 'probe', machine !== undefined, machine?.id ?? machineId);
    if (!machine) return null;
    return {
      id: machine.id,
      kind: machine.kind,
      at: { x: machine.at.x, y: machine.at.y },
      state: machine.state,
      vars: { ...machine.vars },
      inventory: machine.inventory.map((s) => ({ kind: s.kind, count: s.count })),
      links: (machine.links ?? []).map((at) => ({ x: at.x, y: at.y })),
    };
  }

  move(botId: number, dir: Dir): boolean {
    const bot = this.requireActiveBot(botId);
    const t = bot.clock;
    const from = { x: bot.at.x, y: bot.at.y };
    const to = step(from, dir);
    const reason = this.blockReason(bot, to, t + this.costs.move);
    const dt = reason === null ? this.costs.move : this.costs.moveBlocked;
    this.requireFuel(bot, dt, 'move');
    bot.facing = dir;

    if (reason !== null) {
      this.builder.push({ t, botId, dt, kind: 'move', from, to, dir, ok: false, reason });
      this.charge(bot, dt);
      this.noteMoveOutcome(bot, true);
      return false;
    }
    this.release(from, botId, t + dt);
    const fromTile = tileAt(this.world, from);
    if (fromTile?.occupant === botId) delete fromTile.occupant;
    bot.at = to;
    const toTile = tileAt(this.world, to);
    if (toTile) toTile.occupant = botId;
    this.reserve(to, botId, t + dt);

    this.builder.push({ t, botId, dt, kind: 'move', from, to, dir, ok: true });
    this.charge(bot, dt);
    this.noteMoveOutcome(bot, false);

    if (toTile && terrainProps(toTile.terrain).lethal) {
      this.kill(bot, `stepped into ${toTile.terrain}`);
    }
    return true;
  }

  turn(botId: number, dir: Dir): void {
    const bot = this.requireActiveBot(botId);
    const t = bot.clock;
    const dt = this.costs.turn;
    this.requireFuel(bot, dt, 'turn');
    bot.facing = dir;
    this.builder.push({ t, botId, dt, kind: 'turn', facing: dir });
    this.charge(bot, dt);
  }

  wait(botId: number, n = 1): void {
    const bot = this.requireActiveBot(botId);
    if (!Number.isFinite(n) || n < 0) {
      throw new IllegalActionError(
        `wait(${String(n)}): the argument must be a non-negative number.`,
        {
          botId,
        },
      );
    }
    const ticks = Math.floor(n);
    const t = bot.clock;
    const dt = ticks * this.costs.wait;
    this.builder.push({ t, botId, dt, kind: 'wait', ticks });
    this.chargeIdle(bot, dt);
  }

  harvest(botId: number): ItemKind | null {
    const bot = this.requireActiveBot(botId);
    const t = bot.clock;
    const dt = this.costs.harvest;
    this.requireFuel(bot, dt, 'harvest');
    const at = { x: bot.at.x, y: bot.at.y };
    const tile = tileAt(this.world, at);

    const ready =
      tile !== undefined &&
      tile.crop !== undefined &&
      tile.maxGrowth !== undefined &&
      maturity(tile, t) >= tile.maxGrowth;
    const roomLeft = bot.capacity - inventoryCount(bot);

    if (!ready || roomLeft <= 0 || !tile) {
      const reason = roomLeft <= 0 ? 'full' : undefined;
      this.builder.push({
        t,
        botId,
        dt,
        kind: 'harvest',
        at,
        item: null,
        count: 0,
        ok: false,
        reason,
      });
      this.charge(bot, dt);
      return null;
    }

    const item = tile.crop as ItemKind;
    const before = cloneTile(tile);
    delete tile.crop;
    delete tile.maxGrowth;
    tile.growth = 0;
    if (tile.meta) delete tile.meta['plantedAt'];
    addToInventory(bot, item, 1);

    this.builder.push({ t, botId, dt, kind: 'harvest', at, item, count: 1, ok: true });
    this.builder.push({ t, kind: 'tileChange', at, before, after: cloneTile(tile) });
    this.builder.push({ t, kind: 'fx', at, fx: 'harvest', botId });
    this.charge(bot, dt);
    return item;
  }

  plant(botId: number, kind: ItemKind = 'seed', growTime = DEFAULT_GROW_TIME): boolean {
    const bot = this.requireActiveBot(botId);
    const t = bot.clock;
    const dt = this.costs.plant;
    this.requireFuel(bot, dt, 'plant');
    const at = { x: bot.at.x, y: bot.at.y };
    const tile = tileAt(this.world, at);
    const reason = plantBlockReason(tile, inventoryCount(bot, kind));

    if (reason !== null || !tile) {
      const why = reason ?? 'terrain';
      this.builder.push({ t, botId, dt, kind: 'plant', at, item: kind, ok: false, reason: why });
      this.charge(bot, dt);
      return false;
    }

    const before = cloneTile(tile);
    removeFromInventory(bot, kind, 1);
    tile.crop = PLANT_YIELD[kind] ?? kind;
    tile.growth = 0;
    tile.maxGrowth = growTime;
    tile.meta = { ...(tile.meta ?? {}), plantedAt: t + dt };

    this.builder.push({ t, botId, dt, kind: 'plant', at, item: kind, ok: true });
    this.builder.push({ t, kind: 'tileChange', at, before, after: cloneTile(tile) });
    this.builder.push({ t, kind: 'fx', at, fx: 'plant', botId });
    this.charge(bot, dt);
    return true;
  }

  mine(botId: number, dir?: Dir): ItemKind | null {
    const bot = this.requireActiveBot(botId);
    const t = bot.clock;
    const dt = this.costs.mine;
    this.requireFuel(bot, dt, 'mine');
    const at = dir === undefined ? { x: bot.at.x, y: bot.at.y } : step(bot.at, dir);
    const tile = tileAt(this.world, at);
    const props = tile ? terrainProps(tile.terrain) : null;
    const roomLeft = bot.capacity - inventoryCount(bot);

    if (!tile || !props?.mineable || roomLeft <= 0) {
      this.builder.push({ t, botId, dt, kind: 'mine', at, item: null, count: 0, ok: false });
      this.charge(bot, dt);
      return null;
    }

    const before = cloneTile(tile);
    const item = props.yields;
    tile.terrain = props.minesTo;
    if (item) addToInventory(bot, item, 1);

    this.builder.push({ t, botId, dt, kind: 'mine', at, item, count: item ? 1 : 0, ok: true });
    this.builder.push({ t, kind: 'tileChange', at, before, after: cloneTile(tile) });
    this.builder.push({ t, kind: 'fx', at, fx: 'mine', botId });
    this.charge(bot, dt);
    return item;
  }

  pickup(botId: number, kind?: ItemKind, count = 1): number {
    const bot = this.requireActiveBot(botId);
    if (!Number.isFinite(count) || count < 0) {
      throw new IllegalActionError(`pickup(count = ${String(count)}): count must be >= 0.`, {
        botId,
      });
    }
    const t = bot.clock;
    const dt = this.costs.pickup;
    this.requireFuel(bot, dt, 'pickup');
    const at = { x: bot.at.x, y: bot.at.y };
    const available = itemsAt(this.world, at);
    const target = kind ?? available[0]?.kind;
    const roomLeft = bot.capacity - inventoryCount(bot);
    const onGround = target
      ? available.reduce((s, x) => (x.kind === target ? s + x.count : s), 0)
      : 0;
    const taken = target ? Math.min(Math.floor(count), onGround, Math.max(0, roomLeft)) : 0;

    if (!target || taken <= 0) {
      this.builder.push({
        t,
        botId,
        dt,
        kind: 'pickup',
        at,
        item: target ?? null,
        count: 0,
        ok: false,
        reason: pickupBlockReason(Math.floor(count), available.length > 0, onGround),
      });
      this.charge(bot, dt);
      return 0;
    }

    removeGroundItems(this.world, at, target, taken);
    addToInventory(bot, target, taken);
    this.builder.push({ t, botId, dt, kind: 'pickup', at, item: target, count: taken, ok: true });
    this.builder.push({ t, kind: 'fx', at, fx: 'pickup', botId });
    this.charge(bot, dt);
    return taken;
  }

  drop(botId: number, kind?: ItemKind, count = 1): number {
    const bot = this.requireActiveBot(botId);
    if (!Number.isFinite(count) || count < 0) {
      throw new IllegalActionError(`drop(count = ${String(count)}): count must be >= 0.`, {
        botId,
      });
    }
    const t = bot.clock;
    const dt = this.costs.drop;
    this.requireFuel(bot, dt, 'drop');
    const at = { x: bot.at.x, y: bot.at.y };
    const target = kind ?? bot.inventory.find((s) => s.count > 0)?.kind;
    const held = target ? inventoryCount(bot, target) : 0;
    const given = target ? Math.min(Math.floor(count), held) : 0;

    if (!target || given <= 0) {
      this.builder.push({
        t,
        botId,
        dt,
        kind: 'drop',
        at,
        item: target ?? null,
        count: 0,
        ok: false,
        reason: dropBlockReason(Math.floor(count), inventoryCount(bot)),
      });
      this.charge(bot, dt);
      return 0;
    }

    removeFromInventory(bot, target, given);
    addGroundItems(this.world, at, target, given);
    this.builder.push({ t, botId, dt, kind: 'drop', at, item: target, count: given, ok: true });
    this.builder.push({ t, kind: 'fx', at, fx: 'drop', botId });
    this.charge(bot, dt);
    return given;
  }

  use(botId: number, dir?: Dir): boolean {
    const bot = this.requireActiveBot(botId);
    const t = bot.clock;
    const dt = this.costs.use;
    this.requireFuel(bot, dt, 'use');
    const at = dir === undefined ? { x: bot.at.x, y: bot.at.y } : step(bot.at, dir);
    const machine = machineAt(this.world, at);
    const cycle = machine?.cycle;

    if (!machine || !cycle || cycle.length === 0 || this.unfed(machine)) {
      this.builder.push({
        t,
        botId,
        dt,
        kind: 'use',
        at,
        machineId: machine?.id ?? null,
        ok: false,
      });
      this.charge(bot, dt);
      return false;
    }

    this.builder.push({ t, botId, dt, kind: 'use', at, machineId: machine.id, ok: true });
    this.mutate(machine, t, (m) => {
      const i = cycle.indexOf(m.state);
      m.state = cycle[(i + 1) % cycle.length] as string;
    });
    this.builder.push({ t, kind: 'fx', at, fx: 'use', botId });
    this.charge(bot, dt);
    return true;
  }

  private unfed(machine: Machine): boolean {
    for (const [name, value] of Object.entries(machine.vars)) {
      if (value !== 1 || !name.startsWith(FED_BY)) continue;
      if (machineById(this.world, name.slice(FED_BY.length))?.state !== 'on') return true;
    }
    return false;
  }

  power(botId: number, machineId: string, state: string): boolean {
    const bot = this.requireActiveBot(botId);
    const t = bot.clock;
    const dt = this.costs.power;
    this.requireFuel(bot, dt, 'power');
    const machine = machineById(this.world, machineId);
    if (!machine) {
      this.builder.push({ t, botId, dt, kind: 'act', name: 'power', ok: false, detail: machineId });
      this.charge(bot, dt);
      throw new IllegalActionError(
        `power("${machineId}"): no machine on this work order has that id. ` +
          `probe("${machineId}") returns null for an id that does not exist, and costs nothing — ` +
          'check it before you act on it.',
        { botId },
      );
    }
    if (machine.vars[MANUAL_ONLY] === 1) {
      this.builder.push({
        t,
        botId,
        dt,
        kind: 'act',
        name: 'power',
        at: machine.at,
        ok: false,
        detail: machineId,
      });
      this.charge(bot, dt);
      throw new IllegalActionError(
        `power("${machineId}"): the machine at (${machine.at.x}, ${machine.at.y}) is ` +
          `hand-operated, so only a use() at that tile moves it. ` +
          `probe("${machineId}").vars.manual is 1 on every machine like it.`,
        { botId, at: machine.at },
      );
    }
    this.builder.push({
      t,
      botId,
      dt,
      kind: 'act',
      name: 'power',
      at: machine.at,
      ok: true,
      detail: state,
    });
    this.mutate(machine, t, (m) => {
      m.state = state;
    });
    this.builder.push({ t, kind: 'fx', at: machine.at, fx: 'power', botId });
    this.charge(bot, dt);
    return true;
  }

  refuel(botId: number): boolean {
    const bot = this.requireActiveBot(botId);
    const t = bot.clock;
    const dt = this.costs.refuel;
    const at = { x: bot.at.x, y: bot.at.y };
    const ok = tileAt(this.world, at)?.terrain === Terrain.Depot;
    if (ok) bot.fuel = bot.fuelMax;
    this.builder.push({ t, botId, dt, kind: 'refuel', at, ok, to: bot.fuel });
    if (ok) this.builder.push({ t, kind: 'fx', at, fx: 'refuel', botId });
    this.chargeIdle(bot, dt);
    return ok;
  }

  spend(resource: string, amount: number, botId?: number): void {
    this.op();
    if (!Number.isFinite(amount)) {
      throw new IllegalActionError(
        `spend("${resource}", ${String(amount)}): amount must be finite.`,
      );
    }
    this.spendLedger.set(resource, (this.spendLedger.get(resource) ?? 0) + amount);
    const t =
      botId === undefined ? this.peakClock : (botById(this.world, botId)?.clock ?? this.peakClock);
    this.builder.push(
      botId === undefined
        ? { t, kind: 'spend', resource, amount }
        : { t, kind: 'spend', resource, amount, botId },
    );
  }

  mark(botId: number, text: string | null): void {
    const bot = this.requireActiveBot(botId);
    const t = bot.clock;
    const dt = this.costs.mark;
    this.requireFuel(bot, dt, 'mark');
    const at = { x: bot.at.x, y: bot.at.y };
    const tile = tileAt(this.world, at);
    if (tile) {
      if (text === null) delete tile.mark;
      else tile.mark = text;
    }
    this.builder.push({ t, botId, dt, kind: 'mark', at, text });
    this.charge(bot, dt);
  }

  print(botId: number, text: string, line?: number): void {
    const bot = this.requireBot(botId);
    const event = { t: bot.clock, kind: 'print' as const, text, botId };
    this.builder.push(line === undefined ? event : { ...event, line });
  }

  send(botId: number, to: number, body: string | number): boolean {
    const bot = this.requireActiveBot(botId);
    const t = bot.clock;
    const dt = this.costs.send;
    this.requireFuel(bot, dt, 'send');
    const target = botById(this.world, to);
    if (!target || !target.alive) {
      this.builder.push({ t, botId, dt, kind: 'send', to, body, ok: false });
      this.charge(bot, dt);
      if (!target) {
        throw new IllegalActionError(
          `send(${to}): there is no bot #${to} on this contract, so the message has nowhere ` +
            'to go. bots() returns every id that exists.',
          { botId },
        );
      }
      throw new IllegalActionError(
        `send(${to}): bot #${to} ("${target.name}") was lost at (${target.at.x}, ${target.at.y}) ` +
          'and cannot receive messages. bots() lists only the bots still running.',
        { botId, at: target.at },
      );
    }
    enqueueMessage(target, { from: botId, body, t });
    this.builder.push({ t, botId, dt, kind: 'send', to, body, ok: true });
    this.charge(bot, dt);
    return true;
  }

  recv(botId: number): Message | null {
    const bot = this.requireBot(botId);
    const head = bot.inbox[0];
    const message = head !== undefined && head.t <= bot.clock ? head : null;
    if (message) bot.inbox.shift();
    this.builder.push({
      t: bot.clock,
      botId,
      dt: 0,
      kind: 'recv',
      from: message?.from ?? null,
      body: message?.body ?? null,
    });
    return message;
  }

  spawn(botId: number, dir: Dir, options: { name?: string; capacity?: number } = {}): number {
    const parent = this.requireActiveBot(botId);
    const t = parent.clock;
    const dt = this.costs.spawn;
    this.requireFuel(parent, dt, 'spawn');
    const at = step(parent.at, dir);

    const reason = this.blockReason(parent, at, t + dt);
    if (reason !== null) {
      this.builder.push({
        t,
        botId,
        dt,
        kind: 'act',
        name: 'spawn',
        at,
        ok: false,
        detail: reason,
      });
      this.charge(parent, dt);
      return -1;
    }

    const id = this.world.bots.reduce((max, b) => Math.max(max, b.id), -1) + 1;
    const child: Bot = {
      id,
      name: options.name ?? `bot-${id}`,
      at: { x: at.x, y: at.y },
      facing: dir,
      clock: t + dt,
      alive: true,
      inventory: [],
      capacity: options.capacity ?? parent.capacity,
      fuel: parent.fuelMax,
      fuelMax: parent.fuelMax,
      vars: {},
      inbox: [],
    };
    this.world.bots.push(child);
    const tile = tileAt(this.world, at);
    if (tile) tile.occupant = id;
    this.reserve(at, id, child.clock);

    this.builder.push({ t, botId, dt, kind: 'spawn', bot: cloneBot(child) });
    this.builder.push({ t, kind: 'fx', at, fx: 'spawn', botId: id });
    this.charge(parent, dt);
    if (child.clock > this.peakClock) this.peakClock = child.clock;
    return id;
  }

  sync(): number {
    this.op();
    let target = this.peakClock;
    let furthest: number | undefined;
    for (const bot of this.world.bots) {
      if (bot.alive && bot.clock > target) {
        target = bot.clock;
        furthest = bot.id;
      }
    }
    if (target > this.maxTicks) throw new HaltError(this.maxTicks, furthest);

    this.peakClock = target;
    this.world.tick = target;
    for (const bot of this.world.bots) {
      if (!bot.alive || bot.clock >= target) continue;
      const t = bot.clock;
      const dt = target - t;
      this.builder.push({ t, botId: bot.id, dt, kind: 'sync', to: target });
      this.chargeIdle(bot, dt);
    }
    return target;
  }

  refuseMachineAct(botId: number, detail: string, cost: number): void {
    const bot = this.requireActiveBot(botId);
    const t = bot.clock;
    this.requireFuel(bot, cost, 'machine');
    this.builder.push({ t, botId, dt: cost, kind: 'act', name: 'machine', ok: false, detail });
    this.charge(bot, cost);
  }

  applyMachineChange(
    botId: number,
    machineId: string,
    mutate: (machine: Machine) => void,
    cost: number,
  ): void {
    const bot = this.requireActiveBot(botId);
    const t = bot.clock;
    this.requireFuel(bot, cost, 'machine');
    const machine = machineById(this.world, machineId);
    this.builder.push({
      t,
      botId,
      dt: cost,
      kind: 'act',
      name: 'machine',
      ok: machine !== undefined,
      detail: machineId,
    });
    if (!machine) {
      this.charge(bot, cost);
      throw new IllegalActionError(
        `No machine on this work order has the id "${machineId}". ` +
          `probe("${machineId}") returns null for an id that does not exist, and costs nothing — ` +
          'check it before you act on it.',
        { botId },
      );
    }
    this.mutate(machine, t, mutate);
    this.charge(bot, cost);
  }

  applyTileChange(at: Vec, mutate: (tile: Tile) => void): void {
    this.op();
    const tile = tileAt(this.world, at);
    if (!tile) return;
    const before = cloneTile(tile);
    mutate(tile);
    this.builder.push({
      t: this.peakClock,
      kind: 'tileChange',
      at,
      before,
      after: cloneTile(tile),
    });
  }

  snapshot(): World {
    return cloneWorld(this.world);
  }

  private view(at: Vec, t: number): TileView {
    const tile = tileAt(this.world, at);
    if (!tile) {
      return {
        at: { x: at.x, y: at.y },
        inBounds: false,
        terrain: OUT_OF_BOUNDS_TERRAIN,
        walkable: false,
        lethal: false,
        growth: 0,
        maxGrowth: 0,
        sproutsIn: 0,
        crop: null,
        items: [],
        botId: null,
        machineId: null,
        mark: null,
      };
    }
    const occupant = tile.occupant;
    const standing =
      occupant !== undefined && (botById(this.world, occupant)?.alive ?? false) ? occupant : null;
    return {
      at: { x: at.x, y: at.y },
      inBounds: true,
      terrain: tile.terrain,
      walkable: terrainProps(tile.terrain).walkable,
      lethal: terrainProps(tile.terrain).lethal,
      growth: maturity(tile, t),
      maxGrowth: tile.maxGrowth ?? 0,
      sproutsIn: sproutsIn(tile, t),
      crop: tile.crop ?? null,
      items: itemsAt(this.world, at).map((s) => ({ kind: s.kind, count: s.count })),
      botId: standing,
      machineId: machineAt(this.world, at)?.id ?? null,
      mark: tile.mark ?? null,
    };
  }

  private machineNear(bot: Bot): Machine | undefined {
    return machineAt(this.world, bot.at) ?? machineAt(this.world, step(bot.at, bot.facing));
  }

  private mutate(machine: Machine, t: number, apply: (m: Machine) => void): void {
    const before = cloneMachine(machine);
    apply(machine);
    this.builder.push({
      t,
      kind: 'machineChange',
      id: machine.id,
      before,
      after: cloneMachine(machine),
    });
    this.applyMachineLinks(machine, t);
  }

  private applyMachineLinks(machine: Machine, t: number): void {
    if (machine.kind !== 'door' || !machine.links) return;
    const next = machine.state === 'open' ? Terrain.Floor : Terrain.Wall;
    for (const at of machine.links) {
      const tile = tileAt(this.world, at);
      if (!tile || tile.terrain === next) continue;
      const before = cloneTile(tile);
      tile.terrain = next;
      this.builder.push({ t, kind: 'tileChange', at, before, after: cloneTile(tile) });
    }
  }

  private blockReason(bot: Bot, to: Vec, arriveAt: number): string | null {
    if (!bot.alive) return 'dead';
    if (!inBounds(this.world, to)) return 'bounds';
    const tile = tileAt(this.world, to);
    if (!tile || !terrainProps(tile.terrain).walkable) return 'terrain';
    for (const held of this.occupancy.get(indexOf(this.world, to)) ?? []) {
      if (held.botId === bot.id) continue;
      if (held.to > arriveAt) return 'bot';
    }
    return null;
  }

  private reserve(at: Vec, botId: number, from: number): void {
    const key = indexOf(this.world, at);
    const list = this.occupancy.get(key);
    if (list) list.push({ botId, from, to: Number.POSITIVE_INFINITY });
    else this.occupancy.set(key, [{ botId, from, to: Number.POSITIVE_INFINITY }]);
  }

  private release(at: Vec, botId: number, until: number): void {
    const key = indexOf(this.world, at);
    const list = this.occupancy.get(key);
    if (!list) return;
    for (let i = list.length - 1; i >= 0; i--) {
      const held = list[i] as Occupancy;
      if (held.botId === botId && held.to === Number.POSITIVE_INFINITY) {
        held.to = until;
        break;
      }
    }
    if (list.length > 8) {
      const floor = this.minLivingClock();
      const kept = list.filter((h) => h.to > floor);
      this.occupancy.set(key, kept.length > 0 ? kept : list.slice(-1));
    }
  }

  private minLivingClock(): number {
    let min = Number.POSITIVE_INFINITY;
    for (const bot of this.world.bots) {
      if (bot.alive && bot.clock < min) min = bot.clock;
    }
    return min === Number.POSITIVE_INFINITY ? 0 : min;
  }

  private kill(bot: Bot, reason: string): void {
    const at = { x: bot.at.x, y: bot.at.y };
    bot.alive = false;
    const tile = tileAt(this.world, at);
    if (tile?.occupant === bot.id) delete tile.occupant;
    this.release(at, bot.id, bot.clock);
    this.builder.push({ t: bot.clock, botId: bot.id, dt: 0, kind: 'die', at, reason });
    this.builder.push({ t: bot.clock, kind: 'fx', at, fx: 'die', botId: bot.id });
  }

  private requireFuel(bot: Bot, dt: number, action: string): void {
    if (dt <= 0 || bot.fuel >= dt) return;
    throw new OutOfFuelError(bot.id, bot.name, action, dt, bot.fuel);
  }

  private charge(bot: Bot, dt: number): void {
    bot.fuel -= dt;
    this.advance(bot, dt);
  }

  private chargeIdle(bot: Bot, dt: number): void {
    this.advance(bot, dt);
  }

  private advance(bot: Bot, dt: number): void {
    bot.clock += dt;
    if (bot.clock > this.peakClock) this.peakClock = bot.clock;
    this.world.tick = this.peakClock;
    if (bot.clock > this.maxTicks) throw new HaltError(this.maxTicks, bot.id);
  }

  private noteMoveOutcome(bot: Bot, blocked: boolean): void {
    if (!blocked) {
      this.blockedStreak = 0;
      this.blockedSince.clear();
      return;
    }
    this.blockedStreak += 1;
    this.blockedSince.add(bot.id);

    const living = this.world.bots.filter((b) => b.alive);
    if (living.length < 2) return;
    if (!living.every((b) => this.blockedSince.has(b.id))) return;
    if (this.blockedStreak < this.livelockRounds * living.length) return;
    throw new LivelockError(
      living.map((b) => b.id),
      Math.floor(this.blockedStreak / living.length),
    );
  }

  private sense(bot: Bot, name: string, ok: boolean, detail?: string | number): void {
    this.senseLedger.set(name, (this.senseLedger.get(name) ?? 0) + 1);
    const event: SenseEvent = {
      t: bot.clock,
      botId: bot.id,
      dt: 0,
      kind: 'sense',
      name,
      ok,
      count: 1,
    };
    if (detail !== undefined) event.detail = detail;
    this.builder.pushSense(event);
  }

  private op(): void {
    this.opCount += 1;
    if (this.opCount > this.maxOps) throw new OpLimitError(this.maxOps);
  }

  private requireBot(botId: number): Bot {
    this.op();
    const bot = botById(this.world, botId);
    if (!bot) {
      throw new IllegalActionError(
        `There is no bot #${botId} on this contract. Check the ids returned by bots().`,
      );
    }
    return bot;
  }

  private requireActiveBot(botId: number): Bot {
    const bot = this.requireBot(botId);
    if (!bot.alive) {
      throw new IllegalActionError(
        `Bot #${botId} ("${bot.name}") is no longer operational and cannot accept commands. ` +
          'Kessler & Daughters thanks it for its service.',
        { botId, at: bot.at },
      );
    }
    return bot;
  }
}

function plantBlockReason(tile: Tile | undefined, seeds: number): string | null {
  if (!tile || !terrainProps(tile.terrain).plantable) return 'terrain';
  if (tile.crop !== undefined) return 'occupied';
  if (seeds <= 0) return 'seed';
  return null;
}

function pickupBlockReason(requested: number, anyOnGround: boolean, onGround: number): string {
  if (requested <= 0) return 'count';
  if (!anyOnGround) return 'empty';
  if (onGround <= 0) return 'kind';
  return 'full';
}

function dropBlockReason(requested: number, carrying: number): string {
  if (requested <= 0) return 'count';
  if (carrying <= 0) return 'empty';
  return 'kind';
}

export function describeBlock(reason: string, dir: Dir): string {
  switch (reason) {
    case 'bounds':
      return `There is nothing to the ${dirName(dir)} — that is the edge of the site.`;
    case 'terrain':
      return `Something solid is blocking the way ${dirName(dir)}.`;
    case 'bot':
      return `Another bot is occupying the tile to the ${dirName(dir)}.`;
    default:
      return `The move ${dirName(dir)} failed.`;
  }
}

function finiteDetail(value: number): number | undefined {
  return Number.isFinite(value) ? value : undefined;
}

function clip(text: string): string {
  return text.length <= 48 ? text : `${text.slice(0, 48)}…`;
}
