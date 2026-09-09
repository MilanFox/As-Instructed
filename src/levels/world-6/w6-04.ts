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

/** The four bytes every packet on this band opens with. Stated in the brief, deliberately. */
export const MAGIC = 'KD//';

interface Shift {
  key: number;
  tailKey: number;
  packets: number;
}

/**
 * Seed 3 carries key 0 — the traffic is already plain and the header is sitting there in the
 * clear. Any program that assumes the answer has to be an interesting number stops there
 * (CURRICULUM.md §8). Seed 4 carries 94, the far end of the space.
 */
const SHIFTS: Readonly<Record<number, Shift>> = Object.freeze({
  1: { key: 37, tailKey: 62, packets: 8 },
  2: { key: 71, tailKey: 19, packets: 11 },
  3: { key: 0, tailKey: 44, packets: 9 },
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

/**
 * Payloads are 40 to 200 printable bytes, assembled from a word bank so that the plain text is
 * recognisable English once a program has the shift, and so nothing about the *contents* is
 * stable across seeds.
 */
function payload(rng: Rng): string {
  let line = `${MAGIC}${rng.pick(SUBJECTS)} ${String(rng.int(100, 999))}: ${rng.pick(VERBS)} at ${rng.pick(PLACES)}`;
  while (line.length < rng.int(48, 150)) {
    line += `, ${rng.pick(VERBS)} ${rng.pick(SUBJECTS).toLowerCase()} ${String(rng.int(2, 99))}`;
  }
  return `${line}.`;
}

/** The unheaded straggler at the end of the band. Lowercase and spaced, so scoring finds it. */
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

/**
 * The first packet on the wire that is not the plain text of the headed packet it stands for.
 *
 * The header is the level's own test and the facts publish it, so a report that says the line did
 * not open with it gives nothing away that the fact table has not already given. When the header
 * did survive and the rest did not, the point narrows to the one character where the two texts
 * part, which is the smallest thing there is to say.
 */
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

/**
 * The straggler's plain text is the entire bonus, so the report never contains a character of it.
 *
 * What it can give back is the shift the run actually used, recovered from what went on the wire.
 * One of the ninety-five is ruled out, the run's own number is the thing being ruled out, and the
 * other ninety-four are still there to be sifted by whatever test the player comes up with.
 */
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
      expected: 'a different shift',
      received: `shift ${String(key)}`,
    };
  }
  return {
    where: 'the straggler',
    expected: 'the last packet, shifted back',
    received: clipValue(got),
  };
}

/**
 * Par: the reference sends one line per headed packet plus the straggler, and a packet cannot be
 * relayed for less than one transmit. Thirteen headed packets on seed 4 plus the straggler is 14,
 * which is par exactly — the search itself is free.
 */
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
    'Transmit the plain text of every headed packet, whole and in order. Transmit nothing else',
    'before them.',
  ].join('\n'),
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
      label: 'The straggler',
      value:
        'The last packet has no header and a **different** shift in the same range. Its plain text is ordinary readable English, like every other packet once decoded. Send it straight after the others.',
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
      // The key lives on the world, not the antenna: `probe` must not be able to hand it over.
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
    'One shift in the space is not interesting at all, and it is still a shift. A program that skips it will pass three shifts and fail the fourth.',
    'The straggler has no header, so nothing can confirm a candidate outright. Something else about English text is true of the plain version and untrue of the other ninety-four.',
  ],
  docs: ['decode', 'receive', 'transmit'],
};
