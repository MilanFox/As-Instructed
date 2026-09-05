import type { ItemKind, ObjectiveContext, Vec, World } from '../../engine/index.ts';
import {
  Dir,
  MachineKind,
  Objectives,
  Terrain,
  addBot,
  addGroundItems,
  addMachine,
  countItemsAt,
  createWorld,
  eq,
  machineById,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import {
  carveCaves,
  dropLog,
  groundCensus,
  localRng,
  reachableTiles,
  roomCentre,
  sightingTick,
  worldDistances,
} from './shared.ts';

const DEPOT_W = 34;
const DEPOT_H = 26;
const DEPOT_PREFIX = 'depot-';

/** The class pool. A shift draws four to six of these and maps them to bays at random. */
const CLASSES: readonly ItemKind[] = ['ore', 'ice', 'scrap', 'part', 'cell', 'chip'];

interface Shift {
  classes: number;
  crates: number;
  capacity: number;
  rooms: number;
  /** Crates in the far quarter of the depot, bays in the near third: the long-haul layout. */
  clustered: boolean;
}

const SHIFTS: readonly Shift[] = [
  { classes: 5, crates: 12, capacity: 4, rooms: 9, clustered: false },
  { classes: 4, crates: 10, capacity: 4, rooms: 9, clustered: true },
  { classes: 6, crates: 16, capacity: 4, rooms: 10, clustered: false },
  { classes: 5, crates: 14, capacity: 3, rooms: 8, clustered: false },
  { classes: 4, crates: 16, capacity: 4, rooms: 11, clustered: false },
];

const shiftFor = (seed: number): Shift =>
  SHIFTS[(seed - 1) % SHIFTS.length] ?? (SHIFTS[0] as Shift);

const depotId = (kind: ItemKind): string => `${DEPOT_PREFIX}${kind}`;

/** Bays are spread so no two share a room; that is what makes the mapping worth exploring for. */
function pickBays(candidates: readonly Vec[], wanted: number, spacing: number): Vec[] {
  const chosen: Vec[] = [];
  for (let slack = spacing; slack >= 0 && chosen.length < wanted; slack -= 2) {
    for (const at of candidates) {
      if (chosen.length >= wanted) break;
      if (chosen.some((other) => Math.abs(other.x - at.x) + Math.abs(other.y - at.y) < slack)) {
        continue;
      }
      if (!chosen.some((other) => eq(other, at))) chosen.push(at);
    }
  }
  return chosen;
}

function build(seed: number): World {
  const world = createWorld({ w: DEPOT_W, h: DEPOT_H, seed, fill: Terrain.Rock });
  const rng = localRng(seed);
  const plan = shiftFor(seed);
  const rooms = carveCaves(world, rng, {
    rooms: plan.rooms,
    minSize: 3,
    maxSize: 6,
    margin: 1,
  });
  const start = roomCentre(rooms[0] ?? { x: 1, y: 1, w: 3, h: 3 });

  const hops = worldDistances(world, start);
  const hopsTo = (at: Vec): number => hops.get(at.y * DEPOT_W + at.x) ?? 0;
  const open = reachableTiles(world, start).filter((at) => !eq(at, start));
  const byDistance = open.slice().sort((a, b) => hopsTo(a) - hopsTo(b));

  const nearHalf = byDistance.slice(0, Math.max(plan.classes, Math.floor(byDistance.length * 0.4)));
  const farQuarter = byDistance.slice(Math.floor(byDistance.length * 0.72));

  const kinds = rng.shuffle(CLASSES).slice(0, plan.classes);
  const bayPool = rng.shuffle(plan.clustered ? nearHalf : open);
  const bays = pickBays(bayPool, plan.classes, 8);

  kinds.forEach((kind, index) => {
    const at = bays[index] ?? (open[index] as Vec);
    addMachine(world, {
      id: depotId(kind),
      kind: MachineKind.Sink,
      at,
      state: 'open',
      inventory: [],
      vars: { bay: index + 1 },
    });
  });

  const taken = new Set(bays.map((at) => `${at.x},${at.y}`));
  const cratePool = rng
    .shuffle(plan.clustered ? farQuarter : open)
    .filter((at) => !taken.has(`${at.x},${at.y}`));

  cratePool.slice(0, plan.crates).forEach((at, index) => {
    addGroundItems(world, at, kinds[index % kinds.length] as ItemKind, 1);
  });

  addBot(world, { at: start, facing: Dir.East, name: 'RIG-82', capacity: plan.capacity });
  return world;
}

const manifest = (world: World): Map<ItemKind, number> => {
  const census = groundCensus(world, CLASSES);
  for (const [kind, count] of census) if (count === 0) census.delete(kind);
  return census;
};

function sorted(ctx: ObjectiveContext): [number, number] {
  let done = 0;
  let total = 0;
  for (const [kind, count] of manifest(ctx.initialWorld)) {
    const bay = machineById(ctx.initialWorld, depotId(kind));
    total += count;
    if (bay) done += Math.min(count, countItemsAt(ctx.world, bay.at, kind));
  }
  return [done, total];
}

/** Crate tiles and bay tiles as they stood at the start: the things that had to be found. */
function landmarks(world: World): Vec[] {
  const out: Vec[] = world.items.map((stack) => stack.at);
  for (const machine of world.machines) out.push(machine.at);
  return out;
}

function deliveredBeforeSurveyDone(ctx: ObjectiveContext): number {
  const complete = sightingTick(ctx, landmarks(ctx.initialWorld));
  let early = 0;
  for (const record of dropLog(ctx)) {
    if (record.t > complete) continue;
    const bay = machineById(ctx.initialWorld, depotId(record.item));
    if (bay && eq(bay.at, record.at)) early += record.count;
  }
  return early;
}

/* The reference heuristic's worst seed is 632 ticks; par leaves a working margin over it and
   nothing like enough for a survey followed by a separate delivery round, which is the whole
   claim the brief makes about the budget. */
const PAR_TICKS = 700;

/**
 * Explore, route and deliver, with no seam between them.
 *
 * Every piece here is something World 3 and World 4 already taught. What is new is the budget:
 * par is set below a full survey plus a separate delivery round, so a crate that is already on
 * board when its bay comes into view has to be dropped then, not later. The map, the crate
 * census and the class-to-bay mapping are all unknown at write time and all discoverable only
 * by looking.
 */
export const w8_02: LevelDef = {
  id: 'w8-02',
  world: 8,
  index: 2,
  title: 'Full Stack',
  hardware: [],
  brief: [
    '**FROM:** Dep. Coordinator M. Vance',
    '',
    'A subsurface depot, last inventoried in 2206. Shipping hold a manifest for it. The',
    'manifest lists quantities and no locations, which Shipping have described as sufficient.',
    '',
    '---',
    '',
    'Every crate on the floor belongs to one class and every class has exactly one bay. Carry',
    'each crate to its bay and drop it there. A crate counts as delivered when it is lying on',
    'the right tile at the end of the shift.',
    '',
    `The depot is ${String(DEPOT_W)} by ${String(DEPOT_H)} and none of it is mapped. The rock is`,
    'opaque, so `look` stops at the first wall it meets. A bay shows up as a `machineId` on any',
    'tile you can see, and `probe(id)` reports its position from anywhere afterwards. **The id is',
    'how you learn the class**: `depot-ore` takes ore and nothing else. Which classes are down',
    'here, and which bay takes which, changes every shift. The arms hold a fixed number of crates',
    'and there is no gauge: a `pickup` that takes fewer than you asked for is the arms telling',
    'you they are full.',
    '',
    'The shift budget does not allow for a survey followed by a delivery round.',
    '',
    '**The Repository.** This work order assumes `lib.ts` holds the two cave routines:',
    '',
    '- `survey(b?)` — records what the bot can see from where it stands.',
    "  `import { survey } from 'lib';`",
    '- `pathTo(x, y, b?)` — walks the bot to a tile the record already knows.',
    "  `import { pathTo } from 'lib';`",
    '',
    'If either is not in there, write it in this file.',
    '',
    'They are two routines and this depot wants one. Asking for a tile the record does not know',
    'yet is the normal case here, and the answer is to look around and ask again. A routine that',
    'calls both is worth keeping. Later briefs call it `reach`.',
  ].join('\n'),
  seeds: [1, 2, 3, 4, 5],
  par: { ticks: PAR_TICKS, chars: 2400 },
  build,
  objectives: [
    Objectives.custom(
      'depot-sorted',
      'Every crate is lying on the bay for its class',
      (ctx) => {
        const [done, total] = sorted(ctx);
        return done >= total;
      },
      sorted,
    ),
  ],
  bonus: [
    Objectives.custom(
      'ship-while-you-look',
      'Deliver half the crates before the last crate or bay is sighted',
      (ctx) => {
        const total = sorted(ctx)[1];
        return deliveredBeforeSurveyDone(ctx) >= Math.ceil(total / 2);
      },
      (ctx) => {
        const half = Math.ceil(sorted(ctx)[1] / 2);
        return [Math.min(deliveredBeforeSurveyDone(ctx), half), half];
      },
    ),
  ],
  starter: [
    "// import { survey, pathTo } from 'lib';",
    '// TODO(4470): depot 0 has a manifest and no address. this one is the',
    '// other way round: an address, no manifest. the crates down here are',
    '// not on any list, so do not trust a count you did not take yourself',
    '',
    'print(scan().terrain);',
    'for (const view of look(Dir.East, 40)) if (view.machineId) print(view.machineId);',
    '',
  ].join('\n'),
  hints: [
    'Nothing here is known before the shift starts. Everything the bot learns, it learns by looking, and it only keeps what your program writes down.',
    'A tile you have seen is a tile you can plan a route through. A tile you have not seen is not, and treating it as passable will cost you moves that fail.',
    'There is not enough budget to walk the depot once for looking and once for carrying.',
    'Full arms are wasted arms. A bay you walk past with the matching crate on board is much cheaper than a bay you come back to.',
    'The bot cannot know how many crates exist until it has seen the whole floor. That is a reason to keep looking, not a reason to stop carrying.',
  ],
  docs: ['look', 'probe', 'pickup', 'drop'],
};
