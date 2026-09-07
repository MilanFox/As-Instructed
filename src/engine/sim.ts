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
/** Default ticks a freshly planted crop needs before `harvest` succeeds. */
export const DEFAULT_GROW_TIME = 8;

/** DESIGN.md §4.6: how many all-bots-blocked rounds count as a livelock. */
export const DEFAULT_LIVELOCK_ROUNDS = 8;

export interface SimOptions {
  maxTicks?: number;
  maxOps?: number;
  costs?: CostOverrides;
  keyframeInterval?: number;
  livelockRounds?: number;
  /** How many individual sensing reads the trace keeps before it starts aggregating them. */
  maxSenseEvents?: number;
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

/** One bot's residence on one tile, over the half-open clock interval `[from, to)`. */
interface Occupancy {
  botId: number;
  /** The bot's own clock at the moment it took the tile, i.e. when its arriving move completed. */
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
 *
 * `meta.plantedAt` is the tick the seed reached the soil, i.e. the moment `plant` *finished*.
 * A crop therefore reads 0/max to the bot that just planted it, rather than having quietly grown
 * during the two ticks that bot spent kneeling over it.
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
  // Sensing (0 ticks, but counted)
  // -------------------------------------------------------------------------
  //
  // Sensing stays free in ticks (DESIGN.md §4.4) and is *observable*: one op against `maxOps`,
  // one `sense` trace event, one tally in `senseTotals()`. That is what lets a level budget
  // information — "find the break in ten probes" — the way it already budgets time.
  //
  // `recv` is excluded on purpose: it consumes a message rather than reading the world, and it
  // has carried its own event since World 7. So is `botIds`, which reads the roster, not the site.

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

  /** The bot's own tile when `dir` is omitted, otherwise the adjacent tile in `dir`. */
  scan(botId: number, dir?: Dir): TileView {
    const bot = this.requireBot(botId);
    const at = dir === undefined ? bot.at : step(bot.at, dir);
    const view = this.view(at, bot.clock);
    this.sense(bot, 'scan', view.inBounds, `${at.x},${at.y}`);
    return view;
  }

  /**
   * Ray-cast from the bot in `dir`, nearest first, excluding the bot's own tile. World 4's
   * map-discovery primitive.
   *
   * `range` caps the number of views returned, and the tile that stops the cast — the first
   * opaque one, or the first out-of-bounds one — is included and counts against that cap. A ray
   * that runs off the edge therefore ends in a view with `inBounds: false`, which is how a player
   * tells "the tunnel continues past my sensor" from "the site ends here".
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
    this.sense(bot, 'look', out.length > 0, `${dirName(dir)}:${out.length}`);
    return out;
  }

  inventory(botId: number, kind?: ItemKind): number {
    const bot = this.requireBot(botId);
    const held = inventoryCount(bot, kind);
    this.sense(bot, 'inventory', held > 0, kind ?? '*');
    return held;
  }

  /** Distinct item kinds the bot is holding, in pickup order. */
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

  /** Resource totals for `Verdict.stats.spend`. DESIGN.md §4.6. */
  spendTotals(): Record<string, number> {
    return Object.fromEntries(this.spendLedger);
  }

  /**
   * How many times each sensing command ran, keyed by command name. Feeds `Verdict.stats.senses`,
   * and is exact regardless of how much detail the trace folded away.
   */
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

  /**
   * Plants one `kind` from the inventory into plantable ground under the bot.
   *
   * A refusal returns false, charges the full price, and records *which* of the three causes it
   * was as `reason` on the event, the way a blocked `move` already does. There is deliberately no
   * `canPlant()` to go with it: `move` needs `canMove` because its block reason includes tile
   * reservations the player cannot see, whereas every input to this decision is already free and
   * exact — `scan().terrain`, `scan().crop` and `inventory(kind)` — so the three checks that tell
   * the causes apart are three the player can already make, before the call or after it.
   */
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
   *
   * A `0` is the same "the world says no" a `false` is, and stays one: every cause is transient.
   * Which cause it was rides on the event as `reason`, because `0` alone folds together an empty
   * tile, a tile with none of the kind asked for, a full inventory and a `count` of zero. The
   * player recovers the same answer from `scan().items`, `inventory()` and `capacity()`, all free.
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

  /**
   * Drops items onto the bot's own tile. Returns how many were actually dropped.
   *
   * Same shape as `pickup`, one notch milder because the player already knows what they are
   * carrying: a `0` means the bot holds nothing at all, holds none of the kind named, or was asked
   * for zero. `reason` says which, and `carrying()` / `inventory(kind)` answer it for free.
   */
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

