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
  const depthOf = (vein: Vein): number => fromLift.get(keyOf(vein.stand)) ?? Number.MAX_SAFE_INTEGER;
  const ranked = sites.slice().sort((a, b) => depthOf(a) - depthOf(b));
  const first = ranked[0];
  if (first === undefined) return [];
  const rank = Math.min(ranked.length - 1, DEEP_RANK + rng.int(0, DEEP_SPREAD));
  const floor = Math.max(depthOf(ranked[rank] ?? first), DEEP_FLOOR);
  const deep = ranked.find((site) => depthOf(site) >= floor) ?? (ranked[rank] ?? first);
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
  where: 'the faces cut',
  expected: `${String(ORE_QUOTA)} ore`,
  received: `${String(haul(ctx))} ore`,
});

const shallow = (ctx: ObjectiveContext): Divergence => {
  const { deepest, cut } = depths(ctx);
  return {
    where: 'the deepest face',
    expected: `${String(deepest)} tiles from the lift`,
    received: cut < 0 ? 'no face was cut' : `${String(cut)} tiles from the lift`,
  };
};

const dryHole = (ctx: ObjectiveContext): Divergence => {
  const spot = walkedInDry(ctx);
  return spot === undefined
    ? shortOfQuota(ctx)
    : { where: at(spot), expected: 'a face at the blind end', received: 'spoil' };
};

export const w4_04: LevelDef = {
  id: 'w4-04',
  world: 4,
  index: 4,
  title: 'The Deep Shaft',
  hardware: ['mine', 'fuel', 'refuel'],
  brief: [
    '> dot: the shaft runs deeper than survey admit. there is ore in the walls and the',
    '> cutting head will take it. the tank is not what you asked for.',
    '> dot: procurement want a sample off the deepest face, to settle an argument they',
    '> started. and i am tired of paying fuel for empty holes.',
    '',
    `Bring back ${ORE_QUOTA} ore and end the run standing on the lift.`,
  ].join('\n'),
  board: {
    fixed: [
      'the map is 40 tiles square; corridors are one tile wide, and a tile with an even `x` and an even `y` is always solid',
      'the cave is carved throughout — every corridor is reachable from every other',
      'RIG-04 starts on the lift, and the lift stands well inside the cave rather than against its outer wall',
      'every ore face is set square into the blind end of a side passage, so a ray down that passage ends on it',
      'a blind end with no face is packed with spoil, so one ray tells a face, an empty passage and a corner apart',
      'six of the ore faces are among those nearest the lift, so the quota never asks for the far end of the cave',
      'the tank holds exactly a round trip to the deepest face, the cut, and twelve tiles over',
    ],
    redrawn: [
      'the layout of the corridors',
      'four to eight corridors that rejoin further in',
      'seven to ten ore faces, and which passages they end',
      'where in the middle of the cave the lift stands',
      'the size of the tank',
    ],
  },
  facts: [
    { label: 'The lift', value: 'Depot (a terrain). The one tile of it, and where the bot starts.' },
    {
      label: 'The veins',
      value:
        'Ore (a terrain) filling the blind end of a side passage. One tile faces it, the last floor tile of that passage; stand there and call `mine(dir)`. Cutting a face clears it to floor and puts ore (an item) in the hold.',
    },
    {
      label: 'Spoil',
      value:
        'Rubble (a terrain), filling the blind end of every side passage that holds no face. Cutting it yields scrap, not ore, at the same price as cutting a face.',
    },
    {
      label: 'Fuel',
      value:
        'Acting spends fuel equal to the ticks it costs. Looking, reading and waiting spend none. An action the tank cannot pay for does not happen: the shift ends where the bot is standing.',
    },
    {
      label: 'The tank',
      value:
        'A different size every shift, and not arbitrary: it holds the drive out to the deepest face, the cut, the drive back, and twelve tiles over. `fuel()` reads it; `refuel()` fills it, but only on the lift.',
    },
    {
      label: 'A `look` ray',
      value: 'Stops at the first thing it cannot see through, and tells you what that thing was.',
    },
    {
      label: 'The deepest face',
      value:
        'For the star: cut the ore face furthest from the lift, counted in corridor tiles walked rather than straight-line distance. If two faces are equally far out, either one earns it.',
    },
    {
      label: 'Empty passages',
      value:
        'For the star: never stand on a tile that has spoil beside it. A ray down the passage names the blind end before the bot spends a step on it, and no route ever needs such a tile — only the passage itself ends there.',
    },
  ],
  seeds: [1, 2, 3, 4, 5],
  par: { ticks: 950 },
  budget: { maxTicks: 2200 },
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
  ],
  bonus: [
    Objectives.custom(
      'deep-face',
      'Cut the ore face furthest from the lift',
      (ctx) => {
        const { deepest, cut } = depths(ctx);
        return deepest > 0 && cut === deepest;
      },
      { divergence: shallow },
    ),
    Objectives.custom(
      'no-dry-holes',
      'Never stand in a side passage that ends in spoil',
      (ctx) => haul(ctx) >= ORE_QUOTA && walkedInDry(ctx) === undefined,
      { divergence: dryHole },
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
    'A ray costs nothing and a step costs one. Read every passage out of a junction before walking any of them.',
    'The blind end of a side passage says which kind it is: a face still in the wall, or the spoil packed into an empty one. A corner says neither, because the passage carries on.',
    'The quota is near work. Six of the faces sit among the closest ones, and the shift only asks for five.',
    'The deepest face is not near work. It is a trip of its own, and the tank is sized for exactly that trip and almost nothing else.',
    'A full tank is therefore a measurement. It says how far out the deepest face is, which also says where it is pointless to look.',
    'The tank only fills on the lift. Every tile of fuel spent going out has to still be there to come back.',
    'Before each step, ask what it would take to get home from where that step lands. When the answer is more than the tank holds, you went too far one step ago.',
  ],
  docs: ['look', 'mine', 'fuel', 'refuel', 'memory'],
};
