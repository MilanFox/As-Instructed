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
      where: 'the route',
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
    'The lift charges for every step after the first collection point. Nobody knows who gave a lift a bank account. — M. Vance',
    '',
    '**Stand on all three collection points, then end the run on the lift.**',
  ].join('\n'),
  board: {
    redrawn: [
      'the tunnels, with one to three loops',
      'where the three points and the lift are, and how far apart',
      'which side passage the bot starts in',
    ],
  },
  facts: [
    {
      label: 'Cave',
      value:
        'Tunnels are one tile wide and all connected. The points, the lift and the start are each at the end of a short side passage.',
    },
    { label: 'Collection points', value: 'Three pad tiles.' },
    { label: 'Lift', value: 'One depot tile, in the side passage furthest from the start.' },
    {
      label: 'Steps',
      value:
        'For the star, counted from the **first** time the bot stands on any collection point until the run ends on the lift. Fewest means the shortest walk through all three points, in any order, to the lift.',
    },
    {
      label: 'Tick limit',
      value:
        'Enough to explore the cave once, then walk one planned route. Not enough for three separate trips.',
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
      'From first standing on a point to the lift, take the fewest steps possible',
      (ctx) => tookShortestHaul(ctx),
      { divergence: haulTaken },
    ),
  ],
  starter: [
    '// NOTE(4470): key(x, y) names a tile; the array holds the keys of its open neighbours',
    '',
    'const known = new Map<string, string[]>();',
    '',
    'function key(x: number, y: number): string {',
    '  return x + "," + y;',
    '}',
    '',
    '// TODO(4470): the side passages are easy to miss',
    '',
  ].join('\n'),
  hints: [
    'Do the job in two parts: first map the whole cave, then plan the route.',
    'With the map in memory, you can find the distance between any two tiles without moving.',
    'Three points can be visited in six orders. Try all six and take the shortest.',
    'Plan the full route as a list of tiles before the bot moves. Then walk it.',
  ],
  docs: ['look', 'coordinates', 'memory'],
};
