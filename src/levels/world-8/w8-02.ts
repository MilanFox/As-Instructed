import type { Divergence, ItemKind, ObjectiveContext, Vec, World } from '../../engine/index.ts';
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
  inventoryCount,
  machineById,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import {
  carveCaves,
  dropLog,
  groundCensus,
  localRng,
  point,
  reachableTiles,
  roomCentre,
  sightingTick,
  worldDistances,
} from './shared.ts';

const DEPOT_W = 34;
const DEPOT_H = 26;
const DEPOT_PREFIX = 'depot-';

const CLASSES: readonly ItemKind[] = ['ore', 'ice', 'scrap', 'part', 'cell', 'chip'];

interface Shift {
  classes: number;
  crates: number;
  capacity: number;
  rooms: number;
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

function onTheWrongBay(ctx: ObjectiveContext): Divergence | undefined {
  for (const machine of ctx.initialWorld.machines) {
    if (!machine.id.startsWith(DEPOT_PREFIX)) continue;
    const takes = machine.id.slice(DEPOT_PREFIX.length);
    for (const stack of ctx.world.items) {
      if (!eq(stack.at, machine.at) || stack.count === 0 || stack.kind === takes) continue;
      return {
        where: point(machine.at),
        expected: `this bay takes ${takes}`,
        received: `${String(stack.count)} ${stack.kind} lying on it`,
      };
    }
  }
  return undefined;
}

function shortClass(ctx: ObjectiveContext): Divergence | undefined {
  for (const [kind, wanted] of manifest(ctx.initialWorld)) {
    const bay = machineById(ctx.initialWorld, depotId(kind));
    const landed = bay ? countItemsAt(ctx.world, bay.at, kind) : 0;
    if (landed >= wanted) continue;
    const held = ctx.world.bots.reduce((sum, bot) => sum + inventoryCount(bot, kind), 0);
    const there = landed === 0 ? `no ${kind} there` : `${String(landed)} ${kind} there`;
    return {
      where: depotId(kind),
      expected: `${String(wanted)} ${kind} on the bay`,
      received: held > 0 ? `${there}, ${String(held)} still in the arms` : there,
    };
  }
  return undefined;
}

function sortingMiss(ctx: ObjectiveContext): Divergence | undefined {
  return onTheWrongBay(ctx) ?? shortClass(ctx);
}

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

const PAR_TICKS = 632;

export const w8_02: LevelDef = {
  id: 'w8-02',
  world: 8,
  index: 2,
  title: 'Full Stack',
  hardware: [],
  brief: [
    '**FROM:** Dep. Coordinator M. Vance',
    '',
    'A subsurface depot, last inventoried in 2206. Shipping hold a manifest for it. It lists',
    'quantities and no locations, which Shipping have described as sufficient.',
    '',
    'Every crate on the floor belongs to a class, and every class has one bay. Carry each crate',
    'to its bay and drop it there.',
  ].join('\n'),
  board: {
    fixed: [
      'the depot is 34 by 26 of rock with caves cut through it, and none of it is mapped',
      'one bot, and it starts in one of the cave rooms rather than at a bay',
      'every crate and every bay is reachable on foot from where the bot starts',
      'one bay per class on site, and no two bays in the same room',
      'the arms hold the same number of crates all shift, with no gauge on them',
    ],
    redrawn: [
      'which classes the shift draws, and which bay takes each of them',
      'the cave layout, and where the bays and the crates sit in it',
      'how many crates are on the floor',
      'how many crates the arms hold',
      'whether the crates lie among the bays or off in the far quarter of the depot',
    ],
  },
  facts: [
    {
      label: 'The depot',
      value: `${String(DEPOT_W)} by ${String(DEPOT_H)}, none of it mapped. The rock is opaque, so \`look\` stops at the first wall.`,
    },
    {
      label: 'A crate',
      value:
        "An item, not terrain. A tile's `items` gives each stack's `kind`, and that kind is the crate's class — the word its bay id ends in.",
    },
    {
      label: 'A bay',
      value:
        'Shows up as a `machineId` on any tile you can see, and `probe("depot-ore")` reports one from anywhere whether you have seen it or not. Knowing where a bay is does not map the rock in between.',
    },
    {
      label: 'The manifest',
      value:
        'You do not have a copy. Nothing tells the bot how many crates are on the floor until it has looked at the floor.',
    },
    {
      label: 'Bay ids',
      value:
        '`depot-<class>`. `depot-ore` takes ore and nothing else. The classes change every shift.',
    },
    {
      label: 'The arms',
      value:
        'Hold a fixed number of crates, with no gauge. A `pickup` that takes fewer than the tile offered means full.',
    },
    { label: 'Delivered', value: 'Lying on the right bay tile when the shift ends.' },
    {
      label: 'Sighted',
      value:
        'A crate or a bay counts as sighted the moment it stands in a straight, unblocked line — same row or column — from a tile the bot is on. Beam or no beam.',
    },
    {
      label: 'The budget',
      value:
        'Par grades the whole shift. The star is the tight one: half the crates on their bays before the last crate or bay has been sighted.',
    },
  ],
  seeds: [1, 2, 3, 4, 5],
  par: { ticks: PAR_TICKS },
  build,
  objectives: [
    Objectives.custom(
      'depot-sorted',
      'Every crate is lying on the bay for its class',
      (ctx) => {
        const [done, total] = sorted(ctx);
        return done >= total;
      },
      { progress: sorted, divergence: sortingMiss },
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
      {
        progress: (ctx) => {
          const half = Math.ceil(sorted(ctx)[1] / 2);
          return [Math.min(deliveredBeforeSurveyDone(ctx), half), half];
        },
        divergence: (ctx) => {
          const complete = sightingTick(ctx, landmarks(ctx.initialWorld));
          if (!Number.isFinite(complete)) {
            return {
              where: 'the last crate or bay',
              expected: 'in view at some point in the shift',
              received: 'never came into view',
            };
          }
          const half = Math.ceil(sorted(ctx)[1] / 2);
          return {
            where: `tick ${String(complete)}, the last sighting`,
            expected: `${String(half)} crates already on their bays`,
            received: `${String(deliveredBeforeSurveyDone(ctx))} were`,
          };
        },
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
    'Nothing here is known before the shift starts. The bot learns by looking, and it keeps only what your program writes down.',
    'You can route through a tile you have seen. Asking for one the record does not know yet is normal here: look around, then ask again.',
    'Walking the depot once for looking and once for carrying loses the star: by the time the last crate is in view, half of them have to be on their bays already.',
    'Full arms are wasted arms. A bay you walk past with the right crate on board is much cheaper than a bay you come back to.',
    'The bot cannot know how many crates exist until it has seen the whole floor. That is a reason to keep looking, not a reason to stop carrying.',
  ],
  docs: ['look', 'probe', 'pickup', 'drop'],
};