  /**
   * Operates the machine on the bot's tile, or the adjacent one in `dir`. Advances the machine
   * through its `cycle`; a Door with `links` flips those tiles between Floor and Wall.
   *
   * Returns false when the tile carries no machine, and — since this change — when it carries one
   * with no `cycle` to advance. That second case used to return **true** and do nothing, which is
   * worse than a mute failure: a mute `false` is at least a value the program can branch on, while
   * a mute success asserts the machine was operated when it was not, and leaves the player
   * debugging the objective instead of the call.
   *
   * It is a `false` rather than a throw because `use` is the one verb that never names its target.
   * `power("sub-3")` is permanently wrong for as long as that id is manual, but `use(dir)` names a
   * *direction*: the same call one tile over works, so by the succeed-later test (docs/ENGINE.md
   * §2) it is transient. A cycle-less machine belongs in the bucket `use` already had for a tile
   * with nothing on it — there is nothing here that `use` can work — and it is reached by standing
   * somewhere, which is the most transient state in the game.
   *
   * The third refusal, a machine whose `vars` names a feeder that is not `on` yet, is in the same
   * bucket for the same reason and is the more obviously transient of the three: energising the
   * feeder makes the identical call work.
   */
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

  /**
   * True while any machine this one publishes a `fed:<id>` key for is not `on`.
   *
   * A feeder that has been removed from the world counts as unfed rather than as absent: the only
   * way to write one of these keys is `build`, so a missing id is a level bug and answering "yes,
   * powered" to it would hide the bug behind a door that opens.
   */
  private unfed(machine: Machine): boolean {
    for (const [name, value] of Object.entries(machine.vars)) {
      if (value !== 1 || !name.startsWith(FED_BY)) continue;
      if (machineById(this.world, name.slice(FED_BY.length))?.state !== 'on') return true;
    }
    return false;
  }

  /**
   * Directly sets a machine's state (World 5's `power`). Throws `IllegalActionError` for an id
   * that names no machine, and for a machine whose `vars.manual` is `1` — those are hand-operated
   * and only a `use()` at the tile moves them.
   *
   * The manual flag exists because `power` reaches any id anywhere on the map for a flat cost, so
   * a level whose whole subject is *getting a fleet to the machines* is defeated by a loop over
   * ids. Levels that want the travel back mark the machines rather than the command, so World 5,
   * where operating the grid from the desk is the point, is untouched.
   *
   * Both refusals are permanent, which is what puts them on the throwing side of docs/ENGINE.md
   * §2: nothing in the API clears `vars.manual` and nothing in it creates a machine, so each call
   * is wrong for the whole run rather than wrong now, and a `false` the player could branch on
   * would be a branch that can never flip. The unknown id kept that `false` for one release, on
   * the reasoning that it was a state of the world; it is not one, and the free `probe(id)` that
   * returns `null` is the pre-check that makes the throw fair. Both speak the way `LivelockError`
   * does — at the moment they bite, naming what was asked for.
   */
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

  /**
   * Restores the bot to `fuelMax`. Only succeeds while parked on a depot tile; it costs the same
   * either way, and refuelling itself burns no fuel. DESIGN.md §4.4.
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

  /**
   * Queues a message in another bot's inbox. World 7.
   *
   * Throws `IllegalActionError` when `to` names no bot, or a dead one. Both are permanent — no
   * call in the API brings bot #99 into being, and nothing revives a bot once `kill` has run — so
   * a `false` the player could branch on would be a branch that can never flip (docs/ENGINE.md
   * §2). It is the same state every other verb already refuses through `requireActiveBot`, which
   * is what made the old `false` an inconsistency rather than a choice: `move(99, …)` threw while
   * `send(0, 99, "x")` shrugged. The refused send is logged and charged first, so the trace and
   * the live world stay in step.
   */
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

  /**
   * Pops the oldest message this bot has actually received by now. Free.
   *
   * A message is still in flight until the receiver's own clock reaches the sender's clock at
   * `send`: a bot lagging at t = 300 has not yet heard what another bot said at t = 1300, however
   * early the player's program happened to issue the call. Without that rule a live run and its
   * replay disagree, because a replay only knows about the sends it has already applied. It is
   * also why the World 7 idiom is `send`, then `sync`, then `recv`.
   */
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

  /**
   * Creates a new bot on the adjacent tile in `dir`. Returns its id, or -1 when the tile refuses.
   *
   * The refusal is `move`'s, decided by the same `blockReason`, and the answer now rides on the
   * event as `detail` instead of being computed and dropped. It stays a `-1` rather than a throw
   * because the tile is transient: the neighbour walks off and the identical call succeeds.
   *
   * `blockReason` is asked about arrival at `t + costs.spawn`, not `t + costs.move`, so `canMove`
   * is the nearest free test but not an exact one — where the two prices differ, a tile another
   * bot is still vacating can pass `canMove` and refuse the spawn.
   */
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

  /**
   * Advances every living bot's clock to `max(clock)`. The World 7 rendezvous primitive.
   *
   * Emits one `sync` event per bot that actually idled, stamped at that bot's own clock and
   * carrying the idle span as `dt`, so the renderer can show exactly who waited and for how long.
   * A bot already at the makespan produces nothing.
   *
   * Idling burns no fuel, but it does spend the level's tick budget: `maxTicks` is enforced here
   * exactly as it is on every acting command, or a level could blow its whole allowance through
   * `sync()` alone and never be stopped.
   */
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

