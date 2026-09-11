import type { Objective, ObjectiveContext, World } from '../../engine/index.ts';
import {
  Dir,
  Objectives,
  Rng,
  Terrain,
  addBot,
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

const expected = (ctx: ObjectiveContext): Objective =>
  Objectives.printedSequence(queued(ctx.initialWorld));

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
    'it is not a long queue. some shifts there is nothing on it at all, and nothing is still',
    'a reading.',
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
      (ctx) => expected(ctx).evaluate(ctx),
      {
        progress: (ctx) => expected(ctx).progress?.(ctx) ?? [0, 0],
        divergence: (ctx) => expected(ctx).divergence?.(ctx),
      },
    ),
  ],
  starter: [
    '// The bot is parked on the antenna. Nothing on this level needs to move.',
    '',
    '// NOTE(4470): the queue is short and some shifts it is empty',
    '// NOTE(4470): there is a ping on this band every shift. it is not ours',
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
