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

/** What the run said the way back would cost, what it actually cost, and whether it said it. */
interface TripHome {
  /** The line filed after the quota was complete and before the bot moved again. */
  filed?: string;
  /** Moves spent after that line — or after the last cut, when nothing was filed. */
  paid: number;
  /** The quota was never made, so there was no trip home to price. */
  short: boolean;
  /** The bot drove away from the vein before saying what the trip would cost. */
  droveFirst: boolean;
}

/**
 * Reads the last leg of the shift out of the trace.
 *
 * The anchor is the cut that completes the quota, because that is the moment the run stops having
 * a choice: everything after it is the way back, and the fuel to pay for it either was reserved or
 * was not. A price filed *after* the first move home is a description of a trip already underway,
 * which is the one thing this star is not asking for, so that case is separated from filing
 * nothing at all.
 */
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

/**
 * Where the filed price and the trip parted company, without ever naming the number of moves.
 *
 * The figure is the whole star, so a wrong one comes back as the run's own line and the word
 * "different". The three ways of not answering — never cutting the quota, driving off first, and
 * saying nothing — are separated, because each one is a different mistake and "no star" says none
 * of them.
 */
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
  return { where: 'the trip home', expected: 'a different figure', received: clipValue(trip.filed) };
};

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
        'Ore faces set into the tunnel walls. Stand next to one and call `mine(dir)`. The plain `wall` tiles around them cannot be cut — only an ore face can.',
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
    /*
     * `fuel-reserve` — burn no more than four fifths of the tank — was measured met on all five
     * seeds with 27% to 59% of the allowance still to spare, and it is not a second axis anyway:
     * on this level fuel is spent tick for tick, so a fuel budget and the clock are the same
     * number twice. It was also satisfied by a bot that never started; a fifth of the tank is
     * trivially unused if none of it is used.
     *
     * The level's fourth hint is the question worth grading — *"before each step, ask what it
     * would take to get home from where that step lands you"* — and nothing anywhere asked the
     * program to say the answer out loud. Filing it is free (`print` costs no tick) and it cannot
     * be produced by a bot that is driving home and hoping.
     */
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