  // -------------------------------------------------------------------------
  // Extension points
  // -------------------------------------------------------------------------

  /**
   * Bills and logs a machine action that never reached a machine, so the verb that refused it can
   * report the refusal in its own words. Charges `cost` ticks and emits the same `ok: false` act
   * event a failed change emits.
   *
   * It exists because `applyMachineChange` used to be the only way to pay for a refusal: a caller
   * that had already decided to refuse passed an id it knew was wrong and read the `false` back.
   * That made a level verb's deliberate refusal and a genuinely broken id arrive at the engine as
   * the same call, so neither the engine nor the player could tell them apart.
   */
  refuseMachineAct(botId: number, detail: string, cost: number): void {
    const bot = this.requireActiveBot(botId);
    const t = bot.clock;
    this.requireFuel(bot, cost, 'machine');
    this.builder.push({ t, botId, dt: cost, kind: 'act', name: 'machine', ok: false, detail });
    this.charge(bot, cost);
  }

  /**
   * Escape hatch for world-specific machine logic (World 5/6). Applies `mutate` to the machine and
   * emits the matching `machineChange` event so replay stays faithful. Charges `cost` ticks.
   *
   * An id that names no machine throws. Nothing in the API creates one, so the identical call
   * cannot succeed later in the run (docs/ENGINE.md §2), and with `refuseMachineAct` carrying the
   * refusals level verbs make on purpose, the only way to arrive here with an unknown id is a verb
   * that computed one. The refusal is still logged and charged first, so a replay stays in step.
   */
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

  /**
   * Escape hatch for world-specific tile logic. Emits a `tileChange` event. Charges 0 ticks, but
   * still counts against `maxOps` — a world command built on this would otherwise let a player
   * loop grow the trace forever without ever tripping a budget.
   */
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
   * null when the move is legal, otherwise the reason.
   *
   * A bot holds a tile over the half-open interval `[the clock it arrived, the clock it left)`,
   * and `arriveAt` is when the caller would take possession — the tick its action *completes*,
   * not the tick it was issued. The tile is free when no other bot's residence extends past that
   * instant. Two consequences, both intended by DESIGN.md §4.3:
   *
   * - a convoy works, because the leader's residence ends exactly when the follower's begins;
   * - a bot running behind on its own clock still cannot walk through a tile someone else held
   *   at that time, even though the tile looks empty in the live world.
   */
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

  /**
   * Throws before anything is mutated, so a run that dies of thirst leaves a coherent world.
   * A no-cost action can never fail this check.
   */
  private requireFuel(bot: Bot, dt: number, action: string): void {
    if (dt <= 0 || bot.fuel >= dt) return;
    throw new OutOfFuelError(bot.id, bot.name, action, dt, bot.fuel);
  }

  /**
   * Advances the clock and burns `dt` fuel. `FUEL_BURNING` in trace.ts mirrors this: it lists the
   * event kinds this is called for, so a replay burns exactly what the live run burned.
   */
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
   * DESIGN.md §4.6. A streak of blocked moves that covers every living bot, with not one
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

  /**
   * Tallies one sensing read and records it. Free in ticks, so `bot.clock` is untouched and the
   * event carries `dt: 0` — replay applies it as a no-op.
   */
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

/**
 * Which of `plant`'s three refusals applies, or null when the seed would go in.
 *
 * Ordered ground, then crop, then inventory — the same order the player checks them in, and the
 * order that keeps the answer stable when two causes hold at once.
 */
function plantBlockReason(tile: Tile | undefined, seeds: number): string | null {
  if (!tile || !terrainProps(tile.terrain).plantable) return 'terrain';
  if (tile.crop !== undefined) return 'occupied';
  if (seeds <= 0) return 'seed';
  return null;
}

/**
 * Why a `pickup` came back with nothing.
 *
 * Ordered by what the player can act on soonest: their own argument, then the tile, then what is
 * on it, then the inventory. Every one of these is readable for free — `scan().items` and
 * `inventory()` / `capacity()` — which is what keeps `pickup` a `0` rather than a throw.
 */
function pickupBlockReason(requested: number, anyOnGround: boolean, onGround: number): string {
  if (requested <= 0) return 'count';
  if (!anyOnGround) return 'empty';
  if (onGround <= 0) return 'kind';
  return 'full';
}

/** Why a `drop` came back with nothing. `carrying` is the bot's total across every kind. */
function dropBlockReason(requested: number, carrying: number): string {
  if (requested <= 0) return 'count';
  if (carrying <= 0) return 'empty';
  return 'kind';
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

/** `Infinity` does not survive a `postMessage` round trip, so an unlimited reading has no detail. */
function finiteDetail(value: number): number | undefined {
  return Number.isFinite(value) ? value : undefined;
}

/** Marks are player-written and can be long. A trace only needs enough to recognise one. */
function clip(text: string): string {
  return text.length <= 48 ? text : `${text.slice(0, 48)}…`;
}
