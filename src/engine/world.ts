import { Rng } from './rng.ts';
import type {
  Bot,
  GroundStack,
  ItemKind,
  ItemStack,
  Machine,
  Message,
  Terrain,
  TerrainProps,
  Tile,
  Vec,
  World,
} from './types.ts';
import { ALL_DIRS, Dir, Terrain as T } from './types.ts';

const DELTAS: Readonly<Record<Dir, Vec>> = Object.freeze({
  [Dir.North]: { x: 0, y: -1 },
  [Dir.East]: { x: 1, y: 0 },
  [Dir.South]: { x: 0, y: 1 },
  [Dir.West]: { x: -1, y: 0 },
});

const DIR_NAMES: Readonly<Record<Dir, string>> = Object.freeze({
  [Dir.North]: 'North',
  [Dir.East]: 'East',
  [Dir.South]: 'South',
  [Dir.West]: 'West',
});

export function dirDelta(dir: Dir): Vec {
  const d = DELTAS[dir];
  return { x: d.x, y: d.y };
}

export function dirName(dir: Dir): string {
  return DIR_NAMES[dir] ?? `Dir(${String(dir)})`;
}

export function opposite(dir: Dir): Dir {
  return ((dir + 2) % 4) as Dir;
}

export function vec(x: number, y: number): Vec {
  return { x, y };
}

export function step(from: Vec, dir: Dir): Vec {
  const d = DELTAS[dir];
  return { x: from.x + d.x, y: from.y + d.y };
}

export function eq(a: Vec, b: Vec): boolean {
  return a.x === b.x && a.y === b.y;
}

export function manhattan(a: Vec, b: Vec): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function dirBetween(a: Vec, b: Vec): Dir | null {
  for (const dir of ALL_DIRS) {
    if (eq(step(a, dir), b)) return dir;
  }
  return null;
}

function props(p: Partial<TerrainProps>): TerrainProps {
  return {
    walkable: false,
    opaque: false,
    mineable: false,
    minesTo: T.Floor,
    yields: null,
    plantable: false,
    lethal: false,
    ...p,
  };
}

export const TERRAIN_PROPS: Readonly<Record<Terrain, TerrainProps>> = Object.freeze({
  [T.Void]: props({ opaque: true }),
  [T.Floor]: props({ walkable: true }),
  [T.Wall]: props({ opaque: true }),
  [T.Pad]: props({ walkable: true }),
  [T.Regolith]: props({ walkable: true, mineable: true, minesTo: T.Floor, yields: 'regolith' }),
  [T.Soil]: props({ walkable: true, plantable: true }),
  [T.Rock]: props({ opaque: true, mineable: true, minesTo: T.Floor, yields: 'stone' }),
  [T.Ore]: props({ opaque: true, mineable: true, minesTo: T.Floor, yields: 'ore' }),
  [T.Rubble]: props({ opaque: true, mineable: true, minesTo: T.Floor, yields: 'scrap' }),
  [T.Ice]: props({ walkable: true, mineable: true, minesTo: T.Floor, yields: 'ice' }),
  [T.Pit]: props({ walkable: true, lethal: true }),
  [T.Cable]: props({ walkable: true }),
  [T.Depot]: props({ walkable: true }),
  [T.Conveyor]: props({ walkable: true }),
});

export function terrainProps(terrain: Terrain): TerrainProps {
  return TERRAIN_PROPS[terrain] ?? TERRAIN_PROPS[T.Void];
}

export interface CreateWorldOptions {
  w: number;
  h: number;
  seed?: number;
  fill?: Terrain;
  vars?: Record<string, number>;
}

export function createWorld(options: CreateWorldOptions): World {
  const { w, h, seed = 0, fill = T.Floor } = options;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) {
    throw new Error(`createWorld: bad dimensions ${w}x${h}`);
  }
  const tiles: Tile[] = new Array<Tile>(w * h);
  for (let i = 0; i < tiles.length; i++) tiles[i] = { terrain: fill };
  return {
    w,
    h,
    tiles,
    bots: [],
    items: [],
    machines: [],
    tick: 0,
    rng: new Rng(seed),
    vars: { ...(options.vars ?? {}) },
  };
}

export interface CreateBotOptions {
  id?: number;
  name?: string;
  at: Vec;
  facing?: Dir;
  capacity?: number;
  inventory?: ItemStack[];
  vars?: Record<string, number>;
  fuel?: number;
  fuelMax?: number;
}

export function addBot(world: World, options: CreateBotOptions): Bot {
  const id = options.id ?? world.bots.length;
  if (world.bots.some((b) => b.id === id)) throw new Error(`addBot: duplicate bot id ${id}`);
  const bot: Bot = {
    id,
    name: options.name ?? `bot-${id}`,
    at: { x: options.at.x, y: options.at.y },
    facing: options.facing ?? Dir.East,
    clock: 0,
    alive: true,
    inventory: (options.inventory ?? []).map((s) => ({ kind: s.kind, count: s.count })),
    capacity: options.capacity ?? 8,
    fuel: options.fuel ?? Number.POSITIVE_INFINITY,
    fuelMax: options.fuelMax ?? options.fuel ?? Number.POSITIVE_INFINITY,
    vars: { ...(options.vars ?? {}) },
    inbox: [],
  };
  world.bots.push(bot);
  const tile = tileAt(world, bot.at);
  if (tile) tile.occupant = id;
  return bot;
}

