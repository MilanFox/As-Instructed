import type { Dir, Rng, Vec, World } from '../../engine/index.ts';
import {
  ALL_DIRS,
  Dir as D,
  Terrain,
  inBounds,
  setTerrain,
  step,
  terrainProps,
  tileAt,
} from '../../engine/index.ts';

/**
 * Seeded cave generation for World 4.
 *
 * Everything here is a pure function of an `Rng` plus its parameters, so `LevelDef.build(seed)`
 * stays byte-reproducible. Nothing in this file touches the Sim.
 *
 * The whole world uses one layout convention: a grid of `cw x ch` **cells**, where cell (i, j)
 * lives at tile `(2i + 1, 2j + 1)`. Between two orthogonally adjacent cells sits a single
 * **connector** tile which is either carved (floor) or left solid. Tiles with both coordinates
 * even are **pillars** and are never carved. That gives corridors exactly one tile wide, which is
 * what makes `look()` read as a headlamp beam rather than a floodlight.
 */

export interface Cell {
  i: number;
  j: number;
}

export interface CellGrid {
  readonly cw: number;
  readonly ch: number;
  /** Cell (i, j) is part of the cave at all. Row-major, index = j * cw + i. */
  open: boolean[];
  /** The connector between (i, j) and (i + 1, j) is carved. Only meaningful for i < cw - 1. */
  east: boolean[];
  /** The connector between (i, j) and (i, j + 1) is carved. Only meaningful for j < ch - 1. */
  south: boolean[];
}

export function cellIndex(grid: CellGrid, i: number, j: number): number {
  return j * grid.cw + i;
}

/** The tile a cell occupies. */
export function cellTile(i: number, j: number): Vec {
  return { x: 2 * i + 1, y: 2 * j + 1 };
}

/** The tile coordinate a cell would have, back-converted. Only valid on odd/odd tiles. */
export function tileCell(at: Vec): Cell {
  return { i: (at.x - 1) / 2, j: (at.y - 1) / 2 };
}

/** Tile dimensions of a cell grid, before any padding a level adds. */
export function gridExtent(grid: CellGrid): { w: number; h: number } {
  return { w: 2 * grid.cw + 1, h: 2 * grid.ch + 1 };
}

export function inCellBounds(grid: CellGrid, i: number, j: number): boolean {
  return i >= 0 && j >= 0 && i < grid.cw && j < grid.ch;
}

export function newCellGrid(cw: number, ch: number, open = true): CellGrid {
  return {
    cw,
    ch,
    open: new Array<boolean>(cw * ch).fill(open),
    east: new Array<boolean>(cw * ch).fill(false),
    south: new Array<boolean>(cw * ch).fill(false),
  };
}

export function isOpen(grid: CellGrid, i: number, j: number): boolean {
  return inCellBounds(grid, i, j) && grid.open[cellIndex(grid, i, j)] === true;
}

/** Is the wall between (i, j) and its neighbour in `dir` carved away? */
export function linked(grid: CellGrid, i: number, j: number, dir: Dir): boolean {
  switch (dir) {
    case D.East:
      return i + 1 < grid.cw && grid.east[cellIndex(grid, i, j)] === true;
    case D.West:
      return i - 1 >= 0 && grid.east[cellIndex(grid, i - 1, j)] === true;
    case D.South:
      return j + 1 < grid.ch && grid.south[cellIndex(grid, i, j)] === true;
    case D.North:
      return j - 1 >= 0 && grid.south[cellIndex(grid, i, j - 1)] === true;
  }
}

export function link(grid: CellGrid, i: number, j: number, dir: Dir, value = true): void {
  switch (dir) {
    case D.East:
      if (i + 1 < grid.cw) grid.east[cellIndex(grid, i, j)] = value;
      return;
    case D.West:
      if (i - 1 >= 0) grid.east[cellIndex(grid, i - 1, j)] = value;
      return;
    case D.South:
      if (j + 1 < grid.ch) grid.south[cellIndex(grid, i, j)] = value;
      return;
    case D.North:
      if (j - 1 >= 0) grid.south[cellIndex(grid, i, j - 1)] = value;
      return;
  }
}

export function cellStep(cell: Cell, dir: Dir): Cell {
  switch (dir) {
    case D.North:
      return { i: cell.i, j: cell.j - 1 };
    case D.East:
      return { i: cell.i + 1, j: cell.j };
    case D.South:
      return { i: cell.i, j: cell.j + 1 };
    case D.West:
      return { i: cell.i - 1, j: cell.j };
  }
}

/** Directions in which this cell is carved through to a neighbour. */
export function linkDirs(grid: CellGrid, i: number, j: number): Dir[] {
  return ALL_DIRS.filter((dir) => linked(grid, i, j, dir));
}

