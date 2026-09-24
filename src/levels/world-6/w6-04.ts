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
  paintAscii,
  vec,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import {
  KEYSPACE,
  decipher,
  encipher,
  installPost,
  matchingPrefix,
  queued,
  transmitted,
} from './signal.ts';

const SHACK = [
  '############',
  '#..........#',
  '#..........#',
  '#..........#',
  '#..........#',
  '############',
];

const LEGEND = {
  '#': Terrain.Wall,
  '.': Terrain.Floor,
};

const MAST_AT = vec(6, 3);

export const MAGIC = 'KD//';

interface Shift {
  key: number;
  tailKey: number;
  packets: number;
}

const SHIFTS: Readonly<Record<number, Shift>> = Object.freeze({
  1: { key: 37, tailKey: 62, packets: 8 },
  2: { key: 71, tailKey: 19, packets: 11 },
  3: { key: 44, tailKey: 0, packets: 9 },
  4: { key: 94, tailKey: 7, packets: 13 },
});

function shiftFor(seed: number): Shift {
  return SHIFTS[seed] ?? { key: 23, tailKey: 55, packets: 10 };
}

const SUBJECTS = [
  'ROUTE',
  'YIELD',
  'INTAKE',
  'FEEDER',
  'DRUM',
  'MANIFEST',
  'SPUR',
  'BALLAST',
  'HOPPER',
  'LINTEL',
];

const VERBS = ['hold', 'release', 'recount', 'reseat', 'defer', 'log', 'seal', 'vent'];

const PLACES = [
  'south field',
  'yard four',
  'depot zero',
  'district nine',
  'the north spur',
  'bay eleven',
  'the lower aisle',
];

function payload(rng: Rng): string {
  let line = `${MAGIC}${rng.pick(SUBJECTS)} ${String(rng.int(100, 999))}: ${rng.pick(VERBS)} at ${rng.pick(PLACES)}`;
  while (line.length < rng.int(48, 150)) {
    line += `, ${rng.pick(VERBS)} ${rng.pick(SUBJECTS).toLowerCase()} ${String(rng.int(2, 99))}`;
  }
  return `${line}.`;
}

function straggler(rng: Rng): string {
  return (
    `repeater ${String(rng.int(2, 9))} relayed this without a header again, ` +
    `the aerial has been listed for replacement since ${String(rng.int(2201, 2209))} ` +
    'and the listing is the only part of it that still works'
  );
}

interface Band {
  headed: string[];
  tail: string;
}

function bandFor(seed: number): Band {
  const rng = new Rng(seed * 7919 + 64);
  const headed: string[] = [];
  for (let i = 0; i < shiftFor(seed).packets; i++) headed.push(payload(rng));
  return { headed, tail: straggler(rng) };
}

const wanted = (world: World): string[] => bandFor(world.vars.seed ?? 1).headed;

const tailPlain = (world: World): string => bandFor(world.vars.seed ?? 1).tail;

const relayed = (ctx: ObjectiveContext): string[] => transmitted(ctx.world);

function firstRelayed(ctx: ObjectiveContext): Divergence | undefined {
  const expected = wanted(ctx.initialWorld);
  const sent = relayed(ctx);
  const i = matchingPrefix(sent, expected);
  const want = expected[i];
  if (want === undefined) return undefined;
  const got = sent[i];
  if (got === undefined || !got.startsWith(MAGIC)) {
    return {
      where: `packet ${String(i)}`,
      expected: `decoded text starting "${MAGIC}"`,
      received: got === undefined ? NOTHING : clipValue(got),
    };
  }
  let n = 0;
  while (n < want.length && n < got.length && want[n] === got[n]) n++;
  return {
    where: `packet ${String(i)} · character ${String(n + 1)}`,
    expected: want[n] === undefined ? NOTHING : `"${want[n]}"`,
    received: got[n] === undefined ? NOTHING : `"${got[n]}"`,
  };
}

