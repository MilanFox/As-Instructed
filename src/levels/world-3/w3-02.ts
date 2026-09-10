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
 * The first depot that ended the shift short, counted against everything of its class in the yard.
 *
 * The pad is named by tile and not by class. The class is stencilled on it and `scan` reads that
 * for nothing, so the tile costs the player one look; printing the class here would hand back a
 * row of the very table the level exists to make them build.
 */
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
          : `${crates(got)} of its class, and ${crates(strays)} that belong elsewhere`,
    };
  }
  return undefined;
};

/**
 * The first drop that came back to a depot the round had already walked away from.
 *
 * Both ticks are reported. A round that works the yard by proximity crosses its own path dozens of
 * times and the count alone never says which crossing was the one that broke the rule.
 */
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
    '"Shortcut" is not an approved routing term. Log it as an efficiency',
    'and I will approve it retroactively, which is the only direction in',
    'which I am able to approve things.',
    '```',
    '',
    'Every crate on the yard floor belongs on the depot pad stencilled with its class.',
  ].join('\n'),
  /**
   * DESIGN.md §11.10.
   *
   * Everything this level redraws is a mapping, and the facts already say so. What they do not say
   * is that the mapping is the *only* thing redrawn: the yard is the same open rectangle every
   * shift, and every class on the floor has a pad waiting for it. Both matter to the shape of the
   * program. A run that cannot rely on "there is a depot for this class" has to carry a fallback
   * branch for a crate that belongs nowhere — a branch that will never fire on any shift the
   * generator can draw — and a run that cannot rely on the open floor has to walk around walls
   * the shed does not contain. `yard.ts` states the second guarantee for the whole world in its
   * header; the player has never been told it once.
   *
   * The class count is on the redrawn side because it is the axis rule 2 names: a fixed if-chain
   * passes seed 1 at four classes and misses the fifth. That is exactly hint 3, said before the
   * run rather than after it, which is the difference between catching a lazy answer and taxing a
   * reasonable guess.
   */
  board: {
    fixed: [
      'the yard is 14 wide and 10 deep inside its wall',
      'open floor throughout — any tile is reachable by running along `x`, then along `y`',
      'one depot pad for each class the yard is stocking',
      'every crate on the floor has a depot painted for its class',
      'one crate to a tile, and no crate starts on a pad',
      'RIG-04 works the yard with a one-crate clamp',
    ],
    redrawn: [
      'four or five classes stocked',
      'which pad takes which class',
      'where the depot pads stand',
      'eight to fourteen crates, and how they divide between the classes',
      'the tile RIG-04 starts on',
    ],
  },
  facts: [
    {
      label: '`scan(dir).mark`',
      value: 'Reads a stencil. Gives back the class name, or `null` on an unpainted tile.',
    },
    {
      label: 'The stencils',
      value:
        'Repainted between shifts. Where the depot pads stand changes, which pad takes which class changes, and so does how many classes the yard is stocking.',
    },
    { label: 'The clamp', value: 'One crate at a time.' },
    {
      label: 'Finished in one go',
      value:
        'The last crate of a class delivered before the first crate of the next. Come back to a pad later and it counts as started twice.',
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
      'Finish each depot before you start the next',
      (ctx) => depotSwitches(ctx) <= depotsWorked(ctx.initialWorld) - 1,
      {
        progress: (ctx) => [depotSwitches(ctx), Math.max(0, depotsWorked(ctx.initialWorld) - 1)],
        divergence: cameBack,
      },
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
    'Two things change every shift: where each depot is, and which class it takes.',
    'The table that says where a class belongs will also say what order to work the yard in.',
  ],
  docs: ['scan', 'carrying'],
};
