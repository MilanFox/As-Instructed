import type { Divergence, ItemKind, ObjectiveContext, Vec, World } from '../../engine/index.ts';
import {
  Dir,
  MachineKind,
  NOTHING,
  Objectives,
  Terrain,
  addBot,
  addGroundItems,
  addMachine,
  clipValue,
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
  machinesWithPrefix,
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
      received: held > 0 ? `${there}, ${String(held)} still carried` : there,
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
  if (!Number.isFinite(complete)) return 0;
  let early = 0;
  for (const record of dropLog(ctx)) {
    if (record.t > complete) continue;
    const bay = machineById(ctx.initialWorld, depotId(record.item));
    if (bay && eq(bay.at, record.at)) early += record.count;
  }
  return early;
}

const BAY_NOTE = 'bay';

interface BayLine {
  text: string;
  early: boolean;
}

interface BayClaim {
  id: string;
  at: Vec;
}

function bayLines(ctx: ObjectiveContext): BayLine[] {
  const firstMove = ctx.trace.events.findIndex((event) => event.kind === 'move');
  const out: BayLine[] = [];
  ctx.trace.events.forEach((event, index) => {
    if (event.kind !== 'print' || !event.text.startsWith(`${BAY_NOTE} `)) return;
    out.push({ text: event.text, early: firstMove < 0 || index < firstMove });
  });
  return out;
}

function readBayLine(line: string): BayClaim | null {
  const parts = line.split(' ');
  const id = parts[1];
  const x = Number(parts[2]);
  const y = Number(parts[3]);
  if (parts.length !== 4 || id === undefined) return null;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  return { id, at: { x, y } };
}

function tookDelivery(ctx: ObjectiveContext, id: string, at: Vec): boolean {
  return dropLog(ctx).some((record) => eq(record.at, at) && depotId(record.item) === id);
}

function baysFiled(ctx: ObjectiveContext): [number, number] {
  const bays = machinesWithPrefix(ctx.initialWorld, DEPOT_PREFIX);
  const claims = bayLines(ctx)
    .filter((line) => line.early)
    .map((line) => readBayLine(line.text));
  let filed = 0;
  for (const bay of bays) {
    const claim = claims.find((each) => each?.id === bay.id);
    if (claim && eq(claim.at, bay.at) && tookDelivery(ctx, bay.id, bay.at)) filed += 1;
  }
  return [filed, bays.length];
}

function bayListFiled(ctx: ObjectiveContext): boolean {
  const [filed, wanted] = baysFiled(ctx);
  return filed === wanted && bayLines(ctx).length === wanted;
}

function misfiledBays(ctx: ObjectiveContext): Divergence | undefined {
  const bays = machinesWithPrefix(ctx.initialWorld, DEPOT_PREFIX);
  const said = bayLines(ctx);
  if (said.length === 0) {
    return {
      where: 'the bay list',
      expected: `${String(bays.length)} lines, one per bay`,
      received: NOTHING,
    };
  }
  const late = said.find((line) => !line.early);
  if (late) {
    return {
      where: clipValue(late.text),
      expected: 'printed before the first move',
      received: 'printed after the bot moved',
    };
  }
  if (said.length !== bays.length) {
    return {
      where: 'the bay list',
      expected: `${String(bays.length)} lines`,
      received: `${String(said.length)} lines`,
    };
  }
  const unreadable = said.find((line) => readBayLine(line.text) === null);
  if (unreadable) {
    return {
      where: 'the bay list',
      expected: 'a line reading `bay <id> <x> <y>`',
      received: clipValue(unreadable.text),
    };
  }
  const claims = said.map((line) => readBayLine(line.text));
  for (const bay of bays) {
    const claim = claims.find((each) => each?.id === bay.id);
    if (!claim) return { where: bay.id, expected: 'a line of its own', received: NOTHING };
    if (!eq(claim.at, bay.at)) {
      return { where: bay.id, expected: point(bay.at), received: point(claim.at) };
    }
    if (!tookDelivery(ctx, bay.id, bay.at)) {
      return { where: bay.id, expected: 'a crate of its class', received: 'nothing dropped' };
    }
  }
  return undefined;
}

const PAR_TICKS = 632;

export const w8_02: LevelDef = {
  id: 'w8-02',
  world: 8,
  index: 2,
  title: 'Full Stack',
  hardware: [],
  brief: [
    'Nobody has mapped this depot since 2206. Print the bays for the next shift, and carry crates while you look, because we do not pay for sightseeing. — M. Vance',
    '',
    '**Sort every crate onto the bay for its class, in a depot with no map.**',
  ].join('\n'),
  board: {
    redrawn: [
      'which classes appear, and which bay takes each',
      'the cave layout, and where the bays and crates are',
      'how many crates there are',
      'how many crates the bot carries',
      'whether the bays lie near the start and the crates far from it',
    ],
  },
  facts: [
    { label: 'Rock', value: 'Blocks `look`.' },
    {
      label: 'Crates',
      value:
        'One crate per floor tile. Its `kind` is its class. Every crate and bay can be reached. The number of crates is not given.',
    },
    {
      label: 'Bays',
      value:
        '`depot-<class>` takes only that class. Classes: ore, ice, scrap, part, cell, chip; each board uses some. `probe("depot-ore")` finds a bay from anywhere, or nothing if the class is absent. It shows no rock. A crate counts as delivered once it lies on its bay.',
    },
    {
      label: 'Bot capacity (hidden)',
      value: 'Fixed per board. A `pickup()` that takes nothing means the bot is full.',
    },
    {
      label: 'Sighted',
      value:
        'A crate or bay is sighted when it is in the same row or column as the bot, with no rock between. No `look` needed. A probe does not count.',
    },
    {
      label: 'Bay list',
      value:
        'Print `bay <id> <x> <y>` once per bay, all before the first move. No other line may start with `bay`. The star also needs a crate on each listed bay.',
    },
    { label: 'Free calls', value: 'Looking, probing and printing cost no ticks.' },
  ],
  seeds: [1, 2, 3, 4, 5],
  par: { ticks: PAR_TICKS },
  build,
  objectives: [
    Objectives.custom(
      'depot-sorted',
      'Every crate on the bay for its class',
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
              expected: 'sighted at some point',
              received: 'never sighted',
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
    Objectives.custom(
      'name-the-bays',
      'Print the bay list before the first move; put a crate on each listed bay',
      bayListFiled,
      {
        progress: baysFiled,
        divergence: misfiledBays,
      },
    ),
  ],
  starter: [
    '// If you published these to lib.ts, you can import them:',
    "// import { survey, pathTo } from 'lib';",
    '// TODO(4470): this depot has addresses but no crate list. count the crates yourself',
    '',
    'print(scan().terrain);',
    'for (const view of look(Dir.East, 40)) if (view.machineId) print(view.machineId);',
    '',
  ].join('\n'),
  hints: [
    'The map starts empty. The bot only knows what your program stores.',
    'Routes use only tiles you have seen. If a route fails, look around and try again.',
    'Probe all six depot ids at the start. Probing is free.',
    'Do not explore first and carry later. Half the crates must be on their bays before the last crate or bay is sighted.',
    'Drop a crate when you pass its bay. Coming back later costs more.',
  ],
  docs: ['look', 'probe', 'pickup', 'drop'],
};
