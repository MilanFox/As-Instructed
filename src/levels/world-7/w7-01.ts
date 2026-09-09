import type { Divergence, ObjectiveContext, World } from '../../engine/index.ts';
import {
  Dir,
  NOTHING,
  Objectives,
  Rng,
  Terrain,
  addBot,
  clipValue,
  createWorld,
  setTile,
  tileAt,
  vec,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import {
  at,
  botsOnPads,
  heardFromAnother,
  idleTicks,
  localSeed,
  matchingPrefix,
  reportedLines,
} from './shared.ts';

const HEIGHT = 5;
const MAX_LEN = 9;
const WIDTH = MAX_LEN + 3;

/**
 * Corridor lengths per seed. Seed 1 is the smallest honest imbalance, seed 2 differs by 3x, and
 * seed 3 is the equal pair.
 *
 * The equal pair is the degenerate one and it sits last on purpose. On two corridors of the same
 * length nobody is behind, so `recv()` works without a `sync()` and every bot's idle is zero — a
 * seed that opens on it hands out a pass to a program that never syncs and to a report that says
 * `0` from memory, and neither is the thing this level asks for.
 */
const LENGTHS: Record<number, [number, number]> = {
  1: [6, 5],
  2: [3, 9],
  3: [6, 6],
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
 * The idle report the run owes, one line per bot, in id order.
 *
 * Idle is read from the trace rather than from the corridor lengths on purpose: it is a fact
 * about the *schedule the player wrote*, not about the site. Two programs that both park both
 * bots can stand still for wildly different amounts of time, and only one of them knows it.
 */
function idleReport(ctx: ObjectiveContext): string[] {
  return ctx.initialWorld.bots.map(
    (bot) => `idle ${String(bot.id)} ${String(idleTicks(ctx.trace.events, new Set([bot.id])))}`,
  );
}

/** Which bot line `n` of the report is about, taken from the answer rather than from the run. */
function botOfLine(line: string): string {
  return line.split(' ')[1] ?? '';
}

/** The first bot the run did not leave standing on the pad at the end of its own corridor. */
function unparked(ctx: ObjectiveContext): Divergence | undefined {
  for (const bot of ctx.world.bots) {
    if (bot.alive && tileAt(ctx.world, bot.at)?.terrain === Terrain.Pad) continue;
    const row = ctx.initialWorld.bots.find((each) => each.id === bot.id)?.at.y ?? bot.at.y;
    const column = padColumn(ctx.initialWorld, row);
    return {
      where: `bot #${String(bot.id)}`,
      expected: column >= 0 ? at(vec(column, row)) : 'the pad on its own row',
      received: bot.alive ? at(bot.at) : `${at(bot.at)}, and not running`,
    };
  }
  return undefined;
}

/**
 * The first bot that never read a message another bot sent it, and whether it asked at all.
 *
 * `recv` handing back `null` until the reader's own clock catches up is the whole difficulty
 * here, so the count of reads that came back empty is exactly the thing the program cannot see
 * and the trace can. A bot that never asked and a bot that asked forty times too early are the
 * two different mistakes that `1 of 2` was hiding.
 */
function unheard(ctx: ObjectiveContext): Divergence | undefined {
  for (const bot of ctx.world.bots) {
    if (heardFromAnother(ctx.trace.events, bot.id)) continue;
    const calls = ctx.trace.events.filter(
      (event) => event.kind === 'recv' && event.botId === bot.id,
    );
    const empty = calls.filter((event) => event.kind === 'recv' && event.from === null).length;
    return {
      where: `bot #${String(bot.id)}`,
      expected: 'a message from the other bot',
      received:
        calls.length === 0
          ? 'never called recv()'
          : empty === 0
            ? 'only its own messages'
            : `${String(empty)} empty recv() calls`,
    };
  }
  return undefined;
}

/**
 * Where the idle report and the run part company, without ever handing over an idle count.
 *
 * The number is the whole bonus, so a wrong figure is answered with the run's own figure and the
 * fact that it is wrong. That still tells the player which bot they mis-read, which is the thing
 * a bare `not met` on a two-line report cannot.
 */
function misreportedIdle(ctx: ObjectiveContext): Divergence | undefined {
  const wanted = idleReport(ctx);
  const said = reportedLines(ctx.trace.events, 'idle');
  const i = matchingPrefix(said, wanted);
  const want = wanted[i];
  const got = said[i];
  if (want === undefined) {
    if (got === undefined) return undefined;
    return {
      where: `report line ${String(i + 1)}`,
      expected: 'no more bots',
      received: clipValue(got),
    };
  }
  const subject = botOfLine(want);
  if (got === undefined) {
    return {
      where: `bot #${subject}`,
      expected: 'a line saying how long it stood still',
      received: NOTHING,
    };
  }
  if (botOfLine(got) === subject) {
    return {
      where: `bot #${subject}`,
      expected: 'a different figure',
      received: clipValue(got),
    };
  }
  return {
    where: `report line ${String(i + 1)}`,
    expected: `a line about bot #${subject}`,
    received: clipValue(got),
  };
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
    {
      label: 'Idle report',
      value:
        'One line per bot, in id order: `idle <bot> <n>`, where `n` is the ticks that bot spent waiting — its own `wait` calls plus whatever a `sync()` cost it.',
    },
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
      {
        progress: (ctx) => [botsOnPads(ctx), ctx.world.bots.length],
        divergence: unparked,
      },
    ),
    Objectives.custom(
      'both-heard',
      "Have each bot receive the other bot's message",
      (ctx) => ctx.world.bots.every((bot) => heardFromAnother(ctx.trace.events, bot.id)),
      {
        progress: (ctx) => [
          ctx.world.bots.filter((bot) => heardFromAnother(ctx.trace.events, bot.id)).length,
          ctx.world.bots.length,
        ],
        divergence: unheard,
      },
    ),
  ],
  bonus: [
    Objectives.custom(
      'name-the-idle',
      'Report how long each bot stood idle',
      (ctx) => {
        const wanted = idleReport(ctx);
        const said = reportedLines(ctx.trace.events, 'idle');
        return said.length === wanted.length && matchingPrefix(said, wanted) === wanted.length;
      },
      {
        progress: (ctx) => {
          const wanted = idleReport(ctx);
          return [matchingPrefix(reportedLines(ctx.trace.events, 'idle'), wanted), wanted.length];
        },
        divergence: misreportedIdle,
      },
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
    'sync() hands back the tick it dragged everyone up to. A bot that asks its own clock first knows exactly how much of the shift it just lost.',
  ],
  docs: ['ticks', 'bot', 'bots', 'sync', 'send', 'recv'],
};
