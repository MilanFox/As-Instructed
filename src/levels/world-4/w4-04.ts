import type { Divergence, ObjectiveContext, Rng, Vec, World } from '../../engine/index.ts';
import {
  ItemKind,
  NOTHING,
  Objectives,
  Terrain,
  addBot,
  clipValue,
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
import { botEndsOn, died, endedOn } from './objectives.ts';

const CELLS = 19;
const SIZE = 40;
export const ORE_QUOTA = 5;

const WALL = Terrain.Wall;

interface Vein {
  ore: Vec;
  stand: Vec;
}

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

  const surveyCost = 2 * caveFloorTiles(grid).length;
  const tank = Math.round(surveyCost * (0.5 + rng.int(0, 10) / 100));
  addBot(world, { at: lift, name: 'RIG-04', fuel: tank, fuelMax: tank });
  return world;
}

interface TripHome {
  filed?: string;
  paid: number;
  short: boolean;
  droveFirst: boolean;
}

function tripHome(ctx: ObjectiveContext): TripHome {
  const events = ctx.trace.events;
  let carried = 0;
  let anchor = -1;
  for (let i = 0; i < events.length && anchor < 0; i++) {
    const event = events[i];
    if (event === undefined || event.kind !== 'mine' || !event.ok) continue;
    carried += event.count;
    if (carried >= ORE_QUOTA) anchor = i;
  }
  if (anchor < 0) return { paid: 0, short: true, droveFirst: false };

  let filedAt = -1;
  let filed: string | undefined;
  let droveFirst = false;
  for (let i = anchor + 1; i < events.length; i++) {
    const event = events[i];
    if (event === undefined) continue;
    if (event.kind === 'move' && event.ok) {
      droveFirst = true;
      break;
    }
    if (event.kind === 'print' && event.text.startsWith('home ')) {
      filedAt = i;
      filed = event.text;
      break;
    }
  }

  let paid = 0;
  for (let i = (filedAt < 0 ? anchor : filedAt) + 1; i < events.length; i++) {
    const event = events[i];
    if (event?.kind === 'move' && event.ok) paid++;
  }
  return filed === undefined
    ? { paid, short: false, droveFirst }
    : { filed, paid, short: false, droveFirst };
}

const unfiled = (ctx: ObjectiveContext): Divergence | undefined => {
  const trip = tripHome(ctx);
  if (trip.short) {
    return {
      where: 'the last vein',
      expected: `${String(ORE_QUOTA)} ore cut`,
      received: 'the quota was never made',
    };
  }
  if (trip.droveFirst) {
    return {
      where: 'the trip home',
      expected: 'a price filed before the first move back',
      received: 'the bot drove off first',
    };
  }
  if (trip.filed === undefined) {
    return {
      where: 'the trip home',
      expected: 'a line saying what the way back costs',
      received: NOTHING,
    };
  }
  return {
    where: 'the trip home',
    expected: 'a different figure',
    received: clipValue(trip.filed),
  };
};

export const w4_04: LevelDef = {
  id: 'w4-04',
  world: 4,
  index: 4,
  title: 'The Deep Shaft',
  hardware: ['mine', 'fuel', 'refuel'],
  brief: [
    '> dot: the shaft runs deeper than survey admit. there is ore in the walls down there and',
    '> the cutting head will take it. you may take the ore. you may not widen the tunnel.',
    '',
    `Bring back ${ORE_QUOTA} ore and end the run standing on the lift.`,
  ].join('\n'),
  board: {
    fixed: [
      'the map is 40 tiles square; corridors are one tile wide, and a tile with an even `x` and an even `y` is always solid',
      'the cave is carved throughout — every corridor is reachable from every other',
      'RIG-04 starts on the lift, and the lift stands well inside the cave rather than against its outer wall',
      'every ore face is set square into the blind end of a side passage, so a ray down that passage ends on it',
      'six of the ore faces are among those nearest the lift, so the quota never asks for the far end of the cave',
      'the tank never holds more than about half of what walking every corridor would cost',
    ],
    redrawn: [
      'the layout of the corridors',
      'four to eight corridors that rejoin further in',
      'six to ten ore faces, and which passages they end',
      'where in the middle of the cave the lift stands',
      'the size of the tank',
    ],
  },
  facts: [
    { label: 'The lift', value: 'The depot tile the bot starts on.' },
    {
      label: 'The veins',
      value:
        'Ore (a terrain) set into the tunnel walls. Stand next to one and call `mine(dir)`. Cutting a face clears it to floor and puts ore (an item) in the hold. The plain `wall` tiles around them cannot be cut — only an ore face can.',
    },
    {
      label: 'Fuel',
      value:
        'Acting spends fuel equal to the ticks it costs. Looking, reading and waiting spend none. An action the tank cannot pay for does not happen: the shift ends where the bot is standing.',
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
    {
      label: 'The return note',
      value: `For the star: the moment the ${String(ORE_QUOTA)}th ore is cut, and before the bot moves again, file one line \`home <n>\` — the number of moves the trip back is going to take. Then take exactly that many.`,
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
      'filed-return',
      'File what the trip home will cost before driving it',
      (ctx) => {
        const trip = tripHome(ctx);
        return trip.filed === `home ${String(trip.paid)}`;
      },
      { divergence: unfiled },
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
    'A program that can answer that question can also write the answer down. Work the route back out of the map you kept, count it, say it, and then drive it — in that order.',
  ],
  docs: ['look', 'mine', 'fuel', 'refuel', 'memory'],
};
