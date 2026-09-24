import type { Divergence, ObjectiveContext, Rng, Vec, World } from '../../engine/index.ts';
import {
  ALL_DIRS,
  ItemKind,
  Objectives,
  Terrain,
  addBot,
  createWorld,
  eq,
  setTerrain,
  step,
  tileAt,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import type { CellGrid } from './caves.ts';
import {
  addCycles,
  carvePerfectMaze,
  cellTile,
  deadEndCells,
  distancesFrom,
  keyOf,
  linkDirs,
  paintCave,
  walkableNeighbours,
} from './caves.ts';
import { at, botEndsOn, endedOn, firstVisitOrder, tilesWithTerrain } from './objectives.ts';

const CELLS = 19;
const SIZE = 40;
export const ORE_QUOTA = 5;
const CUT_COST = 2;
const TANK_SLACK = 12;
const DEEP_RANK = ORE_QUOTA + 3;
const DEEP_SPREAD = 4;
const DEEP_FLOOR = 40;

const WALL = Terrain.Wall;

interface Vein {
  ore: Vec;
  stand: Vec;
}

function blindEnds(grid: CellGrid, lift: Vec): Vein[] {
  const out: Vein[] = [];
  for (const cell of deadEndCells(grid)) {
    const ore = cellTile(cell.i, cell.j);
    const inward = linkDirs(grid, cell.i, cell.j)[0];
    if (inward === undefined || eq(ore, lift)) continue;
    out.push({ ore, stand: step(ore, inward) });
  }
  return out;
}

function chooseVeins(rng: Rng, world: World, sites: Vein[], lift: Vec): Vein[] {
  const fromLift = distancesFrom(world, lift);
  const depthOf = (vein: Vein): number =>
    fromLift.get(keyOf(vein.stand)) ?? Number.MAX_SAFE_INTEGER;
  const ranked = sites.slice().sort((a, b) => depthOf(a) - depthOf(b));
  const first = ranked[0];
  if (first === undefined) return [];
  const rank = Math.min(ranked.length - 1, DEEP_RANK + rng.int(0, DEEP_SPREAD));
  const floor = Math.max(depthOf(ranked[rank] ?? first), DEEP_FLOOR);
  const deep = ranked.find((site) => depthOf(site) >= floor) ?? ranked[rank] ?? first;
  const within = ranked.filter((site) => site !== deep && depthOf(site) <= depthOf(deep));
  const split = Math.max(ORE_QUOTA + 3, Math.ceil(within.length / 2));
  const near = rng.shuffle(within.slice(0, split));
  const far = rng.shuffle(within.slice(split));
  const total = rng.int(ORE_QUOTA + 2, 10);
  const quota = near.slice(0, ORE_QUOTA + 1);
  return [...quota, ...far.slice(0, Math.max(0, total - 1 - quota.length)), deep];
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

  const sites = blindEnds(grid, lift);
  for (const site of sites) setTerrain(world, site.ore, Terrain.Rubble);
  for (const vein of chooseVeins(rng, world, sites, lift)) setTerrain(world, vein.ore, Terrain.Ore);

  const deepest = oreFaces(world).reduce((far, face) => Math.max(far, face.depth), 0);
  const tank = 2 * deepest + CUT_COST + TANK_SLACK;
  addBot(world, { at: lift, name: 'RIG-04', fuel: tank, fuelMax: tank });
  return world;
}

interface Face {
  ore: Vec;
  depth: number;
}

function oreFaces(world: World): Face[] {
  const lift = tilesWithTerrain(world, Terrain.Depot)[0];
  if (lift === undefined) return [];
  const fromLift = distancesFrom(world, lift);
  const out: Face[] = [];
  for (const ore of tilesWithTerrain(world, Terrain.Ore)) {
    const reach = walkableNeighbours(world, ore)
      .map((stand) => fromLift.get(keyOf(stand)))
      .filter((depth): depth is number => depth !== undefined);
    if (reach.length > 0) out.push({ ore, depth: Math.min(...reach) });
  }
  return out;
}

interface Depths {
  deepest: number;
  cut: number;
}

function depths(ctx: ObjectiveContext): Depths {
  let deepest = 0;
  let cut = -1;
  for (const face of oreFaces(ctx.initialWorld)) {
    deepest = Math.max(deepest, face.depth);
    if (tileAt(ctx.world, face.ore)?.terrain !== Terrain.Ore) cut = Math.max(cut, face.depth);
  }
  return { deepest, cut };
}

function haul(ctx: ObjectiveContext): number {
  let ore = 0;
  for (const event of ctx.trace.events) {
    if (event.kind === 'mine' && event.ok && event.item === ItemKind.Ore) ore += event.count;
  }
  return ore;
}

function dryStands(world: World): Vec[] {
  const out: Vec[] = [];
  for (const tile of tilesWithTerrain(world, Terrain.Floor)) {
    if (walkableNeighbours(world, tile).length !== 1) continue;
    if (ALL_DIRS.some((dir) => tileAt(world, step(tile, dir))?.terrain === Terrain.Ore)) continue;
    out.push(tile);
  }
  return out;
}

function walkedInDry(ctx: ObjectiveContext): Vec | undefined {
  return firstVisitOrder(ctx, dryStands(ctx.initialWorld))[0];
}

const shortOfQuota = (ctx: ObjectiveContext): Divergence => ({
  where: 'ore mined',
  expected: `${String(ORE_QUOTA)} ore`,
  received: `${String(haul(ctx))} ore`,
});

const shallow = (ctx: ObjectiveContext): Divergence => {
  const { deepest, cut } = depths(ctx);
  return {
    where: 'the furthest ore',
    expected: `${String(deepest)} tiles from the lift`,
    received: cut < 0 ? 'none mined' : `${String(cut)} tiles from the lift`,
  };
};

const dryHole = (ctx: ObjectiveContext): Divergence => {
  const spot = walkedInDry(ctx);
  return spot === undefined
    ? shortOfQuota(ctx)
    : { where: at(spot), expected: 'ore at the end', received: 'rubble' };
};

export const w4_04: LevelDef = {
  id: 'w4-04',
  world: 4,
  index: 4,
  title: 'The Deep Shaft',
  hardware: ['mine', 'fuel', 'refuel'],
  brief: [
    'the cave is deeper than survey said, and the lab wants ore from the furthest point. no fuel wasted on rubble, no pressure, some pressure. — dot',
    '',
    `**Mine ${ORE_QUOTA} ore and end the run on the lift. The fuel tank is small and fills only on the lift. With too little fuel, the run ends.**`,
  ].join('\n'),
  board: {
    redrawn: [
      'the passages, with four to eight loops',
      'seven to ten ore tiles, and where they are',
      'where the lift is',
      'the size of the tank',
    ],
  },
  facts: [
    {
      label: 'Lift',
      value:
        'The one depot tile, near the middle of the cave. The bot starts on it. The tank refills only here.',
    },
    {
      label: 'Cave',
      value:
        'Passages are one tile wide and all connected. The walls cannot be mined. Every dead end holds ore or rubble. A look down the passage shows which.',
    },
    {
      label: 'Ore',
      value:
        'Ore is only at dead ends. Mine it from the tile next to it for 1 ore. Six of the nearer half of the dead ends hold ore. Distance is counted in steps from the lift; on a tie, either counts.',
    },
    {
      label: 'Rubble',
      value:
        'Mining it gives scrap, not ore. For the star, never stand on the floor tile next to it.',
    },
    {
      label: 'Fuel',
      value: `Each action uses 1 fuel per tick. Looking and reading are free: no fuel, no ticks. Waiting uses no fuel. If the tank is too low for an action, the run ends. A full tank is the trip to the furthest ore and back, plus ${String(CUT_COST)} for mining it, plus ${String(TANK_SLACK)}.`,
    },
  ],
  seeds: [1, 2, 3, 4, 5],
  par: { ticks: 950 },
  budget: { maxTicks: 2200 },
  build,
  objectives: [
    Objectives.inventoryAtLeast(ItemKind.Ore, ORE_QUOTA, {
      id: 'ore-quota',
      label: `Mine ${ORE_QUOTA} ore`,
    }),
    Objectives.custom(
      'end-on-lift',
      'End the run on the lift',
      (ctx) => botEndsOn(ctx, Terrain.Depot),
      { divergence: (ctx) => endedOn(ctx, Terrain.Depot) },
    ),
  ],
  bonus: [
    Objectives.custom(
      'deep-face',
      'Mine the ore that is the most steps from the lift',
      (ctx) => {
        const { deepest, cut } = depths(ctx);
        return deepest > 0 && cut === deepest;
      },
      { divergence: shallow },
    ),
    Objectives.custom(
      'no-dry-holes',
      'Never stand on a tile next to rubble',
      (ctx) => haul(ctx) >= ORE_QUOTA && walkedInDry(ctx) === undefined,
      { divergence: dryHole },
    ),
  ],
  starter: [
    "// import { survey, pathTo } from 'lib';",
    '// The tank size changes between boards. Read it.',
    '',
    'print(`tank: ${fuel()}`);',
    '',
  ].join('\n'),
  hints: [
    'Looking is free. At a junction, look down every passage before you walk into one.',
    'Six ore tiles are near the lift, and you need five. Mine those first.',
    'The furthest ore is a trip of its own. The tank is just big enough for it.',
    'So a full tank tells you how far away the furthest ore is.',
    'The tank fills only on the lift. Keep enough fuel to get back.',
    'Before each step, check the fuel needed to get home from the next tile.',
  ],
  docs: ['look', 'mine', 'fuel', 'refuel', 'memory'],
};
