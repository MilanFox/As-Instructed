import type { Divergence, ObjectiveContext, Vec, World } from '../../engine/index.ts';
import {
  ALL_DIRS,
  NOTHING,
  Objectives,
  Terrain,
  addBot,
  clipValue,
  createWorld,
  setTerrain,
  step,
  terrainProps,
  tileAt,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import type { Cell } from './caves.ts';
import {
  addCycles,
  carvePerfectMaze,
  cellTile,
  deadEndCells,
  distancesFrom,
  keyOf,
  paintCave,
} from './caves.ts';
import { at, botEndsOn, endedOn, tilesWithTerrain } from './objectives.ts';

const CELLS = 9;
const SIZE = 20;

const CYCLE_CHOICES = [0, 2, 3, 4] as const;

function build(seed: number): World {
  const world = createWorld({ w: SIZE, h: SIZE, seed, fill: Terrain.Rock });
  const rng = world.rng;
  const grid = carvePerfectMaze(rng, CELLS, CELLS);
  addCycles(rng, grid, rng.pick(CYCLE_CHOICES));
  paintCave(world, grid);

  const ends = deadEndCells(grid);
  const startCell: Cell = ends.length > 0 ? rng.pick(ends) : { i: 0, j: 0 };
  const start = cellTile(startCell.i, startCell.j);

  const distances = distancesFrom(world, start);
  const candidates = (ends.length > 1 ? ends : [{ i: CELLS - 1, j: CELLS - 1 }])
    .map((cell) => cellTile(cell.i, cell.j))
    .filter((at) => at.x !== start.x || at.y !== start.y);
  const vein = candidates.reduce<Vec>(
    (best, at) => ((distances.get(keyOf(at)) ?? 0) > (distances.get(keyOf(best)) ?? 0) ? at : best),
    candidates[0] ?? start,
  );

  setTerrain(world, vein, Terrain.Pad);
  addBot(world, { at: start, name: 'RIG-04' });
  return world;
}

function crumbTarget(text: string | undefined): Vec | null {
  if (text === undefined) return null;
  const parts = text.split(',');
  if (parts.length !== 2) return null;
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  return { x, y };
}

const walkableAt = (world: World, where: Vec): boolean => {
  const tile = tileAt(world, where);
  return tile !== undefined && terrainProps(tile.terrain).walkable;
};

interface TrailWalk {
  ok: boolean;
  stuckAt?: Vec;
  crumb?: string;
}

function followTrail(world: World, from: Vec, home: Vec): TrailWalk {
  const seen = new Set<string>([keyOf(from)]);
  let here = from;
  for (let guard = 0; guard <= world.tiles.length; guard++) {
    if (here.x === home.x && here.y === home.y) return { ok: true };
    const crumb = tileAt(world, here)?.mark;
    const next = crumbTarget(crumb);
    const legible =
      next !== null &&
      Math.abs(next.x - here.x) + Math.abs(next.y - here.y) === 1 &&
      walkableAt(world, next) &&
      !seen.has(keyOf(next));
    if (!legible) {
      return crumb === undefined
        ? { ok: false, stuckAt: here }
        : { ok: false, stuckAt: here, crumb };
    }
    seen.add(keyOf(next));
    here = next;
  }
  return { ok: false, stuckAt: here };
}

const veinAndStart = (world: World): { vein: Vec; home: Vec } | null => {
  const vein = tilesWithTerrain(world, Terrain.Pad)[0];
  const home = world.bots[0]?.at;
  return vein === undefined || home === undefined ? null : { vein, home };
};

function trailHome(ctx: ObjectiveContext): TrailWalk {
  const ends = veinAndStart(ctx.initialWorld);
  if (ends === null) return { ok: false };
  let best: TrailWalk | null = null;
  for (const dir of ALL_DIRS) {
    const neighbour = step(ends.vein, dir);
    if (!walkableAt(ctx.world, neighbour)) continue;
    if (tileAt(ctx.world, neighbour)?.mark === undefined) continue;
    const walk = followTrail(ctx.world, neighbour, ends.home);
    if (walk.ok) return walk;
    best ??= walk;
  }
  return best ?? { ok: false, stuckAt: ends.vein };
}

const trailBroke = (ctx: ObjectiveContext): Divergence | undefined => {
  const walk = trailHome(ctx);
  const stuck = walk.stuckAt;
  if (stuck === undefined) return undefined;
  const ends = veinAndStart(ctx.initialWorld);
  if (ends !== null && stuck.x === ends.vein.x && stuck.y === ends.vein.y) {
    return { where: at(stuck), expected: 'a mark beside it', received: NOTHING };
  }
  return {
    where: at(stuck),
    expected: 'the tile the bot arrived from',
    received: walk.crumb === undefined ? NOTHING : clipValue(walk.crumb),
  };
};

export const w4_02: LevelDef = {
  id: 'w4-02',
  world: 4,
  index: 2,
  title: 'Breadcrumbs',
  hardware: ['mark', 'readMark'],
  brief: [
    'survey had a map of this cave, on a whiteboard, and someone cleaned the whiteboard. please mark the way back so the next bot does not cry. — dot',
    '',
    '**Search the unmapped cave for the ore and end the run on it.**',
  ].join('\n'),
  board: {
    redrawn: [
      'the passages',
      'how many loops the cave has: none to four',
      'the dead ends, and which one the bot starts in',
    ],
  },
  facts: [
    {
      label: 'Cave',
      value:
        'Passages are one tile wide and all connected. There can be loops. The bot starts at a dead end (a tile with one open side).',
    },
    {
      label: 'Ore',
      value: 'The only pad tile. It is at the dead end furthest from the start, counted in steps.',
    },
    {
      label: 'Marks',
      value:
        'A mark is a string on a tile. Writing one costs 1 tick. Reading one is free, and `look` shows them too.',
    },
    {
      label: 'Trail',
      value:
        'It starts on a marked tile next to the ore. Each mark on it is the `"x,y"` of the next tile toward the start. Following the marks must reach the start. Only the last mark on a tile counts. Marks off the trail do not matter.',
    },
  ],
  seeds: [1, 2, 3, 4],
  par: { ticks: 391 },
  budget: { maxTicks: 1600 },
  build,
  objectives: [
    Objectives.custom(
      'reach-vein',
      'End the run on the ore',
      (ctx) => botEndsOn(ctx, Terrain.Pad),
      { divergence: (ctx) => endedOn(ctx, Terrain.Pad) },
    ),
  ],
  bonus: [
    Objectives.custom(
      'breadcrumb-trail',
      'Leave a trail of marks from the ore to the start, each the `"x,y"` of the next tile back',
      (ctx) => trailHome(ctx).ok,
      { divergence: trailBroke },
    ),
  ],
  starter: [
    '// NOTE(4470): some caves have loops',
    '',
    '// mark() writes on the tile under the bot. look() shows the marks it sees.',
    'mark("start");',
    'print(readMark());',
    '',
  ].join('\n'),
  hints: [
    'Mark each tile you stand on. Then a mark tells you that you were already there.',
    'When every way out of a tile is marked or blocked, go back the way you came.',
    'Keep a list of the directions you walked. To go back, reverse the last one.',
    'For the star, write the tile you came from in each mark. Then the marks lead home.',
  ],
  docs: ['mark', 'look', 'memory'],
};