/** Cells with exactly one way in and out. Where a level hides something worth finding. */
export function deadEndCells(grid: CellGrid): Cell[] {
  const out: Cell[] = [];
  for (let j = 0; j < grid.ch; j++) {
    for (let i = 0; i < grid.cw; i++) {
      if (!isOpen(grid, i, j)) continue;
      if (linkDirs(grid, i, j).length === 1) out.push({ i, j });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Randomized depth-first search over every cell. The carved connectors form a spanning tree, so
 * the floor graph is a tree: connected, and with no cycle anywhere in it. `addCycles` is the only
 * thing that puts a loop in one, so a caller that never calls it gets that guarantee structurally
 * rather than by checking after the fact.
 */
export function carvePerfectMaze(rng: Rng, cw: number, ch: number): CellGrid {
  const grid = newCellGrid(cw, ch);
  const seen = new Set<number>();
  const start: Cell = { i: rng.int(0, cw - 1), j: rng.int(0, ch - 1) };
  const stack: Cell[] = [start];
  seen.add(cellIndex(grid, start.i, start.j));

  while (stack.length > 0) {
    const cell = stack[stack.length - 1] as Cell;
    const options = rng
      .shuffle(ALL_DIRS)
      .filter((dir) => {
        const next = cellStep(cell, dir);
        return inCellBounds(grid, next.i, next.j) && !seen.has(cellIndex(grid, next.i, next.j));
      });
    const dir = options[0];
    if (dir === undefined) {
      stack.pop();
      continue;
    }
    const next = cellStep(cell, dir);
    link(grid, cell.i, cell.j, dir);
    seen.add(cellIndex(grid, next.i, next.j));
    stack.push(next);
  }
  return grid;
}

/**
 * Knocks `count` further connectors out of a spanning tree. Every one of them joins two cells
 * that were already connected, so the floor graph gains exactly `count` independent cycles.
 * Returns how many were actually carved, which is lower only on a grid with no walls left.
 */
export function addCycles(rng: Rng, grid: CellGrid, count: number): number {
  const closed: { cell: Cell; dir: Dir }[] = [];
  for (let j = 0; j < grid.ch; j++) {
    for (let i = 0; i < grid.cw; i++) {
      if (i + 1 < grid.cw && !linked(grid, i, j, D.East)) {
        closed.push({ cell: { i, j }, dir: D.East });
      }
      if (j + 1 < grid.ch && !linked(grid, i, j, D.South)) {
        closed.push({ cell: { i, j }, dir: D.South });
      }
    }
  }
  const chosen = rng.shuffle(closed).slice(0, count);
  for (const { cell, dir } of chosen) link(grid, cell.i, cell.j, dir);
  return chosen.length;
}

/**
 * A single self-avoiding walk of exactly `cells` cells: one tunnel, no branches, no cycles.
 *
 * Depth-first with backtracking, so it always finds a path of the requested length on a grid
 * with room for one. Cells the walk passes near but does not enter stay solid, and because two
 * cells are two tiles apart the corridor never touches itself.
 */
export function carveTunnel(
  rng: Rng,
  cw: number,
  ch: number,
  cells: number,
): { grid: CellGrid; path: Cell[] } {
  const grid = newCellGrid(cw, ch, false);
  const start: Cell = { i: rng.int(0, cw - 1), j: rng.int(0, ch - 1) };
  const frames: { cell: Cell; options: Dir[] }[] = [{ cell: start, options: rng.shuffle(ALL_DIRS) }];
  const onPath = new Set<number>([cellIndex(grid, start.i, start.j)]);

  while (frames.length > 0 && frames.length < cells) {
    const top = frames[frames.length - 1] as { cell: Cell; options: Dir[] };
    const dir = top.options.pop();
    if (dir === undefined) {
      onPath.delete(cellIndex(grid, top.cell.i, top.cell.j));
      frames.pop();
      continue;
    }
    const next = cellStep(top.cell, dir);
    if (!inCellBounds(grid, next.i, next.j)) continue;
    if (onPath.has(cellIndex(grid, next.i, next.j))) continue;
    onPath.add(cellIndex(grid, next.i, next.j));
    frames.push({ cell: next, options: rng.shuffle(ALL_DIRS) });
  }

  const path = frames.map((frame) => frame.cell);
  for (const cell of path) grid.open[cellIndex(grid, cell.i, cell.j)] = true;
  for (let n = 1; n < path.length; n++) {
    const previous = path[n - 1] as Cell;
    const current = path[n] as Cell;
    const dir = ALL_DIRS.find((d) => {
      const probe = cellStep(previous, d);
      return probe.i === current.i && probe.j === current.j;
    });
    if (dir !== undefined) link(grid, previous.i, previous.j, dir);
  }
  return { grid, path };
}

// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------

/** Every tile the cave occupies: cell tiles plus the connectors carved between them. */
export function caveFloorTiles(grid: CellGrid): Vec[] {
  const out: Vec[] = [];
  for (let j = 0; j < grid.ch; j++) {
    for (let i = 0; i < grid.cw; i++) {
      if (!isOpen(grid, i, j)) continue;
      out.push(cellTile(i, j));
      if (linked(grid, i, j, D.East)) out.push({ x: 2 * i + 2, y: 2 * j + 1 });
      if (linked(grid, i, j, D.South)) out.push({ x: 2 * i + 1, y: 2 * j + 2 });
    }
  }
  return out;
}

/** Carves `grid` into an already solid world. The caller fills the world with rock first. */
export function paintCave(world: World, grid: CellGrid, floor: Terrain = Terrain.Floor): void {
  for (const at of caveFloorTiles(grid)) {
    if (inBounds(world, at)) setTerrain(world, at, floor);
  }
}

// ---------------------------------------------------------------------------
// Graph queries over a built world
// ---------------------------------------------------------------------------

export function keyOf(at: Vec): string {
  return `${at.x},${at.y}`;
}

export function parseKey(key: string): Vec {
  const [x = '0', y = '0'] = key.split(',');
  return { x: Number(x), y: Number(y) };
}

export function walkableNeighbours(world: World, at: Vec): Vec[] {
  const out: Vec[] = [];
  for (const dir of ALL_DIRS) {
    const next = step(at, dir);
    const tile = tileAt(world, next);
    if (tile && terrainProps(tile.terrain).walkable) out.push(next);
  }
  return out;
}

/** Breadth-first tick distance from `from` to every reachable walkable tile. */
export function distancesFrom(world: World, from: Vec): Map<string, number> {
  const dist = new Map<string, number>([[keyOf(from), 0]]);
  const queue: Vec[] = [from];
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head] as Vec;
    const base = dist.get(keyOf(at)) ?? 0;
    for (const next of walkableNeighbours(world, at)) {
      const key = keyOf(next);
      if (dist.has(key)) continue;
      dist.set(key, base + 1);
      queue.push(next);
    }
  }
  return dist;
}

/** Shortest walkable route, excluding `from` and including `to`. Null when unreachable. */
export function pathBetween(world: World, from: Vec, to: Vec): Vec[] | null {
  const previous = new Map<string, string>();
  const seen = new Set<string>([keyOf(from)]);
  const queue: Vec[] = [from];
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head] as Vec;
    if (at.x === to.x && at.y === to.y) break;
    for (const next of walkableNeighbours(world, at)) {
      const key = keyOf(next);
      if (seen.has(key)) continue;
      seen.add(key);
      previous.set(key, keyOf(at));
      queue.push(next);
    }
  }
  if (!seen.has(keyOf(to))) return null;
  const route: Vec[] = [];
  let cursor = keyOf(to);
  while (cursor !== keyOf(from)) {
    route.push(parseKey(cursor));
    const back = previous.get(cursor);
    if (back === undefined) return null;
    cursor = back;
  }
  return route.reverse();
}

