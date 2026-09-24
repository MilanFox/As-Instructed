import type { Divergence, ItemKind, ObjectiveContext, World } from '../../engine/index.ts';
import {
  Dir,
  Objectives,
  Terrain,
  addBot,
  addGroundItems,
  countItemsAt,
  createWorld,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { at, crates } from './objectives.ts';
import {
  YARD_CLASSES,
  depotPad,
  frame,
  groundTotal,
  interior,
  key,
  stencilledDepots,
  tilePicker,
  warm,
} from './yard.ts';

const PAR_TICKS = 332;

const totalCrates = (world: World): number =>
  world.items.reduce((sum, stack) => sum + stack.count, 0);

const sorted = (ctx: ObjectiveContext): number =>
  stencilledDepots(ctx.initialWorld).reduce(
    (sum, depot) =>
      sum +
      Math.min(
        countItemsAt(ctx.world, depot.at, depot.kind),
        groundTotal(ctx.initialWorld, depot.kind),
      ),
    0,
  );

const depotsWorked = (world: World): number => {
  const stocked = new Set(world.items.map((stack) => stack.kind));
  return stencilledDepots(world).filter((depot) => stocked.has(depot.kind)).length;
};

const depotSwitches = (ctx: ObjectiveContext): number => {
  const pads = new Set(stencilledDepots(ctx.initialWorld).map((depot) => key(depot.at)));
  let switches = 0;
  let last = '';
  for (const event of ctx.trace.events) {
    if (event.kind !== 'drop' || !event.ok) continue;
    const at = key(event.at);
    if (!pads.has(at)) continue;
    if (last !== '' && at !== last) switches++;
    last = at;
  }
  return switches;
};

const shortDepot = (ctx: ObjectiveContext): Divergence | undefined => {
  for (const depot of stencilledDepots(ctx.initialWorld)) {
    const want = groundTotal(ctx.initialWorld, depot.kind);
    const got = countItemsAt(ctx.world, depot.at, depot.kind);
    if (got >= want) continue;
    const strays = countItemsAt(ctx.world, depot.at) - got;
    return {
      where: `the depot at ${at(depot.at)}`,
      expected: `${crates(want)} of its class`,
      received:
        strays === 0
          ? `${crates(got)} of its class`
          : `${crates(got)} of its class, ${String(strays)} of others`,
    };
  }
  return undefined;
};

const cameBack = (ctx: ObjectiveContext): Divergence => {
  const pads = new Set(stencilledDepots(ctx.initialWorld).map((depot) => key(depot.at)));
  const leftAt = new Map<string, number>();
  let last = '';
  let lastTick = 0;
  for (const event of ctx.trace.events) {
    if (event.kind !== 'drop' || !event.ok) continue;
    const here = key(event.at);
    if (!pads.has(here)) continue;
    if (here === last) {
      lastTick = event.t;
      continue;
    }
    if (last !== '') leftAt.set(last, lastTick);
    const before = leftAt.get(here);
    if (before !== undefined) {
      return {
        where: `tick ${String(event.t)} · ${at(event.at)}`,
        expected: 'a depot not used yet',
        received: `last used at tick ${String(before)}, then left`,
      };
    }
    last = here;
    lastTick = event.t;
  }
  return {
    where: 'depot changes',
    expected: `at most ${String(Math.max(0, depotsWorked(ctx.initialWorld) - 1))}`,
    received: String(depotSwitches(ctx)),
  };
};

export const w3_02: LevelDef = {
  id: 'w3-02',
  world: 3,
  index: 2,
  title: 'Sorted by Colour',
  hardware: ['carrying'],
  brief: [
    'Stock control closes a depot as soon as you leave it. Opening it again takes a form, and the form takes three weeks. — M. Vance',
    '',
    '**Sort the crates. Carry them one at a time to the depot painted with their class.**',
  ].join('\n'),
  board: {
    redrawn: [
      'four or five classes',
      'which pad takes which class',
      'where the pads are',
      'eight to fourteen crates, and how many of each class',
      'where the bot starts',
    ],
  },
  facts: [
    {
      label: 'Class',
      value:
        "A crate's item kind. `scan(dir).items` shows it. The crate has no paint. The bot carries one crate at a time.",
    },
    {
      label: 'Depot',
      value:
        'A pad painted with one class. `scan(dir).mark` reads the paint. One depot for each class. A depot is finished when it has every crate of its class. It is started by the first crate dropped on it. Walking over it does not count.',
    },
  ],
  seeds: [1, 2, 3, 4],
  par: { ticks: PAR_TICKS },
  build(seed: number): World {
    const world = createWorld({ w: 16, h: 12, seed, fill: Terrain.Floor });
    frame(world);
    const rng = world.rng;
    warm(rng);
    const classes = rng.shuffle(YARD_CLASSES).slice(0, seed === 1 ? 4 : rng.int(4, 5));
    const pick = tilePicker(rng, interior(world));

    addBot(world, { at: pick(), facing: Dir.East, name: 'RIG-04', capacity: 1 });
    for (const kind of classes) depotPad(world, pick(), kind);

    const count = seed === 1 ? 8 : rng.int(8, 14);
    const manifest: ItemKind[] = [];
    for (let i = 0; i < count; i++) {
      manifest.push((i < classes.length ? classes[i] : rng.pick(classes)) as ItemKind);
    }
    for (const kind of rng.shuffle(manifest)) addGroundItems(world, pick(), kind, 1);
    return world;
  },
  objectives: [
    Objectives.custom(
      'crates-sorted',
      'Put every crate on the depot for its class',
      (ctx) => sorted(ctx) === totalCrates(ctx.initialWorld),
      {
        progress: (ctx) => [sorted(ctx), totalCrates(ctx.initialWorld)],
        divergence: shortDepot,
      },
    ),
  ],
  bonus: [
    Objectives.custom(
      'one-depot-at-a-time',
      'Finish each depot before you bring a crate to the next',
      (ctx) => depotSwitches(ctx) <= depotsWorked(ctx.initialWorld) - 1,
      {
        progress: (ctx) => [depotSwitches(ctx), Math.max(0, depotsWorked(ctx.initialWorld) - 1)],
        divergence: cameBack,
      },
    ),
  ],
  budget: { maxTicks: 4000 },
  starter: [
    '// NOTE(4470): the depots move between shifts. so do their colours.',
    '',
    '// Start from the north-west corner.',
    'while (canMove(Dir.West)) move(Dir.West);',
    'while (canMove(Dir.North)) move(Dir.North);',
    '',
  ].join('\n'),
  hints: [
    'Depots and their classes change every shift. Read them on every run.',
    'You will pass crates before you find their depot.',
    'A chain of ifs has a fixed number of branches. The number of classes is not fixed.',
    'A depot is finished only when every crate of its class is on it.',
  ],
  docs: ['scan', 'carrying'],
};
