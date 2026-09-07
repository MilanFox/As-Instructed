import type { Rng } from './rng.ts';

/** Grid position. x grows East, y grows South (screen coordinates). DESIGN.md §4.1. */
export interface Vec {
  x: number;
  y: number;
}

/**
 * Cardinal direction. North is y-1 because y grows South.
 *
 * DESIGN.md §4.1 writes this as `const enum`. We use a frozen object plus a union type because
 * the value has to survive into the player's transpiled program at runtime, and `const enum`
 * members are erased by the bundler (and are illegal under `isolatedModules`).
 */
export const Dir = {
  North: 0,
  East: 1,
  South: 2,
  West: 3,
} as const;
export type Dir = (typeof Dir)[keyof typeof Dir];

export const ALL_DIRS: readonly Dir[] = [Dir.North, Dir.East, Dir.South, Dir.West];

export const Terrain = {
  /** Outside the playable area. Never walkable, never mineable. */
  Void: 'void',
  Floor: 'floor',
  Wall: 'wall',
  /** Goal marker. Walkable. */
  Pad: 'pad',
  /** Loose dust. Walkable, minable into ItemKind.Regolith. */
  Regolith: 'regolith',
  /** Farmable ground. Walkable. Carries `growth`/`maxGrowth` once planted. */
  Soil: 'soil',
  /** Solid stone. Blocks movement, mineable into ItemKind.Stone. */
  Rock: 'rock',
  /** Solid ore vein. Blocks movement, mineable into ItemKind.Ore. */
  Ore: 'ore',
  /** Collapsed rock. Blocks movement, cheap to mine, yields ItemKind.Scrap. */
  Rubble: 'rubble',
  Ice: 'ice',
  /** Walkable, but a bot that ends a move here dies. */
  Pit: 'pit',
  /** Power infrastructure (World 5). Walkable. */
  Cable: 'cable',
  /** Fuel depot. Walkable. `refuel()` only succeeds while standing on one. DESIGN.md §4.4. */
  Depot: 'depot',
  /** Item transport (World 3). Walkable, carries `facing` in tile meta. */
  Conveyor: 'conveyor',
} as const;
export type Terrain = (typeof Terrain)[keyof typeof Terrain];

export interface TerrainProps {
  walkable: boolean;
  /** Blocks `look()` line of sight (World 4). */
  opaque: boolean;
  /** `mine()` turns this terrain into `minesTo` and yields `yields`. */
  mineable: boolean;
  minesTo: Terrain;
  yields: ItemKind | null;
  plantable: boolean;
  lethal: boolean;
}

export const ItemKind = {
  Regolith: 'regolith',
  Stone: 'stone',
  Ore: 'ore',
  Ice: 'ice',
  Scrap: 'scrap',
  Seed: 'seed',
  Crop: 'crop',
  Crate: 'crate',
  Part: 'part',
  /** Power cell (World 5). */
  Cell: 'cell',
  Chip: 'chip',
} as const;
export type ItemKind = (typeof ItemKind)[keyof typeof ItemKind];

export interface Tile {
  terrain: Terrain;
  /** Crop maturity, 0..maxGrowth. `undefined` on non-crop tiles. */
  growth?: number;
  maxGrowth?: number;
  /** What was planted here, for tiles carrying growth. */
  crop?: ItemKind;
  /** Bot id currently standing here, maintained by the Sim. `undefined` when empty. */
  occupant?: number;
  /** Player-written breadcrumb (World 4, `mark()` / `readMark()`). */
  mark?: string;
  /** Level-specific scratch data. Keep it JSON-serializable. */
  meta?: Record<string, number | string | boolean>;
}

/** A quantity of one item kind. Bot and machine inventories are arrays of these. */
export interface ItemStack {
  kind: ItemKind;
  count: number;
}

/** An item stack lying on the ground at a specific tile. */
export interface GroundStack extends ItemStack {
  at: Vec;
}

