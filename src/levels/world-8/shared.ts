import type {
  Dir,
  ItemKind,
  Machine,
  ObjectiveContext,
  Sim,
  TileView,
  Vec,
  World,
} from '../../engine/index.ts';
import {
  ALL_DIRS,
  Rng,
  Terrain,
  dirBetween,
  inBounds,
  isPassable,
  setTerrain,
  step,
  terrainProps,
  tileAt,
} from '../../engine/index.ts';

/**
 * Shared toolkit for World 8.
 *
 * Three groups live here, and the split matters:
 *
 * - **Authoring** (`localRng`, `carveCaves`, `encodeCaesar`, `checksum`) runs inside `build(seed)`
 *   and may read the world freely.
 * - **Adjudication** (`blockedMoves`, `sightingTick`, `useLog`, ...) runs inside objectives, which
 *   see `world`, `initialWorld` and `trace` and nothing else.
 * - **Piloting** (`KnownMap`, `follow`) is what the reference solutions use. It deliberately
 *   reads *only* what the player's API exposes — `scan`, `look`, `probe`, `canMove` — so a
 *   reference solution can never path through a wall it has not actually seen. Nothing in this
 *   group touches `sim.world`.
 */

export const key = (at: Vec): string => `${at.x},${at.y}`;

/** Build-time randomness. Never consume `world.rng`: replay depends on it staying untouched. */
export function localRng(seed: number): Rng {
  return new Rng(seed * 7919 + 13);
}

// ---------------------------------------------------------------------------
// Geometry over an arbitrary passability predicate
// ---------------------------------------------------------------------------

export interface Grid {
  w: number;
  h: number;
}

function within(grid: Grid, at: Vec): boolean {
  return at.x >= 0 && at.y >= 0 && at.x < grid.w && at.y < grid.h;
}

/** Breadth-first shortest route as a list of steps, or null when `to` is unreachable. */
export function pathOn(
  grid: Grid,
  passable: (at: Vec) => boolean,
  from: Vec,
  to: Vec,
): Dir[] | null {
  if (from.x === to.x && from.y === to.y) return [];
  if (!passable(to)) return null;
  const cameFrom = new Map<number, number>();
  const start = from.y * grid.w + from.x;
  const goal = to.y * grid.w + to.x;
  const queue: Vec[] = [from];
  cameFrom.set(start, -1);
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head] as Vec;
    if (at.x === to.x && at.y === to.y) break;
    for (const dir of ALL_DIRS) {
      const next = step(at, dir);
      if (!within(grid, next)) continue;
      const index = next.y * grid.w + next.x;
      if (cameFrom.has(index)) continue;
      if (!passable(next)) continue;
      cameFrom.set(index, at.y * grid.w + at.x);
      queue.push(next);
    }
  }
  if (!cameFrom.has(goal)) return null;

  const reversed: Dir[] = [];
  let cursor = goal;
  while (cursor !== start) {
    const previous = cameFrom.get(cursor);
    if (previous === undefined || previous < 0) break;
    const a = { x: previous % grid.w, y: Math.floor(previous / grid.w) };
    const b = { x: cursor % grid.w, y: Math.floor(cursor / grid.w) };
    const dir = dirBetween(a, b);
    if (dir === null) break;
    reversed.push(dir);
    cursor = previous;
  }
  reversed.reverse();
  return reversed;
}

/** Hop count from `from` to every reachable tile, keyed by `y * w + x`. */
export function distancesOn(
  grid: Grid,
  passable: (at: Vec) => boolean,
  from: Vec,
): Map<number, number> {
  const out = new Map<number, number>();
  out.set(from.y * grid.w + from.x, 0);
  const queue: Vec[] = [from];
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head] as Vec;
    const base = out.get(at.y * grid.w + at.x) ?? 0;
    for (const dir of ALL_DIRS) {
      const next = step(at, dir);
      if (!within(grid, next)) continue;
      const index = next.y * grid.w + next.x;
      if (out.has(index)) continue;
      if (!passable(next)) continue;
      out.set(index, base + 1);
      queue.push(next);
    }
  }
  return out;
}

