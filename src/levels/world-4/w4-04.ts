import type { ObjectiveContext, Rng, Vec, World } from '../../engine/index.ts';
import { Objectives, Terrain, addBot, createWorld, setTerrain } from '../../engine/index.ts';
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
import { botEndsOn, firstVisitOrder, standingKeys, tilesWithTerrain } from './objectives.ts';

const CELLS = 14;
const SIZE = 30;

/**
 * How the three collection points are scattered. Every mode is drawn per seed, and the shipped
 * seed list covers all three: one cave where two of them sit almost on top of each other, one
 * where they are pushed as far apart as the cave allows, and one that is simply arbitrary.
 */
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

/** The three collection points and the lift, recovered from the world as it was built. */
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

/** True shortest-route cost of taking the points in this order and finishing on the lift. */
function tourCost(world: World, start: Vec, order: readonly Vec[], lift: Vec): number {
  const stops = [start, ...order, lift];
  let total = 0;
  for (let n = 1; n < stops.length; n++) {
    const leg = distancesFrom(world, stops[n - 1] as Vec).get(keyOf(stops[n] as Vec));
    if (leg === undefined) return Infinity;
    total += leg;
  }
  return total;
}

function tookBestOrder(ctx: ObjectiveContext): boolean {
  const { points, lift, start } = landmarks(ctx.initialWorld);
  if (points.length !== 3 || lift === undefined || start === undefined) return false;
  const order = firstVisitOrder(ctx, points);
  if (order.length !== 3) return false;
  const costs = permutations(points).map((perm) => tourCost(ctx.initialWorld, start, perm, lift));
  const best = Math.min(...costs);
  return tourCost(ctx.initialWorld, start, order, lift) === best;
}

function visitedCount(ctx: ObjectiveContext): number {
  const stood = standingKeys(ctx);
  return tilesWithTerrain(ctx.initialWorld, Terrain.Pad).filter((at) => stood.has(keyOf(at)))
    .length;
}

/**
 * The difficulty cliff of the first half of the game (CURRICULUM.md §1.3, §11). Everything here
 * that can be scaffolded, is: the starter ships the representation, hint 1 splits the task in two,
 * the bonus is six permutations rather than a second hard problem, and `budget.maxTicks` is set
 * well above a full survey plus a clean circuit — a player who wanders while mapping and then
 * routes properly still passes.
 *
 * The lift is a depot tile rather than a pad so that the three collection points and the lift can
 * be told apart by sight, which they have to be for a route to be plannable at all.
 */
export const w4_04: LevelDef = {
  id: 'w4-04',
  world: 4,
  index: 4,
  title: 'Map First, Move Second',
  hardware: [],
  brief: [
    '```',
    'MEMO KD-2429',
    'FROM: Dep. Coordinator M. Vance',
    'RE:   Unlogged unit',
    '',
    'Telemetry has found a bot at depth running a program with no',
    'deployment record. It has been running for eleven months. It is',
    'not malfunctioning.',
    '',
    'Facilities have classified it as "existing infrastructure" so that',
    'it does not require a decision.',
    '```',
    '',
    'Stand on all three collection points, then end the run on the lift.',
  ].join('\n'),
  facts: [
    { label: 'Collection points', value: 'Three pad tiles.' },
    { label: 'The lift', value: 'One depot tile.' },
    {
      label: 'Where they sit',
      value: 'Each of the four is at the end of a short side passage off the main tunnels.',
    },
    {
      label: 'The clock',
      value:
        'It pays for one look around and one good circuit. It does not pay for three separate trips.',
    },
    {
      label: 'The Repository',
      value:
        'Nothing here needs it. But the two halves you write get names later: `survey` and `pathTo`.',
    },
  ],
  seeds: [1, 2, 3, 4],
  par: { ticks: 970, chars: 2500 },
  budget: { maxTicks: 1350 },
  build,
  objectives: [
    Objectives.custom(
      'collect-all',
      'Stand on all three collection points',
      (ctx) => visitedCount(ctx) === 3,
      (ctx) => [visitedCount(ctx), 3],
    ),
    Objectives.custom('end-on-lift', 'End the run on the lift', (ctx) =>
      botEndsOn(ctx, Terrain.Depot),
    ),
  ],
  bonus: [
    Objectives.custom('best-order', 'Take the collection points in the best order', (ctx) =>
      tookBestOrder(ctx),
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
    'There are six ways to order three stops. Six is a small enough number to simply try all of them.',
  ],
  docs: ['look', 'coordinates', 'memory'],
};
