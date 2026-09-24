import type { Divergence, Objective, ObjectiveContext, World } from '../../engine/index.ts';
import {
  Dir,
  NOTHING,
  Objectives,
  Rng,
  Terrain,
  addBot,
  clipValue,
  createWorld,
  paintAscii,
  vec,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { installPost, queued } from './signal.ts';

const SHACK = ['##########', '#........#', '#........#', '#........#', '#........#', '##########'];

const LEGEND = {
  '#': Terrain.Wall,
  '.': Terrain.Floor,
};

const MAST_AT = vec(5, 3);

const TAGS = ['BAND', 'GRID', 'MAST', 'RELAY', 'DRIFT', 'POST', 'SESS'];
const WORDS = ['NOMINAL', 'IDLE', 'STANDBY', 'CARRIER', 'QUIET', 'ACTIVE', 'SYNC', 'LOW'];

const PING = 'SESS 4470 ACTIVE';

const PING_LINE = 'ping ';

const expected = (ctx: ObjectiveContext): Objective =>
  Objectives.printedSequence(queued(ctx.initialWorld));

const withoutPingLines = (ctx: ObjectiveContext): ObjectiveContext => ({
  ...ctx,
  trace: {
    ...ctx.trace,
    events: ctx.trace.events.filter(
      (event) => !(event.kind === 'print' && event.text.startsWith(PING_LINE)),
    ),
  },
});

const pingAt = (world: World): number => queued(world).indexOf(PING);

const wantedPing = (world: World): string => {
  const index = pingAt(world);
  return index < 0 ? 'ping none' : `ping ${String(index)}`;
};

const pingLines = (ctx: ObjectiveContext): string[] =>
  ctx.trace.events
    .filter((event) => event.kind === 'print')
    .map((event) => (event.kind === 'print' ? event.text : ''))
    .filter((line) => line.startsWith(PING_LINE));

function pingReport(ctx: ObjectiveContext): Divergence | undefined {
  const said = pingLines(ctx);
  if (said.length === 0) {
    return { where: 'the ping line', expected: 'one ping line', received: NOTHING };
  }
  if (said.length > 1) {
    return {
      where: 'the ping line',
      expected: '1 line',
      received: `${String(said.length)} lines`,
    };
  }
  const got = said[0] as string;
  if (got === wantedPing(ctx.initialWorld)) return undefined;
  return {
    where: 'the ping line',
    expected: pingAt(ctx.initialWorld) < 0 ? 'ping none' : 'the position of the ping',
    received: clipValue(got),
  };
}

export const w6_01: LevelDef = {
  id: 'w6-01',
  world: 6,
  index: 1,
  title: 'Carrier Wave',
  hardware: ['receive', 'buffered'],
  brief: [
    'This radio hut has listened for thirteen years and nobody ever read the queue. One packet is not ours, so tell me where it sits. — D. Halloran',
    '',
    '**Print every packet in the queue, in order. The queue can be empty.**',
  ].join('\n'),
  board: {
    redrawn: [
      'queue length: 5 to 15 packets, or empty',
      'the text of each packet',
      'the position of the ping',
    ],
  },
  facts: [
    {
      label: 'Packets',
      value:
        'All packets are in the queue at the start. `receive()` returns `null` when it is empty.',
    },
    {
      label: 'Ping',
      value: 'The packet `SESS 4470 ACTIVE`. Every queue that has packets has one.',
    },
    {
      label: 'Ping line',
      value:
        "Print one line: `ping ` and the ping's position in the queue, counting from 0. If the queue is empty, print `ping none`.",
    },
  ],
  seeds: [1, 2, 3],
  par: { ticks: 1 },
  graded: false,
  build(seed: number): World {
    const world = createWorld({ w: 10, h: 6, seed, fill: Terrain.Floor });
    paintAscii(world, SHACK, LEGEND);
    const rng = new Rng(seed * 7919 + 61);
    const count = seed === 3 ? 0 : rng.int(5, 15);
    const packets: string[] = [];
    for (let i = 0; i < count; i++) {
      packets.push(`${rng.pick(TAGS)} ${String(rng.int(1000, 9999))} ${rng.pick(WORDS)}`);
    }
    if (count > 0) packets[rng.int(0, count - 1)] = PING;
    installPost(world, { at: MAST_AT, packets });
    addBot(world, { at: MAST_AT, facing: Dir.East, name: 'RIG-06' });
    return world;
  },
  objectives: [
    Objectives.custom(
      'log-the-band',
      'Print every packet in the queue, in order',
      (ctx) => expected(ctx).evaluate(withoutPingLines(ctx)),
      {
        progress: (ctx) => expected(ctx).progress?.(withoutPingLines(ctx)) ?? [0, 0],
        divergence: (ctx) => expected(ctx).divergence?.(withoutPingLines(ctx)),
      },
    ),
  ],
  bonus: [
    Objectives.custom(
      'name-the-ping',
      "Print the ping line: the ping's position in the queue",
      (ctx) => {
        const said = pingLines(ctx);
        return said.length === 1 && said[0] === wantedPing(ctx.initialWorld);
      },
      { divergence: pingReport },
    ),
  ],
  starter: [
    '// The bot stands on the antenna. It does not need to move.',
    '// NOTE(4470): sometimes the queue is empty',
    '',
    'const packet = receive();',
    'print(packet);',
    '',
  ].join('\n'),
  hints: ['You do not know how many packets there are. Read until the queue is empty.'],
  docs: ['receive', 'buffered', 'print'],
};