export function addMachine(world: World, machine: Machine): Machine {
  if (world.machines.some((m) => m.id === machine.id)) {
    throw new Error(`addMachine: duplicate machine id "${machine.id}"`);
  }
  world.machines.push(machine);
  return machine;
}

export function paintAscii(
  world: World,
  rows: readonly string[],
  legend: Record<string, Terrain | (() => Tile)>,
): void {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x] as string;
      const entry = legend[ch];
      if (entry === undefined) throw new Error(`paintAscii: no legend entry for "${ch}"`);
      const tile: Tile = typeof entry === 'function' ? entry() : { terrain: entry };
      setTile(world, { x, y }, tile);
    }
  });
}

export function inBounds(world: World, pos: Vec): boolean {
  return pos.x >= 0 && pos.y >= 0 && pos.x < world.w && pos.y < world.h;
}

export function indexOf(world: World, pos: Vec): number {
  return pos.y * world.w + pos.x;
}

export function tileAt(world: World, pos: Vec): Tile | undefined {
  if (!inBounds(world, pos)) return undefined;
  return world.tiles[indexOf(world, pos)];
}

export function setTile(world: World, pos: Vec, next: Tile): void {
  if (!inBounds(world, pos)) throw new Error(`setTile: ${pos.x},${pos.y} is out of bounds`);
  const i = indexOf(world, pos);
  const previous = world.tiles[i];
  if (next.occupant === undefined && previous?.occupant !== undefined) {
    next.occupant = previous.occupant;
  }
  world.tiles[i] = next;
}

export function setTerrain(world: World, pos: Vec, terrain: Terrain): void {
  const tile = tileAt(world, pos);
  if (!tile) throw new Error(`setTerrain: ${pos.x},${pos.y} is out of bounds`);
  tile.terrain = terrain;
}

export function botAt(world: World, pos: Vec): Bot | undefined {
  const tile = tileAt(world, pos);
  if (tile?.occupant === undefined) return undefined;
  const bot = world.bots.find((b) => b.id === tile.occupant);
  return bot?.alive ? bot : undefined;
}

export function botById(world: World, id: number): Bot | undefined {
  return world.bots.find((b) => b.id === id);
}

export function livingBots(world: World): Bot[] {
  return world.bots.filter((b) => b.alive);
}

export function itemsAt(world: World, pos: Vec): GroundStack[] {
  return world.items.filter((s) => s.at.x === pos.x && s.at.y === pos.y && s.count > 0);
}

export function countItemsAt(world: World, pos: Vec, kind?: ItemKind): number {
  return itemsAt(world, pos).reduce(
    (sum, s) => (kind === undefined || s.kind === kind ? sum + s.count : sum),
    0,
  );
}

export function addGroundItems(world: World, pos: Vec, kind: ItemKind, count: number): void {
  if (count <= 0) return;
  const existing = world.items.find((s) => s.kind === kind && s.at.x === pos.x && s.at.y === pos.y);
  if (existing) {
    existing.count += count;
    return;
  }
  world.items.push({ kind, count, at: { x: pos.x, y: pos.y } });
}

export function removeGroundItems(world: World, pos: Vec, kind: ItemKind, count: number): number {
  let remaining = count;
  for (const stack of world.items) {
    if (remaining <= 0) break;
    if (stack.kind !== kind || stack.at.x !== pos.x || stack.at.y !== pos.y) continue;
    const taken = Math.min(stack.count, remaining);
    stack.count -= taken;
    remaining -= taken;
  }
  world.items = world.items.filter((s) => s.count > 0);
  return count - remaining;
}

export function inventoryCount(holder: { inventory: ItemStack[] }, kind?: ItemKind): number {
  return holder.inventory.reduce(
    (sum, s) => (kind === undefined || s.kind === kind ? sum + s.count : sum),
    0,
  );
}

export function enqueueMessage(bot: { inbox: Message[] }, message: Message): void {
  const at = bot.inbox.findIndex(
    (queued) => queued.t > message.t || (queued.t === message.t && queued.from > message.from),
  );
  if (at < 0) bot.inbox.push(message);
  else bot.inbox.splice(at, 0, message);
}

export function addToInventory(
  holder: { inventory: ItemStack[] },
  kind: ItemKind,
  count: number,
): void {
  if (count <= 0) return;
  const existing = holder.inventory.find((s) => s.kind === kind);
  if (existing) existing.count += count;
  else holder.inventory.push({ kind, count });
}

