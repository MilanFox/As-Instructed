import type { Divergence, ObjectiveContext, Vec, World } from '../../engine/index.ts';
import {
  Dir,
  ItemKind,
  Objectives,
  Rng,
  Terrain,
  addBot,
  addGroundItems,
  createWorld,
  setTile,
  vec,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { at, blockedMoves, firstBump, localSeed } from './shared.ts';

const HEIGHT = 9;
/** The tunnel, and both rooms' loading aisle, share this row. */
export const AISLE = 7;
/** The silo is the whole west wall bay: a crate counts as delivered anywhere in this column. */
export const SILO_X = 1;

export interface Site {
  /** Tunnel length in tiles. */
  tunnel: number;
  /** Crate column offset East of the tunnel mouth, one per bot, all distinct. */
  columns: number[];
  /** How many crates each bot's pile holds. */
  loads: number[];
}

const SITES: Record<number, { bots: number; tunnel: number }> = {
  1: { bots: 2, tunnel: 6 },
  2: { bots: 4, tunnel: 9 },
  3: { bots: 5, tunnel: 12 },
  4: { bots: 6, tunnel: 8 },
};

export function siteFor(seed: number): Site {
  const spec = SITES[seed] ?? { bots: 4, tunnel: 8 };
  const rng = new Rng(localSeed(seed));
  const columns = rng.shuffle([1, 2, 3, 4, 5, 6]).slice(0, spec.bots);
  const loads = columns.map(() => rng.int(1, 2));
  if (loads.every((n) => n < 2)) loads[0] = 2;
  return { tunnel: spec.tunnel, columns, loads };
}

export function siteWidth(site: Site): number {
  return 16 + site.tunnel;
}

function totalCrates(world: World): number {
  return world.items.reduce((sum, stack) => (stack.kind === ItemKind.Crate ? sum + stack.count : sum), 0);
}

function cratesHome(world: World): number {
  return world.items.reduce(
    (sum, stack) => (stack.kind === ItemKind.Crate && stack.at.x === SILO_X ? sum + stack.count : sum),
    0,
  );
}

function delivered(ctx: ObjectiveContext): [number, number] {
  return [cratesHome(ctx.world), totalCrates(ctx.initialWorld)];
}

/**
 * The first crate the run did not get into the silo bay — on the ground in the wrong column, or
 * still in a gripper because the bot that picked it up never put it down.
 */
function strayCrate(ctx: ObjectiveContext): Divergence | undefined {
  const stray = ctx.world.items
    .filter((stack) => stack.kind === ItemKind.Crate && stack.at.x !== SILO_X)
    .sort((a, b) => a.at.x - b.at.x || a.at.y - b.at.y)[0];
  if (stray) {
    return {
      where: at(stray.at),
      expected: `column ${String(SILO_X)}`,
      received: `column ${String(stray.at.x)}`,
    };
  }
  const carrier = ctx.world.bots.find((bot) =>
    bot.inventory.some((stack) => stack.kind === ItemKind.Crate),
  );
  if (carrier === undefined) return undefined;
  return {
    where: `bot #${String(carrier.id)} · ${at(carrier.at)}`,
    expected: 'dropped in the silo bay',
    received: 'still carrying a crate',
  };
}

export const w7_03: LevelDef = {
  id: 'w7-03',
  world: 7,
  index: 3,
  title: 'Right of Way',
  hardware: [],
  brief: [
    '**FROM:** Field Eng. D. Halloran',
    '',
    'one tunnel. one bot wide. it has been one bot wide since 2201 and Facilities have listed',
    'widening it as an option under review. the review is also under review.',
    '',
    'two bots that each stand aside for the other stand aside all shift. the framework calls',
    'that a sustained mutual courtesy.',
    '',
    'Every crate in the east yard has to end up in the silo. All of it goes through the tunnel.',
  ].join('\n'),
  facts: [
    { label: 'Your score', value: 'The clock stops when the **last** bot stops.' },
    { label: 'The silo', value: 'The whole west wall. Any tile in **column 1** counts.' },
    { label: 'Carrying', value: 'One crate at a time.' },
    {
      label: 'The tunnel',
      value: 'One bot wide, on row `y = 7`. Two bots going opposite ways cannot pass.',
    },
    {
      label: 'Nose to tail',
      value:
        'A bot that leaves a tile frees it on that same tick, so bots going the same way can run one tick apart.',
    },
    {
      label: 'Held, not standing',
      value:
        'A tile is held for the ticks a bot was on it. A bot behind on its own clock still cannot walk through where another bot stood at that tick, however empty the aisle looks by then.',
    },
    {
      label: '`canMove(dir)`',
      value:
        'Free, and it asks `move`\'s own question about the tick this bot would arrive on. Only another bot moving can change the answer, so a `canMove` answered by that same `move` never bounces.',
    },
  ],
  seeds: [1, 2, 3, 4],
  par: { ticks: 200 },
  build(seed: number): World {
    const site = siteFor(seed);
    const width = siteWidth(site);
    const world = createWorld({ w: width, h: HEIGHT, seed, fill: Terrain.Wall });
    const eastX = 8 + site.tunnel;
    for (let y = 1; y <= AISLE; y++) {
      for (let x = 1; x <= 7; x++) setTile(world, vec(x, y), { terrain: Terrain.Floor });
      for (let x = eastX; x <= eastX + 6; x++) setTile(world, vec(x, y), { terrain: Terrain.Floor });
    }
    for (let y = 1; y <= AISLE; y++) setTile(world, vec(SILO_X, y), { terrain: Terrain.Pad });
    for (let x = 8; x < eastX; x++) setTile(world, vec(x, AISLE), { terrain: Terrain.Floor });

    site.columns.forEach((column, i) => {
      addBot(world, { at: vec(2, 1 + i), facing: Dir.East, name: `HAUL-0${i + 1}`, capacity: 1 });
      const pile: Vec = vec(eastX + column, 1 + i);
      addGroundItems(world, pile, ItemKind.Crate, site.loads[i] as number);
    });
    return world;
  },
  objectives: [
    Objectives.custom(
      'crates-in-silo',
      'Deliver every crate to the silo bay in column 1',
      (ctx) => cratesHome(ctx.world) === totalCrates(ctx.initialWorld),
      { progress: delivered, divergence: strayCrate },
    ),
  ],
  bonus: [
    Objectives.custom(
      'no-bumps',
      'Complete the run without a single blocked move',
      (ctx) => blockedMoves(ctx.trace.events) === 0,
      { divergence: (ctx) => firstBump(ctx.trace.events) },
    ),
  ],
  starter: [
    '// The tunnel row is y = 7. Everything crosses on it.',
    '',
    'for (const id of bots()) {',
    '  bot(id).move(Dir.East);',
    '}',
    '',
  ].join('\n'),
  hints: [
    'The tunnel is a resource, not an obstacle. Exactly one thing can be using it, and you are the one deciding which thing that is.',
    'Both bots are being polite. Politeness is symmetric. Something here needs to not be.',
    'You know every cost before the run starts, so you can work out the tick a bot reaches the tunnel mouth without asking it. The question is not whether the tunnel is free now. It is when.',
    'A queue that runs one way empties faster than a queue that alternates. Once the tunnel is pointed one way, ask what it costs you to turn it around, and how many bots you should send before you pay that.',
  ],
  docs: ['ticks', 'wait', 'sync', 'canMove', 'pickup', 'drop'],
};