/** Authoring/adjudication convenience: distances over the world's real terrain. */
export function worldDistances(world: World, from: Vec): Map<number, number> {
  return distancesOn(world, (at) => isPassable(world, at), from);
}

export function worldDistance(world: World, from: Vec, to: Vec): number {
  const reached = worldDistances(world, from).get(to.y * world.w + to.x);
  return reached === undefined ? -1 : reached;
}

export function reachableTiles(world: World, from: Vec): Vec[] {
  const out: Vec[] = [];
  for (const index of worldDistances(world, from).keys()) {
    out.push({ x: index % world.w, y: Math.floor(index / world.w) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Authoring: cave carving
// ---------------------------------------------------------------------------

export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function roomCentre(room: Room): Vec {
  return { x: room.x + (room.w >> 1), y: room.y + (room.h >> 1) };
}

export interface CarveOptions {
  rooms: number;
  minSize: number;
  maxSize: number;
  margin?: number;
  floor?: Terrain;
}

/**
 * Carves rectangular rooms out of whatever the world is filled with and joins them with L-shaped
 * corridors, in the order they were placed. Corridor-joining every room to its predecessor is what
 * guarantees the result is one connected component, which every World 8 objective assumes.
 */
export function carveCaves(world: World, rng: Rng, options: CarveOptions): Room[] {
  const margin = options.margin ?? 1;
  const floor = options.floor ?? Terrain.Floor;
  const rooms: Room[] = [];

  for (let attempt = 0; attempt < options.rooms * 12 && rooms.length < options.rooms; attempt++) {
    const w = rng.int(options.minSize, options.maxSize);
    const h = rng.int(options.minSize, options.maxSize);
    const x = rng.int(margin, world.w - w - margin - 1);
    const y = rng.int(margin, world.h - h - margin - 1);
    const candidate: Room = { x, y, w, h };
    const clashes = rooms.some(
      (room) =>
        candidate.x <= room.x + room.w &&
        room.x <= candidate.x + candidate.w &&
        candidate.y <= room.y + room.h &&
        room.y <= candidate.y + candidate.h,
    );
    if (clashes) continue;
    rooms.push(candidate);
  }

  for (const room of rooms) {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) setTerrain(world, { x, y }, floor);
    }
  }

  for (let i = 1; i < rooms.length; i++) {
    const a = roomCentre(rooms[i - 1] as Room);
    const b = roomCentre(rooms[i] as Room);
    const horizontalFirst = rng.chance(0.5);
    const corner = horizontalFirst ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
    carveLine(world, a, corner, floor);
    carveLine(world, corner, b, floor);
  }

  return rooms;
}

export function carveLine(world: World, from: Vec, to: Vec, floor: Terrain = Terrain.Floor): void {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  let at = { x: from.x, y: from.y };
  setTerrain(world, at, floor);
  while (at.x !== to.x) {
    at = { x: at.x + dx, y: at.y };
    setTerrain(world, at, floor);
  }
  while (at.y !== to.y) {
    at = { x: at.x, y: at.y + dy };
    setTerrain(world, at, floor);
  }
}

/** Every walkable tile connected to `from`, shuffled, for scattering contents deterministically. */
export function scatterCandidates(world: World, from: Vec, rng: Rng): Vec[] {
  return rng.shuffle(reachableTiles(world, from));
}

// ---------------------------------------------------------------------------
// Authoring: the packet format World 6 taught and World 8 reuses
// ---------------------------------------------------------------------------

export const PACKET_HEADER = 'KD4470';
export const PACKET_SEPARATOR = '|';
/** The whole keyspace of the runtime's Caesar shift: printable ASCII 32..126. */
export const KEY_SPACE = 95;

/** Inverse of the runtime's `decode`. Author packets with this, decipher them with that. */
export function encodeCaesar(text: string, cipherKey: number): string {
  const shift = ((Math.trunc(cipherKey) % KEY_SPACE) + KEY_SPACE) % KEY_SPACE;
  let out = '';
  for (const character of text) {
    const code = character.charCodeAt(0);
    if (code < 32 || code > 126) {
      out += character;
      continue;
    }
    out += String.fromCharCode(((code - 32 + shift) % KEY_SPACE) + 32);
  }
  return out;
}

/** Sum of the character codes, modulo 1000. Stated in full in the briefs that use it. */
export function checksum(text: string): number {
  let total = 0;
  for (const character of text) total += character.charCodeAt(0);
  return total % 1000;
}

/** `KD4470|a|b|c` -> `KD4470|a|b|c|<checksum of everything before the last separator>`. */
export function sealPacket(fields: readonly (string | number)[]): string {
  const body = [PACKET_HEADER, ...fields].join(PACKET_SEPARATOR);
  return `${body}${PACKET_SEPARATOR}${String(checksum(body))}`;
}

/** Splits a decoded packet and reports whether the header and the checksum both hold. */
export function readPacket(text: string): { fields: string[]; valid: boolean } {
  const parts = text.split(PACKET_SEPARATOR);
  const last = parts[parts.length - 1];
  if (parts.length < 2 || last === undefined) return { fields: parts, valid: false };
  const body = parts.slice(0, -1).join(PACKET_SEPARATOR);
  const valid = parts[0] === PACKET_HEADER && String(checksum(body)) === last;
  return { fields: parts.slice(1, -1), valid };
}

/**
 * What the runtime's `receive()` does, for a reference solution that drives the `Sim` directly.
 *
 * The inbound queue lives in the antenna tile's `meta` (`rx` newline-separated, `rxNext` the read
 * cursor), and the cursor moves through `applyTileChange` so the read lands in the trace and a
 * replay sees the same packets. Kept here rather than in a fixture so the level that authors the
 * queue and the solution that drains it read the same two field names.
 */
export function receivePacket(sim: Sim, botId: number, antennaId = 'antenna'): string | null {
  const antenna = sim.probe(botId, antennaId);
  if (!antenna) return null;
  const tile = tileAt(sim.world, antenna.at);
  const queued = typeof tile?.meta?.['rx'] === 'string' ? tile.meta['rx'] : '';
  if (queued === '') return null;
  const packets = queued.split('\n');
  const next = typeof tile?.meta?.['rxNext'] === 'number' ? tile.meta['rxNext'] : 0;
  if (next >= packets.length) return null;
  sim.applyTileChange(antenna.at, (target) => {
    target.meta = { ...(target.meta ?? {}), rxNext: next + 1 };
  });
  return packets[next] as string;
}

/** Everything still queued on the antenna, in order. */
export function drainAntenna(sim: Sim, botId: number, antennaId = 'antenna'): string[] {
  const out: string[] = [];
  for (;;) {
    const packet = receivePacket(sim, botId, antennaId);
    if (packet === null) break;
    out.push(packet);
  }
  return out;
}

/** Loads an already-enciphered packet stream onto an antenna tile, where `receive()` finds it. */
export function loadAntenna(world: World, at: Vec, packets: readonly string[]): void {
  const tile = tileAt(world, at);
  if (!tile) throw new Error(`loadAntenna: ${key(at)} is out of bounds`);
  tile.meta = { ...(tile.meta ?? {}), rx: packets.join('\n'), rxNext: 0 };
}

// ---------------------------------------------------------------------------
// Piloting: the map a reference solution is allowed to have
// ---------------------------------------------------------------------------

/**
 * Everything the fleet has actually looked at, and nothing else.
 *
 * A reference solution that pathed over `sim.world` would be solving a different puzzle from the
 * player's, so this is the only map the World 8 solutions get. It is fed exclusively by `scan` and
 * `look`, both of which are free, and unknown tiles are treated as impassable until seen.
 */
export class KnownMap {
  readonly w: number;
  readonly h: number;
  private readonly seen = new Map<number, TileView>();

  constructor(grid: Grid) {
    this.w = grid.w;
    this.h = grid.h;
  }

  private index(at: Vec): number {
    return at.y * this.w + at.x;
  }

  inBounds(at: Vec): boolean {
    return within(this, at);
  }

  view(at: Vec): TileView | undefined {
    return this.seen.get(this.index(at));
  }

  known(at: Vec): boolean {
    return this.seen.has(this.index(at));
  }

  record(view: TileView): void {
    if (!view.inBounds) return;
    this.seen.set(this.index(view.at), view);
  }

  /** Free. Records the bot's own tile plus four rays, each stopping at the first opaque tile. */
  observe(sim: Sim, botId: number, range = 64): void {
    this.record(sim.scan(botId));
    for (const dir of ALL_DIRS) {
      for (const view of sim.look(botId, dir, range)) this.record(view);
    }
  }

  passable(at: Vec): boolean {
    return this.view(at)?.walkable === true;
  }

  /** A known-walkable tile with at least one unknown in-bounds neighbour: somewhere to go next. */
  isFrontier(at: Vec): boolean {
    if (!this.passable(at)) return false;
    for (const dir of ALL_DIRS) {
      const next = step(at, dir);
      if (within(this, next) && !this.known(next)) return true;
    }
    return false;
  }

  pathTo(from: Vec, to: Vec): Dir[] | null {
    return pathOn(this, (at) => this.passable(at), from, to);
  }

  /** Route to the nearest frontier tile, or null when the known region has no unseen edge left. */
  pathToFrontier(from: Vec): Dir[] | null {
    return this.pathToNearest(from, (at) => this.isFrontier(at));
  }

  /** Breadth-first route to the closest known tile satisfying `wanted`. */
  pathToNearest(from: Vec, wanted: (at: Vec) => boolean): Dir[] | null {
    if (wanted(from)) return [];
    const cameFrom = new Map<number, number>();
    cameFrom.set(this.index(from), -1);
    const queue: Vec[] = [from];
    let goal: Vec | null = null;
    for (let head = 0; head < queue.length && goal === null; head++) {
      const at = queue[head] as Vec;
      for (const dir of ALL_DIRS) {
        const next = step(at, dir);
        if (!within(this, next)) continue;
        const index = this.index(next);
        if (cameFrom.has(index)) continue;
        if (!this.passable(next)) continue;
        cameFrom.set(index, this.index(at));
        if (wanted(next)) {
          goal = next;
          break;
        }
        queue.push(next);
      }
    }
    if (goal === null) return null;
    return this.pathTo(from, goal);
  }

  /** Every tile seen so far that matches `pred`, in observation order. */
  where(pred: (view: TileView) => boolean): TileView[] {
    const out: TileView[] = [];
    for (const view of this.seen.values()) if (pred(view)) out.push(view);
    return out;
  }

  size(): number {
    return this.seen.size;
  }
}

export interface FollowOptions {
  /** Ticks to spend waiting on a tile another bot is holding before re-planning. */
  patience?: number;
  /** Called after every successful step, so a caller can keep looking as it walks. */
  onStep?: (at: Vec) => void;
}

/**
 * Walks `botId` to `to` over the known map, yielding rather than colliding.
 *
 * `canMove` is free and truthful, so the bot never issues a move it knows will fail — which is
 * both cheaper (a blocked move still costs a tick) and what the fleet levels' "no blocked moves"
 * bonus asks for. Returns false when the target is unreachable through known ground.
 */
export function follow(
  sim: Sim,
  botId: number,
  map: KnownMap,
  to: Vec,
  options: FollowOptions = {},
): boolean {
  const patience = options.patience ?? 4;
  const guardLimit = (map.w + map.h) * 8;
  let path = map.pathTo(sim.pos(botId), to);
  if (path === null) return false;
  let cursor = 0;
  let stalls = 0;
  let guard = 0;

  while (cursor < path.length) {
    if (guard++ > guardLimit) return false;
    const dir = path[cursor] as Dir;
    if (sim.canMove(botId, dir)) {
      sim.move(botId, dir);
      cursor++;
      stalls = 0;
      options.onStep?.(sim.pos(botId));
      continue;
    }
    stalls++;
    if (stalls > patience) {
      const replanned = map.pathTo(sim.pos(botId), to);
      if (replanned === null) return false;
      path = replanned;
      cursor = 0;
      stalls = 0;
      continue;
    }
    sim.wait(botId, 1);
  }
  return true;
}

/** Follows a route the caller already computed. Same yielding discipline as `follow`. */
export function followPath(sim: Sim, botId: number, path: readonly Dir[], patience = 4): boolean {
  for (const dir of path) {
    let stalls = 0;
    while (!sim.canMove(botId, dir)) {
      if (stalls++ >= patience) return false;
      sim.wait(botId, 1);
    }
    sim.move(botId, dir);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Adjudication: reading the trace
// ---------------------------------------------------------------------------

export function blockedMoves(ctx: ObjectiveContext): number {
  return ctx.trace.events.filter((event) => event.kind === 'move' && !event.ok).length;
}

export interface UseRecord {
  t: number;
  /** The tick the operation *finished*, which is what precedence rules compare against. */
  done: number;
  botId: number;
  machineId: string;
}

/** Every successful `use`, in trace order. */
export function useLog(ctx: ObjectiveContext): UseRecord[] {
  const out: UseRecord[] = [];
  for (const event of ctx.trace.events) {
    if (event.kind !== 'use' || !event.ok || event.machineId === null) continue;
    out.push({
      t: event.t,
      done: event.t + event.dt,
      botId: event.botId,
      machineId: event.machineId,
    });
  }
  return out;
}

export interface TransferRecord {
  t: number;
  botId: number;
  at: Vec;
  item: ItemKind;
  count: number;
}

function transfers(ctx: ObjectiveContext, kind: 'drop' | 'pickup'): TransferRecord[] {
  const out: TransferRecord[] = [];
  for (const event of ctx.trace.events) {
    if (event.kind !== kind || !event.ok || event.item === null) continue;
    out.push({
      t: event.t,
      botId: event.botId,
      at: event.at,
      item: event.item,
      count: event.count,
    });
  }
  return out;
}

export function dropLog(ctx: ObjectiveContext): TransferRecord[] {
  return transfers(ctx, 'drop');
}

export function pickupLog(ctx: ObjectiveContext): TransferRecord[] {
  return transfers(ctx, 'pickup');
}

/** Distinct tiles any bot stood on, start positions included. */
export function tilesEntered(ctx: ObjectiveContext): Set<string> {
  const seen = new Set<string>();
  for (const bot of ctx.initialWorld.bots) seen.add(key(bot.at));
  for (const event of ctx.trace.events) {
    if (event.kind === 'move' && event.ok) seen.add(key(event.to));
  }
  return seen;
}

/** Total moves issued, blocked ones included — the honest measure of walking done. */
export function moveCount(ctx: ObjectiveContext): number {
  return ctx.trace.events.filter((event) => event.kind === 'move').length;
}

interface Sighting {
  at: Vec;
  t: number;
}

function lineOfSight(world: World, from: Vec, range: number): Sighting[] {
  const out: Sighting[] = [{ at: from, t: 0 }];
  for (const dir of ALL_DIRS) {
    let at = from;
    for (let i = 0; i < range; i++) {
      at = step(at, dir);
      if (!inBounds(world, at)) break;
      out.push({ at, t: 0 });
      const tile = tileAt(world, at);
      if (tile && terrainProps(tile.terrain).opaque) break;
    }
  }
  return out;
}

/**
 * The earliest tick by which every tile in `targets` had been in some bot's line of sight.
 *
 * Reconstructed from the movement trace against the *initial* terrain, so it is the earliest
 * moment the fleet's path could possibly have revealed them — which is the fairest reading when
 * the sensing calls themselves leave no trace. `Infinity` when one was never in view.
 */
export function sightingTick(ctx: ObjectiveContext, targets: readonly Vec[], range = 64): number {
  const wanted = new Set(targets.map(key));
  if (wanted.size === 0) return 0;
  let latest = 0;

  const note = (from: Vec, t: number): void => {
    for (const sighting of lineOfSight(ctx.initialWorld, from, range)) {
      const id = key(sighting.at);
      if (!wanted.delete(id)) continue;
      if (t > latest) latest = t;
    }
  };

  for (const bot of ctx.initialWorld.bots) note(bot.at, 0);
  for (const event of ctx.trace.events) {
    if (wanted.size === 0) break;
    if (event.kind !== 'move' || !event.ok) continue;
    note(event.to, event.t + event.dt);
  }
  return wanted.size === 0 ? latest : Number.POSITIVE_INFINITY;
}

/**
 * Per-bot idle time as a fraction of the makespan: waiting, syncing, and the tail a bot spends
 * finished while the rest of the fleet is still out. The fleet-utilisation measure.
 */
export function worstIdleFraction(ctx: ObjectiveContext): number {
  const span = ctx.trace.endTick;
  if (span <= 0) return 0;
  const idle = new Map<number, number>();
  for (const bot of ctx.world.bots) idle.set(bot.id, span - bot.clock);
  for (const event of ctx.trace.events) {
    if (event.kind !== 'wait' && event.kind !== 'sync') continue;
    idle.set(event.botId, (idle.get(event.botId) ?? 0) + event.dt);
  }
  let worst = 0;
  for (const value of idle.values()) worst = Math.max(worst, value / span);
  return worst;
}

// ---------------------------------------------------------------------------
// Adjudication: machines and stock
// ---------------------------------------------------------------------------

export function machinesWithPrefix(world: World, prefix: string): Machine[] {
  return world.machines
    .filter((machine) => machine.id.startsWith(prefix))
    .sort((a, b) => a.id.localeCompare(b.id, 'en'));
}

/** Reads a `node` machine's published dependency list back out of `vars`. */
export function dependenciesOf(machine: Machine): string[] {
  const count = machine.vars['deps'] ?? 0;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const index = machine.vars[`dep${i}`];
    if (index !== undefined) out.push(`sub-${index}`);
  }
  return out;
}

/** Longest chain of dependencies, measured in stations. 1 for a graph with no edges. */
export function criticalChain(world: World, prefix = 'sub-'): number {
  const stations = machinesWithPrefix(world, prefix);
  const depth = new Map<string, number>();
  const resolve = (id: string, guard: number): number => {
    const cached = depth.get(id);
    if (cached !== undefined) return cached;
    if (guard > stations.length) return 1;
    const machine = stations.find((m) => m.id === id);
    if (!machine) return 1;
    let best = 0;
    for (const dep of dependenciesOf(machine)) best = Math.max(best, resolve(dep, guard + 1));
    const value = best + 1;
    depth.set(id, value);
    return value;
  };
  let longest = 0;
  for (const station of stations) longest = Math.max(longest, resolve(station.id, 0));
  return longest;
}

export function itemsOnTile(world: World, at: Vec, kind?: ItemKind): number {
  return world.items.reduce(
    (sum, stack) =>
      stack.at.x === at.x && stack.at.y === at.y && (kind === undefined || stack.kind === kind)
        ? sum + stack.count
        : sum,
    0,
  );
}

/** Every loose stack in the world, by kind. Used for "the crates that were here at start". */
export function groundCensus(world: World, kinds: readonly ItemKind[]): Map<ItemKind, number> {
  const census = new Map<ItemKind, number>();
  for (const kind of kinds) census.set(kind, 0);
  for (const stack of world.items) {
    if (!census.has(stack.kind)) continue;
    census.set(stack.kind, (census.get(stack.kind) ?? 0) + stack.count);
  }
  return census;
}
