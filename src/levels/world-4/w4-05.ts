import type { ObjectiveContext, Rng, Vec, World } from '../../engine/index.ts';
import {
  ItemKind,
  Objectives,
  Terrain,
  addBot,
  createWorld,
  opposite,
  setTerrain,
  step,
  tileAt,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import type { CellGrid } from './caves.ts';
import {
  addCycles,
  carvePerfectMaze,
  caveFloorTiles,
  cellTile,
  deadEndCells,
  distancesFrom,
  keyOf,
  linkDirs,
  paintCave,
} from './caves.ts';
import { botEndsOn, died, endedOn, fuelBurned } from './objectives.ts';

const CELLS = 19;
const SIZE = 40;
export const ORE_QUOTA = 5;

/**
 * Cave walls are `Terrain.Wall`, which is opaque and cannot be cut. Only the veins are
 * `Terrain.Ore`. That is deliberate and it is the level's load-bearing constraint: `Terrain.Rock`
 * is mineable, so a rock-walled cave would let a player tunnel straight from the lift to a vein
 * and never explore anything. `world-4.test.ts` asserts no shipped seed contains a mineable wall.
 */
const WALL = Terrain.Wall;

/** A vein face, and the tile a bot has to stand on to cut it. */
interface Vein {
  ore: Vec;
  stand: Vec;
}

/**
 * Veins sit straight ahead of a dead-end cell, so a `look` ray down that side passage terminates
 * on the ore and reports it. Finding a vein is therefore a matter of looking down corridors, not
 * of walking every one of them.
 */
function veinSites(world: World, grid: CellGrid, exclude: Vec): Vein[] {
  const seen = new Set<string>();
  const out: Vein[] = [];
  for (const cell of deadEndCells(grid)) {
    const stand = cellTile(cell.i, cell.j);
    if (stand.x === exclude.x && stand.y === exclude.y) continue;
    const inward = linkDirs(grid, cell.i, cell.j)[0];
    if (inward === undefined) continue;
    const ore = step(stand, opposite(inward));
    if (tileAt(world, ore)?.terrain !== WALL) continue;
    if (seen.has(keyOf(ore))) continue;
    seen.add(keyOf(ore));
    out.push({ ore, stand });
  }
  return out;
}

function chooseVeins(rng: Rng, world: World, sites: Vein[], lift: Vec): Vein[] {
  const fromLift = distancesFrom(world, lift);
  const ranked = sites
    .slice()
    .sort((a, b) => (fromLift.get(keyOf(a.stand)) ?? 0) - (fromLift.get(keyOf(b.stand)) ?? 0));
  const split = Math.max(ORE_QUOTA + 1, Math.ceil(ranked.length * 0.5));
  const near = rng.shuffle(ranked.slice(0, split));
  const far = rng.shuffle(ranked.slice(split));
  const total = rng.int(6, 10);
  const chosen = near.slice(0, Math.min(6, total));
  return chosen.concat(far.slice(0, total - chosen.length));
}

function build(seed: number): World {
  const world = createWorld({ w: SIZE, h: SIZE, seed, fill: WALL });
  const rng = world.rng;
  const grid = carvePerfectMaze(rng, CELLS, CELLS);
  addCycles(rng, grid, rng.int(4, 8));
  paintCave(world, grid);

  const middle = Math.floor(CELLS / 4);
  const lift = cellTile(rng.int(middle, CELLS - 1 - middle), rng.int(middle, CELLS - 1 - middle));
  setTerrain(world, lift, Terrain.Depot);

  for (const vein of chooseVeins(rng, world, veinSites(world, grid, lift), lift)) {
    setTerrain(world, vein.ore, Terrain.Ore);
  }

  // A full survey costs about two moves per floor tile. The tank holds a randomized slice of that,
  // so no fixed "explore for N ticks and then turn back" constant survives across seeds.
  const surveyCost = 2 * caveFloorTiles(grid).length;
  const tank = Math.round(surveyCost * (0.5 + rng.int(0, 10) / 100));
  addBot(world, { at: lift, name: 'RIG-04', fuel: tank, fuelMax: tank });
  return world;
}

function tankSize(ctx: ObjectiveContext): number {
  return ctx.initialWorld.bots[0]?.fuelMax ?? 0;
}

/**
 * The synthesis level. Fuel pays for both halves of the job — finding the veins and getting back
 * — so the only shape that survives is one that reserves a route home and computes it from the
 * map the program has been keeping. Exhaustive mapping runs dry; walking towards the nearest
 * unknown until the tank empties strands the bot at depth.
 */
export const w4_05: LevelDef = {
  id: 'w4-05',
  world: 4,
  index: 5,
  title: 'The Deep Shaft',
  hardware: ['mine', 'fuel', 'refuel'],
  brief: [
    '> dot: the shaft runs deeper than survey admit. there is ore in the walls down there and',
    '> the cutting head will take it. you may take the ore. you may not widen the tunnel.',
    '',
    `Bring back ${ORE_QUOTA} ore and end the run standing on the lift.`,
  ].join('\n'),
  facts: [
    { label: 'The lift', value: 'The depot tile the bot starts on.' },
    {
      label: 'The veins',
      value:
        'Ore faces set into the tunnel walls. Stand next to one and call `mine(dir)`. Ordinary rock cannot be cut.',
    },
    {
      label: 'Fuel',
      value:
        'Acting spends fuel equal to the ticks it costs. Looking, reading and waiting spend none.',
    },
    {
      label: 'The tank',
      value:
        'A different size every shift. `fuel()` reads it; `refuel()` fills it, but only on the depot.',
    },
    {
      label: 'A `look` ray',
      value: 'Stops at the first thing it cannot see through, and tells you what that thing was.',
    },
  ],
  seeds: [1, 2, 3, 4, 5],
  par: { ticks: 700 },
  budget: { maxTicks: 2600 },
  build,
  objectives: [
    Objectives.inventoryAtLeast(ItemKind.Ore, ORE_QUOTA, {
      id: 'ore-quota',
      label: `Carry ${ORE_QUOTA} ore out of the shaft`,
    }),
    Objectives.custom(
      'end-on-lift',
      'End the run standing on the lift',
      (ctx) => botEndsOn(ctx, Terrain.Depot),
      { divergence: (ctx) => endedOn(ctx, Terrain.Depot) },
    ),
    Objectives.custom(
      'bot-recovered',
      'Bring the bot back in one piece',
      (ctx) => ctx.world.bots[0]?.alive === true,
      { divergence: (ctx) => died(ctx) },
    ),
  ],
  bonus: [
    Objectives.custom(
      'fuel-reserve',
      'Finish the job on one tank with a fifth of it unused',
      (ctx) => fuelBurned(ctx) <= tankSize(ctx) * 0.8,
      {
        divergence: (ctx) => ({
          where: 'fuel burned',
          expected: `${String(Math.floor(tankSize(ctx) * 0.8))} of ${String(tankSize(ctx))}`,
          received: `${String(fuelBurned(ctx))} of ${String(tankSize(ctx))}`,
        }),
      },
    ),
  ],
  starter: [
    "// import { survey, pathTo } from 'lib';",
    '// The tank is a different size every shift. Read it, do not assume it.',
    '',
    'print(`tank: ${fuel()}`);',
    '',
  ].join('\n'),
  hints: [
    'The same fuel pays for finding a vein and for getting home afterwards. Only one of those two is optional.',
    'A corridor you have not walked down is not a mystery. Look down it first and see what the far end is made of.',
    'The bot can work out how far it is from the lift at any moment, as long as it wrote down how it got there.',
    'Before each step, ask what it would take to get home from where that step lands you. When the answer is more than the tank holds, you went too far one step ago.',
  ],
  docs: ['look', 'mine', 'refuel', 'memory'],
};
