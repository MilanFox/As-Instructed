import type { Divergence, MoveEvent, ObjectiveContext, Vec, World } from '../../engine/index.ts';
import {
  Dir,
  ItemKind,
  Objectives,
  Rng,
  Terrain,
  addBot,
  addGroundItems,
  clipValue,
  createWorld,
  setTile,
  vec,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { at, blockedMoves, firstBump, localSeed } from './shared.ts';

const HEIGHT = 9;
const MOUTH_X = 8;
const ROOM_W = 7;
const REVERSAL_BUDGET = 3;
export const AISLE = 7;
export const SILO_X = 1;

export interface Site {
  tunnel: number;
  columns: number[];
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
  return MOUTH_X + site.tunnel + ROOM_W + 1;
}

function totalCrates(world: World): number {
  return world.items.reduce(
    (sum, stack) => (stack.kind === ItemKind.Crate ? sum + stack.count : sum),
    0,
  );
}

function cratesHome(world: World): number {
  return world.items.reduce(
    (sum, stack) =>
      stack.kind === ItemKind.Crate && stack.at.x === SILO_X ? sum + stack.count : sum,
    0,
  );
}

function delivered(ctx: ObjectiveContext): [number, number] {
  return [cratesHome(ctx.world), totalCrates(ctx.initialWorld)];
}

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
    expected: 'dropped on the silo',
    received: 'still carrying a crate',
  };
}

function tunnelSteps(ctx: ObjectiveContext): MoveEvent[] {
  const eastX = ctx.initialWorld.w - ROOM_W - 1;
  return ctx.trace.events
    .filter(
      (event): event is MoveEvent =>
        event.kind === 'move' &&
        event.ok &&
        event.to.y === AISLE &&
        event.to.x >= MOUTH_X &&
        event.to.x < eastX,
    )
    .sort((a, b) => a.t - b.t || a.botId - b.botId);
}

function reversals(ctx: ObjectiveContext): MoveEvent[] {
  const steps = tunnelSteps(ctx);
  const turns: MoveEvent[] = [];
  for (let i = 1; i < steps.length; i++) {
    const before = steps[i - 1] as MoveEvent;
    const step = steps[i] as MoveEvent;
    if (Math.sign(step.to.x - step.from.x) !== Math.sign(before.to.x - before.from.x)) {
      turns.push(step);
    }
  }
  return turns;
}

function overTurned(ctx: ObjectiveContext): Divergence | undefined {
  const turns = reversals(ctx);
  const spare = turns[REVERSAL_BUDGET];
  if (spare === undefined) return undefined;
  const heading = spare.to.x > spare.from.x ? 'east' : 'west';
  return {
    where: `bot #${String(spare.botId)} · tick ${String(spare.t)}`,
    expected: `${String(REVERSAL_BUDGET)} reversals or fewer`,
    received: clipValue(
      `reversal ${String(REVERSAL_BUDGET + 1)} of ${String(turns.length)} · turned ${heading}`,
    ),
  };
}

export const w7_03: LevelDef = {
  id: 'w7-03',
  world: 7,
  index: 3,
  title: 'Right of Way',
  hardware: [],
  brief: [
    'The tunnel is narrow and the bots are not polite. The office counts every bump, and every time the traffic turns around. — D. Halloran',
    '',
    '**Move every crate from the east yard to the silo.**',
  ].join('\n'),
  board: {
    redrawn: [
      'the bot count, two to six',
      'the tunnel length, 6 to 12 tiles',
      'the east-yard column of each pile',
      'whether a pile holds one crate or two',
    ],
  },
  facts: [
    { label: 'Score', value: 'The tick when the **last** bot stops.' },
    {
      label: 'Crates',
      value:
        'Bots start in the west yard, next to the silo. The silo is every tile of column 1. Each bot has one pile in the east yard, in its start row. A pile holds one or two. A bot carries one at a time.',
    },
    {
      label: 'Tunnel',
      value: 'Row `y = 7`, one bot wide. Bots going opposite ways cannot pass.',
    },
    {
      label: 'Following bots',
      value:
        'A bot frees its tile on the tick it leaves. Bots going the same way can follow one tick apart.',
    },
    {
      label: 'Past ticks',
      value:
        'Each bot has its own clock, and your code moves one bot at a time. A tile is taken at every tick a bot stood on it. Another bot cannot enter it at one of those ticks, even if it is empty now.',
    },
    {
      label: 'Blocked moves',
      value:
        'Any move that fails, into a bot or a wall. `canMove(dir)` checks first, for free. Its answer holds until your code moves another bot, which may take the tile.',
    },
    {
      label: 'Reversal (tunnel traffic turns around)',
      value:
        'A tunnel step in the opposite direction to the tunnel step before it, by any bot, in tick order.',
    },
  ],
  seeds: [1, 2, 3, 4],
  par: { ticks: 200 },
  build(seed: number): World {
    const site = siteFor(seed);
    const width = siteWidth(site);
    const world = createWorld({ w: width, h: HEIGHT, seed, fill: Terrain.Wall });
    const eastX = MOUTH_X + site.tunnel;
    for (let y = 1; y <= AISLE; y++) {
      for (let x = 1; x <= ROOM_W; x++) setTile(world, vec(x, y), { terrain: Terrain.Floor });
      for (let x = eastX; x < eastX + ROOM_W; x++)
        setTile(world, vec(x, y), { terrain: Terrain.Floor });
    }
    for (let y = 1; y <= AISLE; y++) setTile(world, vec(SILO_X, y), { terrain: Terrain.Pad });
    for (let x = MOUTH_X; x < eastX; x++) setTile(world, vec(x, AISLE), { terrain: Terrain.Floor });

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
      'Deliver every crate to the silo in column 1',
      (ctx) => cratesHome(ctx.world) === totalCrates(ctx.initialWorld),
      { progress: delivered, divergence: strayCrate },
    ),
  ],
  bonus: [
    Objectives.custom(
      'no-bumps',
      'No blocked moves',
      (ctx) => blockedMoves(ctx.trace.events) === 0,
      { divergence: (ctx) => firstBump(ctx.trace.events) },
    ),
    Objectives.custom(
      'one-way-tunnel',
      `No more than ${String(REVERSAL_BUDGET)} tunnel reversals`,
      (ctx) => reversals(ctx).length <= REVERSAL_BUDGET,
      {
        progress: (ctx) => [Math.min(reversals(ctx).length, REVERSAL_BUDGET), REVERSAL_BUDGET],
        divergence: overTurned,
        unit: 'reversals',
      },
    ),
  ],
  starter: [
    '// The tunnel is row y = 7.',
    '',
    'for (const id of bots()) {',
    '  bot(id).move(Dir.East);',
    '}',
    '',
  ].join('\n'),
  hints: [
    'Only one direction can use the tunnel at a time. Your code decides which.',
    'If each bot waits for the other, both wait forever. One bot must go first.',
    'You know how many ticks every action takes. Work out when each bot reaches the tunnel.',
    'Send several bots the same way before you turn the tunnel around.',
    'A pile of two crates needs a second trip. Plan all direction changes before the first bot moves.',
  ],
  docs: ['ticks', 'wait', 'sync', 'canMove', 'pickup', 'drop'],
};