function firstStraggler(ctx: ObjectiveContext): Divergence | undefined {
  const expected = wanted(ctx.initialWorld);
  const sent = relayed(ctx);
  const matched = matchingPrefix(sent, expected);
  if (matched < expected.length) {
    return {
      where: 'the packets with a header',
      expected: `all ${String(expected.length)} decoded first`,
      received: `${String(matched)} of ${String(expected.length)}`,
    };
  }
  const got = sent[expected.length];
  if (got === undefined) {
    return {
      where: 'after the packets with a header',
      expected: 'the last packet, decoded',
      received: NOTHING,
    };
  }
  const cipher = queued(ctx.initialWorld)[expected.length] ?? '';
  for (let key = 0; key < KEYSPACE; key++) {
    if (decipher(cipher, key) !== got) continue;
    return {
      where: 'the last packet',
      expected: 'a key giving only allowed characters',
      received: `key ${String(key)}`,
    };
  }
  return {
    where: 'the last packet',
    expected: 'the last packet, decoded',
    received: clipValue(got),
  };
}

export const w6_04: LevelDef = {
  id: 'w6-04',
  world: 6,
  index: 4,
  title: 'The Cipher',
  hardware: [],
  brief: [
    'Nobody sold us the key with the radios. The last packet has no header, which is rude, but read it anyway. — M. Vance',
    '',
    '**Every packet is encrypted with a key you are not given. Decode each packet and send it.**',
  ].join('\n'),
  board: {
    redrawn: [
      'the key, 0 to 94',
      "the last packet's key; either key can be 0",
      '8 to 13 packets with a header',
      'the text and length of each packet',
    ],
  },
  facts: [
    {
      label: 'Shared key',
      value:
        'All packets with a header use the same key, a whole number from 0 to 94. Nothing on the site tells you the key.',
    },
    {
      label: 'Header',
      value: `Decoded, every packet except the last starts with \`${MAGIC}\`. Send them first.`,
    },
    {
      label: 'Last packet',
      value:
        'The last in the queue. No header, and a **different** key. Send it right after the others. Decoded, it has only lowercase letters, digits, spaces and commas. Only one key gives that.',
    },
  ],
  seeds: [1, 2, 3, 4],
  par: { ticks: 14 },
  build(seed: number): World {
    const { key, tailKey } = shiftFor(seed);
    const band = bandFor(seed);
    const world = createWorld({
      w: 12,
      h: 6,
      seed,
      fill: Terrain.Floor,
      vars: { seed, key, tailKey },
    });
    paintAscii(world, SHACK, LEGEND);
    const packets = band.headed
      .map((line) => encipher(line, key))
      .concat(encipher(band.tail, tailKey));
    installPost(world, { at: MAST_AT, packets });
    addBot(world, { at: MAST_AT, facing: Dir.East, name: 'RIG-06' });
    return world;
  },
  objectives: [
    Objectives.custom(
      'relay-plain',
      'Send every packet except the last, decoded, in arrival order',
      (ctx) => {
        const expected = wanted(ctx.initialWorld);
        return matchingPrefix(relayed(ctx), expected) === expected.length;
      },
      {
        progress: (ctx) => {
          const expected = wanted(ctx.initialWorld);
          return [matchingPrefix(relayed(ctx), expected), expected.length];
        },
        divergence: firstRelayed,
      },
    ),
  ],
  bonus: [
    Objectives.custom(
      'straggler',
      'Also send the last packet, decoded, right after the others',
      (ctx) => {
        const expected = wanted(ctx.initialWorld);
        const sent = relayed(ctx);
        return (
          matchingPrefix(sent, expected) === expected.length &&
          sent[expected.length] === tailPlain(ctx.initialWorld)
        );
      },
      { divergence: firstStraggler },
    ),
  ],
  starter: [
    '// NOTE(4470): there is no key on this site. i looked for a week',
    `// Packets with a header start with "${MAGIC}". The key is 0 to ${String(KEYSPACE - 1)}.`,
    '',
    'let packet = receive();',
    'while (packet !== null) {',
    '  packet = receive();',
    '}',
    '',
  ].join('\n'),
  hints: [
    'There are only 95 keys. The right one makes a packet start with the header.',
    'Key 0 changes nothing, but it is still a valid key.',
    'The last packet has no header. Test each key against its allowed characters instead.',
  ],
  docs: ['decode', 'receive', 'buffered', 'transmit'],
};
