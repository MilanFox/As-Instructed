import type { Divergence, ObjectiveContext, Rng, Vec, World } from '../../engine/index.ts';
import {
  Objectives,
  Terrain,
  addBot,
  clipValue,
  createWorld,
  setTerrain,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import {
  addCycles,
  carvePerfectMaze,
  cellTile,
  deadEndCells,
  distancesFrom,
  keyOf,
  paintCave,
} from './caves.ts';
import {
  at,
  botEndsOn,
  endedOn,
  firstVisitOrder,
  standingKeys,
  standingTiles,
  tilesWithTerrain,
} from './objectives.ts';

const CELLS = 14;
const SIZE = 30;

const MODES = ['spread', 'clustered', 'mixed', 'clustered'] as const;
type Mode = (typeof MODES)[number];

function farthest(from: Map<string, number>, candidates: readonly Vec[]): Vec {
  return candidates.reduce<Vec>(
    (best, at) => ((from.get(keyOf(at)) ?? -1) > (from.get(keyOf(best)) ?? -1) ? at : best),
    candidates[0] ?? { x: 1, y: 1 },
  );
}

function nearest(from: Map<string, number>, candidates: readonly Vec[]): Vec {
  return candidates.reduce<Vec>(
    (best, at) =>
      (from.get(keyOf(at)) ?? Infinity) < (from.get(keyOf(best)) ?? Infinity) ? at : best,
    candidates[0] ?? { x: 1, y: 1 },
  );
}

function without(pool: readonly Vec[], taken: readonly Vec[]): Vec[] {
  const keys = new Set(taken.map(keyOf));
  return pool.filter((at) => !keys.has(keyOf(at)));
}

function collectionPoints(
  world: World,
  rng: Rng,
  mode: Mode,
  pool: readonly Vec[],
  anchors: readonly Vec[],
): Vec[] {
  if (mode === 'mixed') return rng.shuffle(pool).slice(0, 3);
  if (mode === 'clustered') {
    const first = rng.pick(pool);
    const fromFirst = distancesFrom(world, first);
    const others = without(pool, [first]);
    const second = nearest(fromFirst, others);
    const third = farthest(fromFirst, without(others, [second]));
    return [first, second, third];
  }
  const chosen: Vec[] = [];
  const seeds = anchors.slice();
  let remaining = pool.slice();
  while (chosen.length < 3 && remaining.length > 0) {
    const spread = remaining.map((at) => {
      let worst = Infinity;
      for (const anchor of seeds) {
        const d = distancesFrom(world, anchor).get(keyOf(at)) ?? 0;
        if (d < worst) worst = d;
      }
      return { at, worst };
    });
    const best = spread.reduce((a, b) => (b.worst > a.worst ? b : a));
    chosen.push(best.at);
    seeds.push(best.at);
    remaining = without(remaining, [best.at]);
  }
  return chosen;
}

function build(seed: number): World {
  const world = createWorld({ w: SIZE, h: SIZE, seed, fill: Terrain.Rock });
  const rng = world.rng;
  const grid = carvePerfectMaze(rng, CELLS, CELLS);
  addCycles(rng, grid, rng.int(1, 3));
  paintCave(world, grid);

  const chambers = deadEndCells(grid).map((cell) => cellTile(cell.i, cell.j));
  const start = rng.pick(chambers);
  const fromStart = distancesFrom(world, start);
  const lift = farthest(fromStart, without(chambers, [start]));
  const pool = without(chambers, [start, lift]);
  const points = collectionPoints(world, rng, rng.pick(MODES), pool, [start, lift]);

  for (const at of points) setTerrain(world, at, Terrain.Pad);
  setTerrain(world, lift, Terrain.Depot);
  addBot(world, { at: start, name: 'RIG-04' });
  return world;
}

function landmarks(world: World): { points: Vec[]; lift: Vec | undefined; start: Vec | undefined } {
  return {
    points: tilesWithTerrain(world, Terrain.Pad),
    lift: tilesWithTerrain(world, Terrain.Depot)[0],
    start: world.bots[0]?.at,
  };
}

function permutations(items: readonly Vec[]): Vec[][] {
  if (items.length <= 1) return [items.slice()];
  const out: Vec[][] = [];
  for (let n = 0; n < items.length; n++) {
    const head = items[n] as Vec;
    const rest = items.filter((_, index) => index !== n);
    for (const tail of permutations(rest)) out.push([head, ...tail]);
  }
  return out;
}

function routeCost(world: World, stops: readonly Vec[]): number {
  let total = 0;
  for (let n = 1; n < stops.length; n++) {
    const leg = distancesFrom(world, stops[n - 1] as Vec).get(keyOf(stops[n] as Vec));
    if (leg === undefined) return Infinity;
    total += leg;
  }
  return total;
}

function shortestHaul(world: World): number {
  const { points, lift } = landmarks(world);
  if (points.length !== 3 || lift === undefined) return Infinity;
  return Math.min(...permutations(points).map((perm) => routeCost(world, [...perm, lift])));
}

function haulSteps(ctx: ObjectiveContext): number | undefined {
  const pads = new Set(tilesWithTerrain(ctx.initialWorld, Terrain.Pad).map(keyOf));
  const stood = standingTiles(ctx);
  const first = stood.findIndex((tile) => pads.has(keyOf(tile)));
  if (first === -1) return undefined;
  return stood.length - 1 - first;
}

function haulComplete(ctx: ObjectiveContext): boolean {
  return visitedCount(ctx) === 3 && botEndsOn(ctx, Terrain.Depot);
}

function tookShortestHaul(ctx: ObjectiveContext): boolean {
  if (!haulComplete(ctx)) return false;
  return haulSteps(ctx) === shortestHaul(ctx.initialWorld);
}

function visitedCount(ctx: ObjectiveContext): number {
  const stood = standingKeys(ctx);
  return tilesWithTerrain(ctx.initialWorld, Terrain.Pad).filter((point) => stood.has(keyOf(point)))
    .length;
}

function missedPoint(ctx: ObjectiveContext): Divergence | undefined {
  const stood = standingKeys(ctx);
  const missed = tilesWithTerrain(ctx.initialWorld, Terrain.Pad).find(
    (point) => !stood.has(keyOf(point)),
  );
  if (missed === undefined) return undefined;
  return { where: at(missed), expected: 'stood on', received: 'never reached' };
}

function haulTaken(ctx: ObjectiveContext): Divergence | undefined {
  const { points, lift } = landmarks(ctx.initialWorld);
  if (points.length !== 3 || lift === undefined) return undefined;
  if (!haulComplete(ctx)) {
    return {
      where: 'the haul',
      expected: `all ${String(points.length)} points, then the lift`,
      received: `${String(visitedCount(ctx))} of ${String(points.length)} points`,
    };
  }
  const took = haulSteps(ctx);
  return {
    where: clipValue(firstVisitOrder(ctx, points).map(at).join(' → ')),
    expected: `${String(shortestHaul(ctx.initialWorld))} steps`,
    received: took === undefined ? 'never begun' : `${String(took)} steps`,
  };
}

export const w4_03: LevelDef = {
  id: 'w4-03',
  world: 4,
  index: 3,
  title: 'Map First, Move Second',
  hardware: [],
  brief: [
    '```',
    'MEMO KD-2429',
    'FROM: Dep. Coordinator M. Vance',
    'RE:   Unlogged unit',
    '',
    'A bot at depth is running a program with no deployment record.',
    'Eleven months. Not malfunctioning. Facilities have classified it',
    'as existing infrastructure, which requires no decision.',
    '',
    'The hoist bills from the first collection point on; survey time',
    'has no line item.',
    '```',
    '',
    'Stand on all three collection points, then end on the lift.',
  ].join('\n'),
  board: {
    fixed: [
      'the map is 30 tiles square',
      'tunnels are one tile wide',
      'the cave is carved throughout — every tunnel is reachable from every other, and nothing is sealed off',
      'three collection points and one lift, each at the blind end of a side passage',
      'RIG-04 starts at a blind end too, and the lift is the one furthest from it',
    ],
    redrawn: [
      'the layout of the tunnels',
      'one to three tunnels that rejoin further in',
      'where the three points and the lift sit',
      'how far apart the three points are — some shifts leave two of them almost together, others push all three as far apart as the cave allows',
      'which side passage RIG-04 starts in',
    ],
  },
  facts: [
    { label: 'Collection points', value: 'Three pad tiles.' },
    { label: 'The lift', value: 'Depot (a terrain). One tile of it.' },
    {
      label: 'Where they sit',
      value: 'Each of the four is at the end of a short side passage off the main tunnels.',
    },
    {
      label: 'The haul',
      value:
        'For the star: the steps from the **first** time RIG-04 stands on a collection point to the end of the run on the lift. Everything before that first step onto a point is free.',
    },
    {
      label: 'The clock',
      value:
        'It pays for one look around and one good circuit. It does not pay for three separate trips.',
    },
  ],
  seeds: [1, 2, 3, 4],
  par: { ticks: 970 },
  budget: { maxTicks: 1350 },
  build,
  objectives: [
    Objectives.custom(
      'collect-all',
      'Stand on all three collection points',
      (ctx) => visitedCount(ctx) === 3,
      { progress: (ctx) => [visitedCount(ctx), 3], divergence: missedPoint },
    ),
    Objectives.custom(
      'end-on-lift',
      'End the run on the lift',
      (ctx) => botEndsOn(ctx, Terrain.Depot),
      { divergence: (ctx) => endedOn(ctx, Terrain.Depot) },
    ),
  ],
  bonus: [
    Objectives.custom(
      'shortest-haul',
      'Go from the first collection point to the lift in the fewest steps the cave allows',
      (ctx) => tookShortestHaul(ctx),
      { divergence: haulTaken },
    ),
  ],
  starter: [
    '// NOTE(4470): i kept mine like this. key(x, y) names a tile, the',
    '// NOTE(4470): array is what it touches. the tunnels join up in places',
    '',
    'const known = new Map<string, string[]>();',
    '',
    'function key(x: number, y: number): string {',
    '  return x + "," + y;',
    '}',
    '',
    '// TODO(4470): the side chambers are easy to walk straight past',
    '',
  ].join('\n'),
  hints: [
    'You are being asked to do two different things. Doing them at the same time is what is expensive.',
    'The first thing produces no movement towards any collection point and that is fine. It produces a description of the cave.',
    'Once the cave is written down, the bot no longer has to be anywhere for you to work out how far apart two tiles are.',
    'There are six ways to order three stops. Six is a small enough number to simply try all of them, and the cheapest one is the answer.',
    'A route is a list of tiles chosen before the bot moves. Walking one tells you where the bot ends up without the bot having to be asked, as long as the program keeps the last tile it sent it to.',
  ],
  docs: ['look', 'coordinates', 'memory'],
};
