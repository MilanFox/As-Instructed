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
  stencilledDepots,
  tilePicker,
  warm,
} from './yard.ts';

const PAR_TICKS = 439;

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

/**
 * The synthesis level: w3-02's stencils, w3-01's clamp discipline, and a rack whose capacity is
 * drawn per seed so that no fixed grouping survives. Par comes from a nearest-neighbour load with
 * a 2-opt pass over each drop round — the intended heuristic, not an optimal tour.
 *
 * Seed 1 is pinned to the roomy instance: the largest rack, the fewest crates, the fewest classes.
 */
export const w3_05: LevelDef = {
  id: 'w3-05',
  world: 3,
  index: 5,
  title: 'The Night Shift',
  hardware: [],
  brief: [
    '```',
    'MEMO KD-2341',
    'FROM: Dep. Coordinator M. Vance',
    'RE:   Rack fitment',
    '',
    'A rack has been fitted to RIG-04. Its capacity is recorded in the asset',
    'file. The asset file is held by Shipping, who have confirmed receipt of',
    'the request and nothing further.',
    '```',
    '',
    'Every crate in the yard belongs on the depot pad stencilled with its class, the same as on',
    'the last two shifts. The bot can now carry more than one crate at a time.',
    '',
    'The rack holds a different number of crates every shift and you are not told the number.',
    '`inventory()` returns how many items the bot is holding. A `pickup()` on a full rack takes',
    'nothing, returns 0, and still costs a tick.',
  ].join('\n'),
  seeds: [1, 2, 3, 4, 5],
  par: { ticks: PAR_TICKS, chars: 2710 },
  build(seed: number): World {
    const world = createWorld({ w: 22, h: 16, seed, fill: Terrain.Floor });
    frame(world);
    const rng = world.rng;
    warm(rng);
    const capacity = seed === 1 ? 4 : rng.int(2, 4);
    const count = seed === 1 ? 12 : rng.int(12, 18);
    const classes = rng.shuffle(YARD_CLASSES).slice(0, seed === 1 ? 4 : rng.int(4, 6));
    const pick = tilePicker(rng, interior(world));

    addBot(world, { at: pick(), facing: Dir.East, name: 'RIG-04', capacity });
    for (const kind of classes) depotPad(world, pick(), kind);

    const manifest: ItemKind[] = [];
    for (let i = 0; i < count; i++) {
      manifest.push((i < classes.length ? classes[i] : rng.pick(classes)) as ItemKind);
    }
    for (const kind of rng.shuffle(manifest)) addGroundItems(world, pick(), kind, 1);
    return world;
  },
  objectives: [
    Objectives.custom(
      'yard-cleared',
      'Put every crate on the depot for its class',
      (ctx) => sorted(ctx) === totalCrates(ctx.initialWorld),
      (ctx) => [sorted(ctx), totalCrates(ctx.initialWorld)],
    ),
  ],
  bonus: [
    Objectives.withinTicks(Math.floor(PAR_TICKS * 0.85), {
      id: 'short-shift',
      label: 'Clear the yard fifteen percent under par',
    }),
  ],
  budget: { maxTicks: 8000 },
  starter: [
    '// NOTE(4470): the rack holds more than one now',
    '// NOTE(4470): nobody told the yard, the crates are spread the same as ever',
    '',
    'while (canMove(Dir.West)) move(Dir.West);',
    'while (canMove(Dir.North)) move(Dir.North);',
    '',
  ].join('\n'),
  hints: [
    'The rack does not hold the same number of crates every shift, and nothing announces the number.',
    'A load where every crate belongs to one depot is one stop. A load of four classes is four stops.',
    'Taking the nearest crate every time is cheap. Putting that load away afterwards may not be.',
    'Decide the order of the drops before you make any of them, then look at that order again.',
  ],
  docs: ['pickup', 'drop', 'inventory', 'carrying'],
};
