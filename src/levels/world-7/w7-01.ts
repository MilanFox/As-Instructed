import type { ObjectiveContext, World } from '../../engine/index.ts';
import {
  Dir,
  Objectives,
  Rng,
  Terrain,
  addBot,
  createWorld,
  setTile,
  tileAt,
  vec,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { blockedMoves, botsOnPads, heardFromAnother, localSeed } from './shared.ts';

const HEIGHT = 5;
const MAX_LEN = 9;
const WIDTH = MAX_LEN + 3;

/** Corridor lengths per seed. Seed 1 is the equal pair, seed 2 differs by 3x. */
const LENGTHS: Record<number, [number, number]> = {
  1: [6, 6],
  2: [3, 9],
  3: [8, 4],
};

function lengthsFor(seed: number): [number, number] {
  const fixed = LENGTHS[seed];
  if (fixed) return fixed;
  const rng = new Rng(localSeed(seed));
  return [rng.int(3, MAX_LEN), rng.int(3, MAX_LEN)];
}

/** The pad each bot is aiming at sits at the dead end of that bot's own row. */
function padColumn(world: World, row: number): number {
  for (let x = world.w - 1; x >= 0; x--) {
    if (tileAt(world, vec(x, row))?.terrain === Terrain.Pad) return x;
  }
  return -1;
}

/**
 * The cheapest run possible: both walks happen at once, so the fleet pays for the longer one,
 * plus the single `send` the last bot still owes.
 */
function floorTicks(ctx: ObjectiveContext): number {
  let longest = 0;
  for (const bot of ctx.initialWorld.bots) {
    const pad = padColumn(ctx.initialWorld, bot.at.y);
    if (pad >= 0) longest = Math.max(longest, Math.abs(pad - bot.at.x));
  }
  return longest + 1;
}

export const w7_01: LevelDef = {
  id: 'w7-01',
  world: 7,
  index: 1,
  title: 'Two Bots',
  hardware: ['bot', 'bots', 'clock', 'sync', 'send', 'recv'],
  brief: [
    '**FROM:** Field Eng. D. Halloran',
    '',
    'two bots now. they run at the same time, on separate clocks, and the number Finance',
    'reads is the finish time of the last one. not the total. the total is a much larger',
    'number that nobody upstairs has ever asked for.',
    '',
    'Park each bot on the pad at the end of its own corridor, and have each one hear from',
    'the other.',
  ].join('\n'),
  facts: [
    { label: 'Your score', value: 'The clock stops when the **last** bot stops. Not the total.' },
    {
      label: 'The clocks',
      value:
        'One per bot, running at once. `bot(0).move(...)` then `bot(1).move(...)` both happen in the same tick.',
    },
    {
      label: 'Messages',
      value:
        "`recv()` gives back `null` until the reader's own clock reaches the tick the message was sent at.",
    },
    { label: '`sync()`', value: 'Raises every living bot to the highest clock in the fleet.' },
  ],
  seeds: [1, 2, 3],
  par: { ticks: 10 },
  build(seed: number): World {
    const [lenA, lenB] = lengthsFor(seed);
    const world = createWorld({ w: WIDTH, h: HEIGHT, seed, fill: Terrain.Wall });
    const rows: [number, number][] = [
      [1, lenA],
      [3, lenB],
    ];
    for (const [row, len] of rows) {
      for (let x = 1; x <= 1 + len; x++) setTile(world, vec(x, row), { terrain: Terrain.Floor });
      setTile(world, vec(1 + len, row), { terrain: Terrain.Pad });
    }
    addBot(world, { at: vec(1, 1), facing: Dir.East, name: 'RIG-07' });
    addBot(world, { at: vec(1, 3), facing: Dir.East, name: 'RIG-08' });
    return world;
  },
  objectives: [
    Objectives.custom(
      'both-parked',
      'Park each bot on the pad at the end of its corridor',
      (ctx) => botsOnPads(ctx) === ctx.world.bots.length,
      (ctx) => [botsOnPads(ctx), ctx.world.bots.length],
    ),
    Objectives.custom(
      'both-heard',
      "Have each bot receive the other bot's message",
      (ctx) => ctx.world.bots.every((bot) => heardFromAnother(ctx.trace.events, bot.id)),
      (ctx) => [
        ctx.world.bots.filter((bot) => heardFromAnother(ctx.trace.events, bot.id)).length,
        ctx.world.bots.length,
      ],
    ),
  ],
  bonus: [
    Objectives.custom(
      'no-slack',
      'Finish at the theoretical minimum with no blocked moves',
      (ctx) => ctx.trace.endTick <= floorTicks(ctx) && blockedMoves(ctx.trace.events) === 0,
    ),
  ],
  starter: [
    '// NOTE(4470): both of them run at once. you are billed for the slow one',
    '// NOTE(4470): an inbox is not a noticeboard. a message you have not caught up to is not there',
    '',
    'const ids = bots();',
    'bot(ids[0]).move(Dir.East);',
    '',
  ].join('\n'),
  hints: [
    'Both corridors are dead ends. A bot does not need to know how long its corridor is. It needs to know when it can no longer walk.',
    'Nothing you write makes one bot wait for another. Only sync() does that. So the question is not how to run them in parallel; it is where you are accidentally stopping them.',
    'A bot that is behind in time has not heard anything yet. When you call sync(), how far along is the shorter walk, and what does the other bot still have left?',
  ],
  docs: ['ticks', 'bot', 'bots', 'sync', 'send', 'recv'],
};