export const MachineKind = {
  Door: 'door',
  Lever: 'lever',
  Furnace: 'furnace',
  Press: 'press',
  /** Accepts deliveries. Used by the `itemsDelivered` objective. */
  Sink: 'sink',
  /** Emits items. */
  Source: 'source',
  /** Power grid node (World 5). */
  Node: 'node',
  Antenna: 'antenna',
  Charger: 'charger',
  Router: 'router',
} as const;
export type MachineKind = (typeof MachineKind)[keyof typeof MachineKind];

/**
 * Reserved `Machine.vars` key. `1` means the machine is hand-operated: `power()` refuses it and
 * `use()` at its tile is the only thing that moves it.
 *
 * It lives in `vars` rather than in a field of its own because `vars` is the one channel `probe`
 * publishes, and a rule the player cannot read before they break it is not a rule, it is a trap.
 */
export const MANUAL_ONLY = 'manual';

/**
 * Reserved `Machine.vars` key *prefix*. `fed:<machineId>` set to `1` says this machine draws from
 * that one: `use()` at its tile costs its tick and returns false for as long as the named machine
 * is anything but `on`.
 *
 * The id rides in the key rather than in the value because `vars` holds numbers and the fact has
 * to ride somewhere `probe` publishes — a door that refuses for a reason the player cannot read
 * before they hit it is a trap, not a rule, which is the same argument `MANUAL_ONLY` above is
 * made of. `link()` already writes `link:<toId>` into this map, so a keyed id is not a new shape.
 *
 * The refusal is a `false` rather than a throw because it clears: energise the feeder and the
 * identical call works, which is docs/ENGINE.md §2's succeed-later test passing.
 */
export const FED_BY = 'fed:';

export interface Machine {
  id: string;
  kind: MachineKind;
  at: Vec;
  /** Free-form but stable per machine kind: 'idle' | 'on' | 'off' | 'open' | 'closed' | 'busy'. */
  state: string;
  inventory: ItemStack[];
  vars: Record<string, number>;
  facing?: Dir;
  /**
   * States `use()` cycles through, in order. Absent or empty means there is nothing for `use()` to
   * advance, so it returns false and still costs ticks — the same answer it gives for a tile with
   * no machine on it at all. It used to return true and do nothing, which told the player the
   * machine had been operated.
   */
  cycle?: string[];
  /** Tiles whose terrain flips when this machine changes state (e.g. a door opening). */
  links?: Vec[];
}

/** Inter-bot message (World 7). */
export interface Message {
  from: number;
  body: string | number;
  /** Sender clock at the moment of `send`. */
  t: number;
}

export interface Bot {
  id: number;
  name: string;
  at: Vec;
  facing: Dir;
  /** This bot's private virtual clock. DESIGN.md §4.3. */
  clock: number;
  alive: boolean;
  inventory: ItemStack[];
  /** Maximum total item count the inventory may hold. */
  capacity: number;
  /**
   * Remaining fuel. `Infinity` on every level that does not opt into the mechanic, which is most
   * of them. Acting burns fuel equal to the action's tick cost; sensing, waiting and syncing are
   * free. DESIGN.md §4.4.
   */
  fuel: number;
  /** What `refuel()` restores to. `Infinity` when the level does not use fuel. */
  fuelMax: number;
  vars: Record<string, number>;
  inbox: Message[];
}

/** True when a level actually uses the fuel mechanic, i.e. the UI should show a gauge. */
export function usesFuel(world: World): boolean {
  return world.bots.some((bot) => Number.isFinite(bot.fuelMax));
}

export interface World {
  readonly w: number;
  readonly h: number;
  /** Row-major, index = y * w + x. */
  tiles: Tile[];
  bots: Bot[];
  /** Loose items on the ground. */
  items: GroundStack[];
  machines: Machine[];
  /** Global clock. Always `max(bot.clock)`; the makespan. */
  tick: number;
  rng: Rng;
  /** Level-specific scratch state. */
  vars: Record<string, number>;
}
