import type { CostOverrides, CostTable } from './costs.ts';
import { resolveCosts } from './costs.ts';
import {
  HaltError,
  IllegalActionError,
  LivelockError,
  OpLimitError,
  OutOfFuelError,
} from './errors.ts';
import type { Trace } from './trace.ts';
import { KEYFRAME_INTERVAL, TraceBuilder } from './trace.ts';
import type { Bot, Dir, ItemKind, ItemStack, Machine, Message, Tile, Vec, World } from './types.ts';
import { Terrain } from './types.ts';
import {
  addGroundItems,
  addToInventory,
  botById,
  cloneBot,
  cloneMachine,
  cloneTile,
  cloneWorld,
  dirName,
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
/** Default ticks a freshly planted crop needs before `harvest` succeeds. */
export const DEFAULT_GROW_TIME = 8;

/** DESIGN.md §11 A6: how many all-bots-blocked rounds count as a livelock. */
export const DEFAULT_LIVELOCK_ROUNDS = 8;

export interface SimOptions {
  maxTicks?: number;
  maxOps?: number;
  costs?: CostOverrides;
  keyframeInterval?: number;
  livelockRounds?: number;
}

/** What a bot perceives about one tile. All sensing is free (0 ticks). */
export interface TileView {
  at: Vec;
  inBounds: boolean;
  terrain: Terrain;
  walkable: boolean;
  /** Current maturity of a crop on this tile, relative to the observing bot's clock. */
  growth: number;
  maxGrowth: number;
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
}

const OUT_OF_BOUNDS_TERRAIN = Terrain.Void;

interface Occupancy {
  botId: number;
  from: number;
  /** Exclusive. `Infinity` while the bot is still standing there. */
  to: number;
}

/**
 * Maturity of a crop tile as observed at tick `t`.
 *
 * Nothing in this engine ticks on its own — there is no global update loop — so growth is derived
 * from when the crop was planted rather than advanced by a scheduler. Tiles authored with a
 * `growth` value and no `meta.plantedAt` are simply always at that maturity.
 */
export function maturity(tile: Tile, t: number): number {
  const max = tile.maxGrowth ?? 0;
  const plantedAt = tile.meta?.['plantedAt'];
  if (typeof plantedAt === 'number') {
    return Math.max(0, Math.min(max, t - plantedAt));
  }
  return tile.growth ?? 0;
}

/** What a seed turns into when harvested. */
const PLANT_YIELD: Partial<Record<ItemKind, ItemKind>> = { seed: 'crop' };

/**
 * The deterministic simulation. The runtime worker binds one method per player API call to this.
 *
 * Every acting method: validates, mutates the world, advances the acting bot's own clock by the
 * action cost, appends a timestamped TraceEvent, checks budgets, returns the player-visible value.
 *
 * The Sim never consumes `world.rng`. Randomness belongs to `LevelDef.build(seed)` only, which is
 * what lets a Trace replay identically without re-running any sim logic.
 */
export class Sim {
  readonly world: World;
  readonly costs: CostTable;
  readonly maxTicks: number;
  readonly maxOps: number;

  private readonly builder: TraceBuilder;
  private readonly keyframeInterval: number;
  private readonly occupancy = new Map<number, Occupancy[]>();
  private readonly spendLedger = new Map<string, number>();
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
    this.builder = new TraceBuilder(world);

    for (const bot of world.bots) {
      if (!bot.alive) continue;
      if (bot.clock > this.peakClock) this.peakClock = bot.clock;
      this.reserve(bot.at, bot.id, bot.clock);
    }
    world.tick = this.peakClock;
  }

  // -------------------------------------------------------------------------
  // Introspection
  // -------------------------------------------------------------------------

  get ops(): number {
    return this.opCount;
  }

  /** `max(bot.clock)` — the makespan, and the level's tick score. */
  get ticks(): number {
    return this.peakClock;
  }

  /** Live bot ids, ascending. Free. */
  botIds(): number[] {
    this.op();
    return this.world.bots.filter((b) => b.alive).map((b) => b.id);
  }

  /** Finalizes the trace. Call once, after the player's program returns or throws. */
  finish(): Trace {
    return this.builder.build(this.peakClock, this.keyframeInterval);
  }

  /** Records an objective transition into the trace so the renderer can flash it at the right tick. */
  noteObjective(id: string, state: 'met' | 'lost'): void {
    this.builder.push({ t: this.peakClock, kind: 'objective', id, state });
  }

  // -------------------------------------------------------------------------
  // Sensing (0 ticks)
  // -------------------------------------------------------------------------

  pos(botId: number): Vec {
    const bot = this.requireBot(botId);
    return { x: bot.at.x, y: bot.at.y };
  }

  facing(botId: number): Dir {
    return this.requireBot(botId).facing;
  }

  clock(botId: number): number {
    return this.requireBot(botId).clock;
  }

  canMove(botId: number, dir: Dir): boolean {
    const bot = this.requireBot(botId);
    return this.blockReason(bot, step(bot.at, dir), bot.clock) === null;
  }

  /** The bot's own tile when `dir` is omitted, otherwise the adjacent tile in `dir`. */
  scan(botId: number, dir?: Dir): TileView {
    const bot = this.requireBot(botId);
    const at = dir === undefined ? bot.at : step(bot.at, dir);
    return this.view(at, bot.clock);
  }

  /**
   * Ray-cast from the bot in `dir` up to `range` tiles, stopping after the first opaque tile
   * (which is included). World 4's map-discovery primitive.
   */
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
    return out;
  }

  inventory(botId: number, kind?: ItemKind): number {
    const bot = this.requireBot(botId);
    return inventoryCount(bot, kind);
  }

  /** Distinct item kinds the bot is holding, in pickup order. */
  carrying(botId: number): ItemKind[] {
    const bot = this.requireBot(botId);
    return bot.inventory.filter((s) => s.count > 0).map((s) => s.kind);
  }

  capacity(botId: number): number {
    return this.requireBot(botId).capacity;
  }

  fuel(botId: number): number {
    return this.requireBot(botId).fuel;
  }

  fuelMax(botId: number): number {
    return this.requireBot(botId).fuelMax;
  }

  /** Resource totals for `Verdict.stats.spend`. DESIGN.md §11 A5. */
  spendTotals(): Record<string, number> {
    return Object.fromEntries(this.spendLedger);
  }

  readMark(botId: number): string | null {
    const bot = this.requireBot(botId);
    return tileAt(this.world, bot.at)?.mark ?? null;
  }

  probe(botId: number, machineId?: string): MachineView | null {
    const bot = this.requireBot(botId);
    const machine =
      machineId === undefined ? this.machineNear(bot) : machineById(this.world, machineId);
    if (!machine) return null;
    return {
      id: machine.id,
      kind: machine.kind,
      at: { x: machine.at.x, y: machine.at.y },
      state: machine.state,
      vars: { ...machine.vars },
      inventory: machine.inventory.map((s) => ({ kind: s.kind, count: s.count })),
    };
  }

  // -------------------------------------------------------------------------
  // Acting
  // -------------------------------------------------------------------------

  /**
   * Steps one tile in `dir`. Returns false (and still burns `moveBlocked` ticks) when the target
   * is out of bounds, not walkable terrain, or occupied by another bot over an overlapping time
   * interval. Facing always updates, even on a failed move.
   */
  move(botId: number, dir: Dir): boolean {
    const bot = this.requireActiveBot(botId);
    const t = bot.clock;
    const from = { x: bot.at.x, y: bot.at.y };
    const to = step(from, dir);
    const reason = this.blockReason(bot, to, t);
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
    this.reserve(to, botId, t);

    this.builder.push({ t, botId, dt, kind: 'move', from, to, dir, ok: true });
    this.charge(bot, dt);
    this.noteMoveOutcome(bot, false);

    if (toTile && terrainProps(toTile.terrain).lethal) {
      this.kill(bot, `stepped into ${toTile.terrain}`);
    }
    return true;
  }

  /** Rotates in place. Free by default; still traced so the renderer can animate it. */
  turn(botId: number, dir: Dir): void {
    const bot = this.requireActiveBot(botId);
    const t = bot.clock;
    const dt = this.costs.turn;
    this.requireFuel(bot, dt, 'turn');
    bot.facing = dir;
    this.builder.push({ t, botId, dt, kind: 'turn', facing: dir });
    this.charge(bot, dt);
  }

  /** Burns `n * costs.wait` ticks doing nothing. */
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

  /**
   * Harvests a mature crop from the tile the bot stands on. Returns the item kind gathered, or
   * null when there is nothing ready (which still costs the full `harvest` price).
   */
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
      this.builder.push({ t, botId, dt, kind: 'harvest', at, item: null, count: 0, ok: false });
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

  /** Plants one `kind` from the inventory into plantable ground under the bot. */
  plant(botId: number, kind: ItemKind = 'seed', growTime = DEFAULT_GROW_TIME): boolean {
    const bot = this.requireActiveBot(botId);
    const t = bot.clock;
    const dt = this.costs.plant;
    this.requireFuel(bot, dt, 'plant');
    const at = { x: bot.at.x, y: bot.at.y };
    const tile = tileAt(this.world, at);

    const plantable =
      tile !== undefined && terrainProps(tile.terrain).plantable && tile.crop === undefined;
    const hasSeed = inventoryCount(bot, kind) > 0;

    if (!plantable || !hasSeed || !tile) {
      this.builder.push({ t, botId, dt, kind: 'plant', at, item: kind, ok: false });
      this.charge(bot, dt);
      return false;
    }

    const before = cloneTile(tile);
    removeFromInventory(bot, kind, 1);
    tile.crop = PLANT_YIELD[kind] ?? kind;
    tile.growth = 0;
    tile.maxGrowth = growTime;
    tile.meta = { ...(tile.meta ?? {}), plantedAt: t };

    this.builder.push({ t, botId, dt, kind: 'plant', at, item: kind, ok: true });
    this.builder.push({ t, kind: 'tileChange', at, before, after: cloneTile(tile) });
    this.builder.push({ t, kind: 'fx', at, fx: 'plant', botId });
    this.charge(bot, dt);
    return true;
  }

  /** Mines the adjacent tile in `dir`, or the bot's own tile when `dir` is omitted. */
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

  /**
   * Picks loose items up off the bot's own tile. Omit `kind` to take whatever is there.
   * Returns how many were actually picked up, clamped by inventory capacity.
   */
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

  /** Drops items onto the bot's own tile. Returns how many were actually dropped. */
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

  /**
   * Operates the machine on the bot's tile, or the adjacent one in `dir`. Advances the machine
   * through its `cycle`; a Door with `links` flips those tiles between Floor and Wall.
   */
  use(botId: number, dir?: Dir): boolean {
    const bot = this.requireActiveBot(botId);
    const t = bot.clock;
    const dt = this.costs.use;
    this.requireFuel(bot, dt, 'use');
    const at = dir === undefined ? { x: bot.at.x, y: bot.at.y } : step(bot.at, dir);
    const machine = machineAt(this.world, at);

    if (!machine) {
      this.builder.push({ t, botId, dt, kind: 'use', at, machineId: null, ok: false });
      this.charge(bot, dt);
      return false;
    }

    this.builder.push({ t, botId, dt, kind: 'use', at, machineId: machine.id, ok: true });
    this.mutate(machine, t, (m) => {
      if (!m.cycle || m.cycle.length === 0) return;
      const i = m.cycle.indexOf(m.state);
      m.state = m.cycle[(i + 1) % m.cycle.length] as string;
    });
    this.builder.push({ t, kind: 'fx', at, fx: 'use', botId });
    this.charge(bot, dt);
    return true;
  }

  /** Directly sets a machine's state (World 5's `power`). Returns false for unknown machines. */
  power(botId: number, machineId: string, state: string): boolean {
    const bot = this.requireActiveBot(botId);
    const t = bot.clock;
    const dt = this.costs.power;
    this.requireFuel(bot, dt, 'power');
    const machine = machineById(this.world, machineId);
    if (!machine) {
      this.builder.push({ t, botId, dt, kind: 'act', name: 'power', ok: false, detail: machineId });
      this.charge(bot, dt);
      return false;
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

  /**
   * Restores the bot to `fuelMax`. Only succeeds while parked on a depot tile; it costs the same
   * either way, and refuelling itself burns no fuel. DESIGN.md §11 A1.
   */
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

  /**
   * Records consumption of a level-defined resource. The engine never interprets `resource`; it
   * only totals it into `Verdict.stats.spend` so a level can report "cable used: 34".
   */
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

  /** Writes a breadcrumb on the bot's own tile. Pass null to erase. */
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

  /** Free. Appears in the console panel and drives the `printedSequence` objective. */
  print(botId: number, text: string, line?: number): void {
    const bot = this.requireBot(botId);
    const event = { t: bot.clock, kind: 'print' as const, text, botId };
    this.builder.push(line === undefined ? event : { ...event, line });
  }

  /** Queues a message in another bot's inbox. World 7. */
  send(botId: number, to: number, body: string | number): boolean {
    const bot = this.requireActiveBot(botId);
    const t = bot.clock;
    const dt = this.costs.send;
    this.requireFuel(bot, dt, 'send');
    const target = botById(this.world, to);
    if (!target || !target.alive) {
      this.builder.push({ t, botId, dt, kind: 'act', name: 'send', ok: false, detail: to });
      this.charge(bot, dt);
      return false;
    }
    target.inbox.push({ from: botId, body, t });
    this.builder.push({ t, botId, dt, kind: 'send', to, body });
    this.charge(bot, dt);
    return true;
  }

  /** Pops the oldest message from this bot's inbox. Free. */
  recv(botId: number): Message | null {
    const bot = this.requireBot(botId);
    const message = bot.inbox[0] ?? null;
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

  /** Creates a new bot on the adjacent tile in `dir`. Returns its id, or -1 if the tile is taken. */
  spawn(botId: number, dir: Dir, options: { name?: string; capacity?: number } = {}): number {
    const parent = this.requireActiveBot(botId);
    const t = parent.clock;
    const dt = this.costs.spawn;
    this.requireFuel(parent, dt, 'spawn');
    const at = step(parent.at, dir);

    if (this.blockReason(parent, at, t) !== null) {
      this.builder.push({ t, botId, dt, kind: 'act', name: 'spawn', at, ok: false });
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
    this.reserve(at, id, t);

    this.builder.push({ t, botId, dt, kind: 'spawn', bot: cloneBot(child) });
    this.builder.push({ t, kind: 'fx', at, fx: 'spawn', botId: id });
    this.charge(parent, dt);
    if (child.clock > this.peakClock) this.peakClock = child.clock;
    return id;
  }

  /** Advances every living bot's clock to `max(clock)`. The World 7 rendezvous primitive. */
  sync(): number {
    this.op();
    const target = this.peakClock;
    for (const bot of this.world.bots) {
      if (!bot.alive || bot.clock >= target) continue;
      const t = bot.clock;
      const dt = target - t;
      this.builder.push({ t, botId: bot.id, dt, kind: 'sync', to: target });
      bot.clock = target;
    }
    this.world.tick = target;
    if (target > this.maxTicks) throw new HaltError(this.maxTicks);
    return target;
  }

  // -------------------------------------------------------------------------
  // Extension points
  // -------------------------------------------------------------------------

  /**
   * Escape hatch for world-specific machine logic (World 5/6). Applies `mutate` to the machine and
   * emits the matching `machineChange` event so replay stays faithful. Charges `cost` ticks.
   */
  applyMachineChange(
    botId: number,
    machineId: string,
    mutate: (machine: Machine) => void,
    cost: number,
  ): boolean {
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
      return false;
    }
    this.mutate(machine, t, mutate);
    this.charge(bot, cost);
    return true;
  }

  /** Escape hatch for world-specific tile logic. Emits a `tileChange` event. Charges 0 ticks. */
  applyTileChange(at: Vec, mutate: (tile: Tile) => void): void {
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

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private view(at: Vec, t: number): TileView {
    const tile = tileAt(this.world, at);
    if (!tile) {
      return {
        at: { x: at.x, y: at.y },
        inBounds: false,
        terrain: OUT_OF_BOUNDS_TERRAIN,
        walkable: false,
        growth: 0,
        maxGrowth: 0,
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
      growth: maturity(tile, t),
      maxGrowth: tile.maxGrowth ?? 0,
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

  /** A Door's `links` tiles follow its state: 'open' -> Floor, anything else -> Wall. */
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

  /**
   * null when the move is legal, otherwise the reason. Occupancy is checked over the half-open
   * interval [t, t + move) against every other bot's residence interval on that tile, so a bot
   * running behind on its own clock cannot walk through a tile someone else held at that time.
   */
  private blockReason(bot: Bot, to: Vec, t: number): string | null {
    if (!bot.alive) return 'dead';
    if (!inBounds(this.world, to)) return 'bounds';
    const tile = tileAt(this.world, to);
    if (!tile || !terrainProps(tile.terrain).walkable) return 'terrain';
    const end = t + this.costs.move;
    for (const held of this.occupancy.get(indexOf(this.world, to)) ?? []) {
      if (held.botId === bot.id) continue;
      if (held.from < end && t < held.to) return 'bot';
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

  /**
   * Throws before anything is mutated, so a run that dies of thirst leaves a coherent world.
   * A no-cost action can never fail this check.
   */
  private requireFuel(bot: Bot, dt: number, action: string): void {
    if (dt <= 0 || bot.fuel >= dt) return;
    throw new OutOfFuelError(bot.id, bot.name, action, dt, bot.fuel);
  }

  /** Advances the clock and burns `dt` fuel. Mirrors `FUEL_BURNING` in trace.ts. */
  private charge(bot: Bot, dt: number): void {
    bot.fuel -= dt;
    this.advance(bot, dt);
  }

  /** Advances the clock without burning fuel: waiting, syncing and refuelling are free. */
  private chargeIdle(bot: Bot, dt: number): void {
    this.advance(bot, dt);
  }

  private advance(bot: Bot, dt: number): void {
    bot.clock += dt;
    if (bot.clock > this.peakClock) this.peakClock = bot.clock;
    this.world.tick = this.peakClock;
    if (bot.clock > this.maxTicks) throw new HaltError(this.maxTicks, bot.id);
  }

  /**
   * DESIGN.md §11 A6. A streak of blocked moves that covers every living bot, with not one
   * successful move in between, is a livelock. Single-bot levels can never trip it — a lone bot
   * bumping a wall is an ordinary bug, not a deadlock.
   */
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

/** Human-readable rendering of a move failure, for hint text and failure messages. */
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
