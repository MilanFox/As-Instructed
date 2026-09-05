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
    '**TO:** Contractor #4471',
    '',
    'two bots now. they run at the same time, on separate clocks, and the number Finance',
    'reads is the finish time of the last one. not the total. the total is a much larger',
    'number that nobody upstairs has ever asked for.',
    '',
    'Park each bot on the pad at the end of its own corridor, and have each bot receive the',
    "other bot's arrival message.",
    '',
    'Two things about this world that are not obvious:',
    '',
    '1. **Your score is the makespan** — the largest bot clock at the end of the run, not the',
    '   sum of them. Issuing `bot(0).move(...)` and then `bot(1).move(...)` does not make bot 1',
    '   wait for bot 0; the two clocks are independent and both moves happen in the same tick.',
    '   If you count the commands you wrote and compare that to the tick count, the two numbers',
    '   will not match, and the tick count is the one that is right.',
    '2. **A message is not readable until the reader has caught up to the sender.** `recv()`',
    '   returns `null` while the receiving bot\'s own clock is still behind the tick at which the',
    '   message was sent. `sync()` raises every living bot to the highest clock in the fleet,',
    '   which is the blunt way to fix that. The idiom is: `send`, then `sync`, then `recv`.',
    '',
    '`sync()` is not free. It costs every bot that was ahead of schedule the time it spends',
    'waiting for the others, and that time lands on your makespan. Sync once, at the end.',
  ].join('\n'),
  seeds: [1, 2, 3],
  par: { ticks: 10, chars: 260 },
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
    'Both corridors are dead ends. Neither bot needs to know how long its own corridor is before it starts walking — it only needs to know when it has stopped being able to walk.',
    'Nothing you write makes one bot wait for another. Only sync() does that. So the question is not how to run them in parallel; it is where you are accidentally stopping them.',
    'A bot that is behind in virtual time has not heard anything yet. Ask yourself how far along the shorter walk the fleet is when you call sync(), and what the other bot still has left to do at that moment.',
  ],
  docs: ['bot', 'bots', 'sync', 'send', 'recv'],
};