export interface FloorGraphSummary {
  nodes: number;
  edges: number;
  components: number;
  /** Independent cycles: edges - nodes + components. Zero means every component is a tree. */
  cycles: number;
}

/** Structural summary of everything walkable in a world. The generator tests read this. */
export function floorGraphSummary(world: World): FloorGraphSummary {
  const tiles: Vec[] = [];
  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      const tile = tileAt(world, { x, y });
      if (tile && terrainProps(tile.terrain).walkable) tiles.push({ x, y });
    }
  }
  let edges = 0;
  for (const at of tiles) {
    for (const next of walkableNeighbours(world, at)) {
      if (next.x > at.x || next.y > at.y) edges++;
    }
  }
  const seen = new Set<string>();
  let components = 0;
  for (const at of tiles) {
    if (seen.has(keyOf(at))) continue;
    components++;
    const queue: Vec[] = [at];
    seen.add(keyOf(at));
    for (let head = 0; head < queue.length; head++) {
      for (const next of walkableNeighbours(world, queue[head] as Vec)) {
        if (seen.has(keyOf(next))) continue;
        seen.add(keyOf(next));
        queue.push(next);
      }
    }
  }
  return { nodes: tiles.length, edges, components, cycles: edges - tiles.length + components };
}

/** Picks `count` cells that are as far from one another as a greedy farthest-point pass gets. */
export function spreadCells(candidates: Cell[], count: number, first: Cell): Cell[] {
  const chosen: Cell[] = [];
  const pool = candidates.slice();
  const anchors: Cell[] = [first];
  while (chosen.length < count && pool.length > 0) {
    let bestAt = 0;
    let bestScore = -1;
    for (let n = 0; n < pool.length; n++) {
      const cell = pool[n] as Cell;
      let score = Number.POSITIVE_INFINITY;
      for (const anchor of anchors) {
        const d = Math.abs(anchor.i - cell.i) + Math.abs(anchor.j - cell.j);
        if (d < score) score = d;
      }
      if (score > bestScore) {
        bestScore = score;
        bestAt = n;
      }
    }
    const picked = pool.splice(bestAt, 1)[0] as Cell;
    chosen.push(picked);
    anchors.push(picked);
  }
  return chosen;
}
