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

export interface Cell {
  i: number;
  j: number;
}

export interface CellGrid {
  readonly cw: number;
  readonly ch: number;
  open: boolean[];
  east: boolean[];
  south: boolean[];
}

export function cellIndex(grid: CellGrid, i: number, j: number): number {
  return j * grid.cw + i;
}

export function cellTile(i: number, j: number): Vec {
  return { x: 2 * i + 1, y: 2 * j + 1 };
}

export function tileCell(at: Vec): Cell {
  return { i: (at.x - 1) / 2, j: (at.y - 1) / 2 };
}

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

export function linkDirs(grid: CellGrid, i: number, j: number): Dir[] {
  return ALL_DIRS.filter((dir) => linked(grid, i, j, dir));
}

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

export function carvePerfectMaze(rng: Rng, cw: number, ch: number): CellGrid {
  const grid = newCellGrid(cw, ch);
  const seen = new Set<number>();
  const start: Cell = { i: rng.int(0, cw - 1), j: rng.int(0, ch - 1) };
  const stack: Cell[] = [start];
  seen.add(cellIndex(grid, start.i, start.j));

  while (stack.length > 0) {
    const cell = stack[stack.length - 1] as Cell;
    const options = rng.shuffle(ALL_DIRS).filter((dir) => {
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

export function carveTunnel(
  rng: Rng,
  cw: number,
  ch: number,
  cells: number,
): { grid: CellGrid; path: Cell[] } {
  const grid = newCellGrid(cw, ch, false);
  const start: Cell = { i: rng.int(0, cw - 1), j: rng.int(0, ch - 1) };
  const frames: { cell: Cell; options: Dir[] }[] = [
    { cell: start, options: rng.shuffle(ALL_DIRS) },
  ];
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

export function paintCave(world: World, grid: CellGrid, floor: Terrain = Terrain.Floor): void {
  for (const at of caveFloorTiles(grid)) {
    if (inBounds(world, at)) setTerrain(world, at, floor);
  }
}

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
  cycles: number;
}

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
