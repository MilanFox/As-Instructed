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
    return { where: 'the ping line', expected: 'one line naming the ping', received: NOTHING };
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
    expected: pingAt(ctx.initialWorld) < 0 ? 'ping none' : 'the arrival number of the ping',
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
    '**FROM:** Field Engineer D. Halloran',
    '',
    'the post has been listening on this band for thirteen years. nobody has read the queue.',
    'some shifts there is nothing on it, and nothing is still a reading. a ping in the traffic',
    'is not ours. say where it sat.',
    '',
    'Print every packet on the band, in order, exactly as it arrived.',
  ].join('\n'),
  board: {
    fixed: [
      'the post is a 10 by 6 shack; RIG-06 is parked on the antenna and nothing here needs it to move',
      'the whole band is queued before the shift starts — nothing arrives while you read it',
      'every packet is one line of text, handed over in arrival order',
      "a status ping that is not the post's sits somewhere on every band that has traffic",
    ],
    redrawn: [
      'how long the queue is — five to fifteen packets, or none at all',
      'what each packet says',
      'where the ping sits in the queue',
    ],
  },
  facts: [
    {
      label: '`receive()`',
      value: 'The next packet as a string, or `null` once the queue is empty. Free.',
    },
    {
      label: '`buffered()`',
      value:
        'How many packets are still unread, without taking one. Free, and reading it takes nothing off the queue, so `buffered() === 0` is an empty queue.',
    },
    { label: 'The queue', value: 'A different length every shift. Some shifts it is empty.' },
    {
      label: 'The ping',
      value:
        "One packet on every band that has traffic reads `SESS 4470 ACTIVE`. It is not the post's.",
    },
    {
      label: 'Ping report',
      value:
        'One line: `ping ` then its arrival number, counted from 0. `ping none` when the band is empty.',
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
      'Print every queued packet, in order',
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
      'Report where the ping sat on the band',
      (ctx) => {
        const said = pingLines(ctx);
        return said.length === 1 && said[0] === wantedPing(ctx.initialWorld);
      },
      { divergence: pingReport },
    ),
  ],
  starter: [
    '// The bot is parked on the antenna. Nothing on this level needs to move.',
    '',
    '// NOTE(4470): the queue is short and some shifts it is empty',
    '// NOTE(4470): if there is traffic there is a ping in it. it is not ours',
    '',
    'const packet = receive();',
    'print(packet);',
    '',
  ].join('\n'),
  hints: [
    'You do not know how many packets are waiting. Ask the band, rather than deciding in advance.',
    'The queue tells you when it is finished by handing you something that is not a packet.',
    'A shift with no traffic is a normal shift. Your program has to survive arriving at one.',
  ],
  docs: ['receive', 'buffered', 'print'],
};