export function removeFromInventory(
  holder: { inventory: ItemStack[] },
  kind: ItemKind,
  count: number,
): number {
  const existing = holder.inventory.find((s) => s.kind === kind);
  if (!existing) return 0;
  const taken = Math.min(existing.count, count);
  existing.count -= taken;
  if (existing.count === 0) {
    holder.inventory = holder.inventory.filter((s) => s.count > 0);
  }
  return taken;
}

export function machineById(world: World, id: string): Machine | undefined {
  return world.machines.find((m) => m.id === id);
}

export function machineAt(world: World, pos: Vec): Machine | undefined {
  return world.machines.find((m) => m.at.x === pos.x && m.at.y === pos.y);
}

export function neighbors(world: World, pos: Vec): { dir: Dir; pos: Vec }[] {
  const out: { dir: Dir; pos: Vec }[] = [];
  for (const dir of ALL_DIRS) {
    const next = step(pos, dir);
    if (inBounds(world, next)) out.push({ dir, pos: next });
  }
  return out;
}

export function isPassable(world: World, pos: Vec): boolean {
  const tile = tileAt(world, pos);
  return tile !== undefined && terrainProps(tile.terrain).walkable;
}

export function rebuildOccupancy(world: World): void {
  for (const tile of world.tiles) {
    if (tile.occupant !== undefined) delete tile.occupant;
  }
  for (const bot of world.bots) {
    if (!bot.alive) continue;
    const tile = tileAt(world, bot.at);
    if (tile) tile.occupant = bot.id;
  }
}

export function makespan(world: World): number {
  let max = 0;
  for (const bot of world.bots) if (bot.clock > max) max = bot.clock;
  return max;
}

export function cloneTile(tile: Tile): Tile {
  const copy: Tile = { terrain: tile.terrain };
  if (tile.growth !== undefined) copy.growth = tile.growth;
  if (tile.maxGrowth !== undefined) copy.maxGrowth = tile.maxGrowth;
  if (tile.crop !== undefined) copy.crop = tile.crop;
  if (tile.occupant !== undefined) copy.occupant = tile.occupant;
  if (tile.mark !== undefined) copy.mark = tile.mark;
  if (tile.meta !== undefined) copy.meta = { ...tile.meta };
  return copy;
}

function cloneStacks(stacks: readonly ItemStack[]): ItemStack[] {
  const out: ItemStack[] = new Array<ItemStack>(stacks.length);
  for (let i = 0; i < stacks.length; i++) {
    const s = stacks[i] as ItemStack;
    out[i] = { kind: s.kind, count: s.count };
  }
  return out;
}

export function cloneBot(bot: Bot): Bot {
  return {
    id: bot.id,
    name: bot.name,
    at: { x: bot.at.x, y: bot.at.y },
    facing: bot.facing,
    clock: bot.clock,
    alive: bot.alive,
    inventory: cloneStacks(bot.inventory),
    capacity: bot.capacity,
    fuel: bot.fuel,
    fuelMax: bot.fuelMax,
    vars: { ...bot.vars },
    inbox: bot.inbox.map((m) => ({ from: m.from, body: m.body, t: m.t })),
  };
}

export function cloneMachine(machine: Machine): Machine {
  const copy: Machine = {
    id: machine.id,
    kind: machine.kind,
    at: { x: machine.at.x, y: machine.at.y },
    state: machine.state,
    inventory: cloneStacks(machine.inventory),
    vars: { ...machine.vars },
  };
  if (machine.facing !== undefined) copy.facing = machine.facing;
  if (machine.cycle !== undefined) copy.cycle = machine.cycle.slice();
  if (machine.links !== undefined) copy.links = machine.links.map((v) => ({ x: v.x, y: v.y }));
  return copy;
}

export function reviveWorld(world: World): World {
  world.rng = Rng.of(world.rng);
  return world;
}

export function cloneWorld(world: World): World {
  const tiles: Tile[] = new Array<Tile>(world.tiles.length);
  for (let i = 0; i < world.tiles.length; i++) tiles[i] = cloneTile(world.tiles[i] as Tile);

  const bots: Bot[] = new Array<Bot>(world.bots.length);
  for (let i = 0; i < world.bots.length; i++) bots[i] = cloneBot(world.bots[i] as Bot);

  const items: GroundStack[] = new Array<GroundStack>(world.items.length);
  for (let i = 0; i < world.items.length; i++) {
    const s = world.items[i] as GroundStack;
    items[i] = { kind: s.kind, count: s.count, at: { x: s.at.x, y: s.at.y } };
  }

  const machines: Machine[] = new Array<Machine>(world.machines.length);
  for (let i = 0; i < world.machines.length; i++) {
    machines[i] = cloneMachine(world.machines[i] as Machine);
  }

  return {
    w: world.w,
    h: world.h,
    tiles,
    bots,
    items,
    machines,
    tick: world.tick,
    rng: Rng.of(world.rng).clone(),
    vars: { ...world.vars },
  };
}
