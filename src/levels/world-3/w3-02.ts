import type { ItemKind, ObjectiveContext, World } from '../../engine/index.ts';
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

/**
 * Times the round left one depot for another. A round that reads the table as a route plan — one
 * class collected and delivered, then the next — leaves each depot once and never returns; a round
 * that takes whichever crate is nearest walks back to a pad it has already used again and again.
 */
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

/**
 * The randomized axis is the mapping, not the geometry. Depot positions are drawn first and the
 * classes are stencilled onto them afterwards, so no relationship survives between a class and a
 * corner of the yard — and the number of classes moves too, which is what kills a fixed if-chain.
 */
export const w3_02: LevelDef = {
  id: 'w3-02',
  world: 3,
  index: 2,
  title: 'Sorted by Colour',
  hardware: ['carrying'],
  brief: [
    '```',
    'MEMO KD-2302',
    'FROM: Dep. Coordinator M. Vance',
    'RE:   Routing terminology',
    '',
    '"Shortcut" is not an approved routing term. Where a shortcut has been',
    'taken, please log it as an efficiency and I will approve it retroactively,',
    'which is the only direction in which I am able to approve things.',
    '```',
    '',
    'Every crate on the yard floor belongs on the depot pad stencilled with its class.',
    '`scan(dir).mark` reads a stencil and returns the class name, or `null` on an unpainted',
    'tile.',
    '',
    'The stencils are repainted between shifts. Which pad takes which class changes, and so',
    'does the number of classes in the yard. The bot carries one item at a time.',
    '',
    'Vance will sign the shift off as tidy if every depot was finished in one go: the last crate',
    'of a class delivered before the first crate of the next. A pad you come back to after',
    'delivering somewhere else has been started twice.',
  ].join('\n'),
  seeds: [1, 2, 3, 4],
  par: { ticks: PAR_TICKS, chars: 1230 },
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
      (ctx) => [sorted(ctx), totalCrates(ctx.initialWorld)],
    ),
  ],
  bonus: [
    Objectives.custom(
      'one-depot-at-a-time',
      'Finish each depot before you start the next',
      (ctx) => depotSwitches(ctx) <= depotsWorked(ctx.initialWorld) - 1,
      (ctx) => [depotSwitches(ctx), Math.max(0, depotsWorked(ctx.initialWorld) - 1)],
    ),
  ],
  budget: { maxTicks: 4000 },
  starter: [
    '// NOTE(4470): the stencils on the depots get repainted between shifts',
    '// NOTE(4470): they do not always get repainted the same way',
    '',
    '// Park in the northwest corner of the yard and work from there.',
    'while (canMove(Dir.West)) move(Dir.West);',
    'while (canMove(Dir.North)) move(Dir.North);',
    '',
  ].join('\n'),
  hints: [
    'The stencil on a depot pad says which class belongs there. It is repainted between shifts.',
    'You will walk past a crate long before you have found the depot that takes it.',
    'A chain of if-statements has a fixed number of branches. The yard does not have a fixed number of classes.',
    'Two things vary independently here: where each depot is, and which class it takes.',
    'The table that says where a class belongs will also say what order to work the yard in.',
  ],
  docs: ['scan', 'carrying'],
};
