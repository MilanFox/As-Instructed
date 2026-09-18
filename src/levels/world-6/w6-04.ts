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
      expected: `plain text opening "${MAGIC}"`,
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
      where: 'the headed packets',
      expected: `all ${String(expected.length)} in plain text first`,
      received: `${String(matched)} of ${String(expected.length)}`,
    };
  }
  const got = sent[expected.length];
  if (got === undefined) {
    return {
      where: 'after the last headed packet',
      expected: 'the straggler in plain text',
      received: NOTHING,
    };
  }
  const cipher = queued(ctx.initialWorld)[expected.length] ?? '';
  for (let key = 0; key < KEYSPACE; key++) {
    if (decipher(cipher, key) !== got) continue;
    return {
      where: 'the straggler',
      expected: 'the shift that reads as English',
      received: `shift ${String(key)}`,
    };
  }
  return {
    where: 'the straggler',
    expected: 'the last packet, shifted back',
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
    '**FROM:** Dep. Coordinator M. Vance',
    '',
    'The band is enciphered and nobody has the key. Procurement bought the radios on a',
    'framework that priced the cipher separately, and we did not buy the cipher. There is no',
    'key anywhere on this site.',
    '',
    'Transmit the plain text of every headed packet, whole and in order. The last one arrives',
    'without a header; read it anyway.',
  ].join('\n'),
  board: {
    fixed: [
      'the post is a 12 by 6 shack; RIG-06 stays on the antenna',
      'the whole band is queued before the shift starts, and it is drained once, in arrival order',
      `every headed packet opens with \`${MAGIC}\` at position 0 of its plain text`,
      'one shift covers every headed packet; the straggler carries its own',
      'the straggler is the last packet on the band',
      'nothing on the site reports either shift — no `probe` will hand one over',
    ],
    redrawn: [
      'the shift, anywhere in the space from 0 to 94',
      "the straggler's own shift, and which of the two is the one that changes nothing",
      'eight to thirteen headed packets',
      'what the packets say, and how long they run',
    ],
  },
  facts: [
    {
      label: 'The cipher',
      value:
        'Every packet is shifted by the **same whole number from 0 to 94**. That is the whole space.',
    },
    {
      label: 'The header',
      value: `Every headed packet begins with \`${MAGIC}\` at position 0, in the plain text. It never changes.`,
    },
    {
      label: 'Order on the wire',
      value: 'The headed packets, in arrival order, are the first thing you transmit.',
    },
    {
      label: 'The straggler',
      value:
        'The last packet has no header and a **different** shift in the same range. Its plain text is ordinary readable English, like every other packet once decoded. Send it straight after the others.',
    },
    {
      label: '`buffered()`',
      value:
        'How many packets are still unread, without taking one. Free. The straggler is the last on the band, so it is the packet after which `buffered()` reads 0.',
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
      'Relay every headed packet in plain text, in order',
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
      'Recover the unheaded packet as well',
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
    '// NOTE(4470): there is no key on this site. i looked. i looked for a week',
    '// NOTE(4470): the header is the only thing on the band that never changes',
    '',
    `// Every headed packet starts with "${MAGIC}". The shift is 0 to ${String(KEYSPACE - 1)}.`,
    '',
    'let packet = receive();',
    'while (packet !== null) {',
    '  packet = receive();',
    '}',
    '',
  ].join('\n'),
  hints: [
    'There are not many keys. There is exactly one way to know when you have the right one.',
    'You are not looking for the key. You are looking for a packet that starts with the four characters you were promised, and the key is whatever produced it.',
    'One shift in the space changes nothing at all, and it is still a shift. Either the headed packets or the straggler can be the one that arrived under it.',
    'The straggler has no header, so nothing can confirm a candidate outright. Something else about English text is true of the plain version and untrue of the other ninety-four.',
  ],
  docs: ['decode', 'receive', 'buffered', 'transmit'],
};
