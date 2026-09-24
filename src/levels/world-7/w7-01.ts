import type {
  Divergence,
  ObjectiveContext,
  RecvEvent,
  SendEvent,
  Vec,
  World,
} from '../../engine/index.ts';
import {
  DEFAULT_COSTS,
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
import { at, botsOnPads, localSeed, reportedLines } from './shared.ts';

const HEIGHT = 5;
const MAX_LEN = 9;
const WIDTH = MAX_LEN + 3;
const SEND_TICKS = DEFAULT_COSTS.send;

const LENGTHS: Record<number, [number, number]> = {
  1: [7, 4],
  2: [3, 9],
  3: [6, 6],
};

function lengthsFor(seed: number): [number, number] {
  const fixed = LENGTHS[seed];
  if (fixed) return fixed;
  const rng = new Rng(localSeed(seed));
  return [rng.int(3, MAX_LEN), rng.int(3, MAX_LEN)];
}

function padColumn(world: World, row: number): number {
  for (let x = world.w - 1; x >= 0; x--) {
    if (tileAt(world, vec(x, row))?.terrain === Terrain.Pad) return x;
  }
  return -1;
}

function waitedTicks(ctx: ObjectiveContext, botId: number): number {
  const start = ctx.initialWorld.bots.find((bot) => bot.id === botId);
  const end = ctx.world.bots.find((bot) => bot.id === botId);
  if (!start || !end) return 0;
  const walk = padColumn(ctx.initialWorld, start.at.y) - start.at.x;
  return end.clock - walk - SEND_TICKS;
}

function botOfLine(line: string): string {
  return line.split(' ')[1] ?? '';
}

function positionAt(ctx: ObjectiveContext, botId: number, tick: number): Vec | undefined {
  let pos = ctx.initialWorld.bots.find((bot) => bot.id === botId)?.at;
  for (const event of ctx.trace.events) {
    if (event.kind === 'move' && event.botId === botId && event.ok && event.t < tick) {
      pos = event.to;
    }
  }
  return pos;
}

function sentFromPad(ctx: ObjectiveContext, send: SendEvent): boolean {
  const pos = positionAt(ctx, send.botId, send.t);
  return pos !== undefined && tileAt(ctx.initialWorld, pos)?.terrain === Terrain.Pad;
}

function sendsOf(ctx: ObjectiveContext, received: RecvEvent): SendEvent[] {
  return ctx.trace.events.filter(
    (event): event is SendEvent =>
      event.kind === 'send' &&
      event.ok &&
      event.botId === received.from &&
      event.to === received.botId &&
      event.body === received.body &&
      event.t <= received.t,
  );
}

function heardFromPad(ctx: ObjectiveContext, botId: number): boolean {
  return ctx.trace.events.some(
    (event) =>
      event.kind === 'recv' &&
      event.botId === botId &&
      event.from !== null &&
      event.from !== botId &&
      sendsOf(ctx, event).some((send) => sentFromPad(ctx, send)),
  );
}

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

function unheard(ctx: ObjectiveContext): Divergence | undefined {
  for (const bot of ctx.world.bots) {
    if (heardFromPad(ctx, bot.id)) continue;
    const calls = ctx.trace.events.filter(
      (event): event is RecvEvent => event.kind === 'recv' && event.botId === bot.id,
    );
    const offPad = calls
      .filter((event) => event.from !== null && event.from !== bot.id)
      .flatMap((event) => sendsOf(ctx, event))
      .at(-1);
    const where = `bot #${String(bot.id)}`;
    if (offPad) {
      const from = positionAt(ctx, offPad.botId, offPad.t);
      return {
        where,
        expected: `a message sent from bot #${String(offPad.botId)}'s pad`,
        received: from ? `one sent from ${at(from)}` : 'one sent off its pad',
      };
    }
    const empty = calls.filter((event) => event.from === null).length;
    return {
      where,
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

function reportFor(ctx: ObjectiveContext, botId: number): string {
  return `idle ${String(botId)} ${String(waitedTicks(ctx, botId))}`;
}

function misreportedIdle(ctx: ObjectiveContext): Divergence | undefined {
  const said = reportedLines(ctx.trace.events, 'idle');
  const ids = ctx.initialWorld.bots.map((bot) => bot.id);
  for (const id of ids) {
    const subject = String(id);
    const lines = said.filter((line) => botOfLine(line) === subject);
    const first = lines[0];
    if (first === undefined) {
      return {
        where: `bot #${subject}`,
        expected: 'a line saying how long it waited',
        received: NOTHING,
      };
    }
    if (lines.length > 1) {
      return {
        where: `bot #${subject}`,
        expected: 'one line',
        received: `${String(lines.length)} lines`,
      };
    }
    if (first !== reportFor(ctx, id)) {
      return {
        where: `bot #${subject}`,
        expected: 'ticks past its walk and one send',
        received: clipValue(first),
      };
    }
  }
  const stray = said.find((line) => !ids.map(String).includes(botOfLine(line)));
  if (stray !== undefined) {
    return {
      where: 'idle report',
      expected: 'a line per bot, no more',
      received: clipValue(stray),
    };
  }
  return undefined;
}

function reportedRight(ctx: ObjectiveContext): number {
  const said = reportedLines(ctx.trace.events, 'idle');
  return ctx.initialWorld.bots.filter((bot) => {
    const lines = said.filter((line) => botOfLine(line) === String(bot.id));
    return lines.length === 1 && lines[0] === reportFor(ctx, bot.id);
  }).length;
}

export const w7_01: LevelDef = {
  id: 'w7-01',
  world: 7,
  index: 1,
  title: 'Two Bots',
  hardware: ['bot', 'bots', 'clock', 'sync', 'send', 'recv'],
  brief: [
    'Rigs bill by the tick, so the office wants to know how long each bot waited. Waiting is not a hobby. — D. Halloran',
    '',
    '**Two bots, and each counts its own ticks. Park both on their pads, and pass a message each way, pad to pad.**',
  ].join('\n'),
  board: {
    redrawn: [
      'each corridor length, 3 to 9 tiles',
      'which corridor is longer, or if they are equal',
    ],
  },
  facts: [
    { label: 'Score', value: 'The tick when the **last** bot stops.' },
    {
      label: 'Corridors',
      value: 'Each bot has its own corridor going East. Its pad is the last tile.',
    },
    {
      label: 'Clocks',
      value:
        'Each bot has its own clock. They run at once: `bot(0).move()` and `bot(1).move()` take the same tick.',
    },
    {
      label: 'Messages',
      value:
        "A message counts only if the sender stood on its pad when it sent it. `recv()` returns `null` until this bot's clock reaches the send tick.",
    },
    {
      label: 'Waiting',
      value:
        "Print `idle <id> <n>`, one line per bot, in any order. `n` is every tick on the bot's clock at the end of the run, except walking its corridor once and one `send()`.",
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
      'Park each bot on its pad',
      (ctx) => botsOnPads(ctx) === ctx.world.bots.length,
      {
        progress: (ctx) => [botsOnPads(ctx), ctx.world.bots.length],
        divergence: unparked,
      },
    ),
    Objectives.custom(
      'both-heard',
      "Each bot receives a message sent from the other bot's pad",
      (ctx) => ctx.world.bots.every((bot) => heardFromPad(ctx, bot.id)),
      {
        progress: (ctx) => [
          ctx.world.bots.filter((bot) => heardFromPad(ctx, bot.id)).length,
          ctx.world.bots.length,
        ],
        divergence: unheard,
      },
    ),
  ],
  bonus: [
    Objectives.custom(
      'name-the-idle',
      'Print how long each bot waited',
      (ctx) => misreportedIdle(ctx) === undefined,
      {
        progress: (ctx) => [reportedRight(ctx), ctx.initialWorld.bots.length],
        divergence: misreportedIdle,
      },
    ),
  ],
  starter: [
    '// Both bots run at the same time. Your score is the slower bot.',
    "// recv() only sees messages sent at or before this bot's clock.",
    '',
    'const ids = bots();',
    'bot(ids[0]).move(Dir.East);',
    '',
  ].join('\n'),
  hints: [
    'A bot does not need to know its corridor length. It walks until it cannot move.',
    'The bot with the shorter corridor reaches its pad first. The other message does not exist yet.',
    "sync() returns the new tick. Read the bot's clock before the call to know how many ticks it lost.",
  ],
  docs: ['ticks', 'bot', 'bots', 'sync', 'send', 'recv'],
};
