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
  additive,
  installPost,
  matchingPrefix,
  postVar,
  queued,
  transmitted,
  weighted,
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

interface Packet {
  text: string;
  bytes: number[];
  sum: number;
  weight: number;
}

function parsePacket(text: string): Packet | null {
  const star = text.indexOf('*');
  if (star < 0) return null;
  const bytes = text.slice(0, star).split(',').map(Number);
  const claimed = text.slice(star + 1).split(',').map(Number);
  if (claimed.length !== 2) return null;
  return { text, bytes, sum: claimed[0] ?? -1, weight: claimed[1] ?? -1 };
}

const band = (world: World): Packet[] =>
  queued(world)
    .map(parsePacket)
    .filter((packet): packet is Packet => packet !== null);

const verifies = (packet: Packet, salt: number): boolean =>
  additive(packet.bytes, salt) === packet.sum && weighted(packet.bytes, salt) === packet.weight;

const cleanTraffic = (world: World): string[] => {
  const salt = postVar(world, 'salt');
  return band(world)
    .filter((packet) => verifies(packet, salt))
    .map((packet) => packet.text);
};

/**
 * Which byte was altered. One byte moved by an odd delta, so the plain difference is invertible
 * mod 256 and the weighted difference names the position uniquely — which is what makes the
 * bonus solvable at all. The `A corrupt packet` fact card states the odd delta (DESIGN.md §11).
 */
const faultReports = (world: World): string[] => {
  const salt = postVar(world, 'salt');
  const out: string[] = [];
  band(world).forEach((packet, index) => {
    if (verifies(packet, salt)) return;
    const plain = (additive(packet.bytes, salt) - packet.sum + 256) % 256;
    const skewed = (weighted(packet.bytes, salt) - packet.weight + 256) % 256;
    for (let i = 0; i < packet.bytes.length; i++) {
      if (((i + 1) * plain) % 256 === skewed) out.push(`bad ${String(index)} ${String(i)}`);
    }
  });
  return out;
};

const relayed = (ctx: ObjectiveContext): string[] => transmitted(ctx.world);

const reported = (ctx: ObjectiveContext): string[] =>
  ctx.trace.events
    .filter((event) => event.kind === 'print')
    .map((event) => (event.kind === 'print' ? event.text : ''))
    .filter((line) => line.startsWith('bad '));

/**
 * The first packet the run handled differently from the band did.
 *
 * Walking the band rather than the outgoing stream is what lets the report name *which* packet
 * went the wrong way, and in which direction, rather than which slot of the relay disagreed. It
 * gives back the level's verdict on one packet out of twenty to forty; the rule that produces
 * that verdict is still the player's to write.
 */
function firstMishandled(ctx: ObjectiveContext): Divergence | undefined {
  const salt = postVar(ctx.initialWorld, 'salt');
  const sent = relayed(ctx);
  const packets = band(ctx.initialWorld);
  let next = 0;
  for (let i = 0; i < packets.length; i++) {
    const packet = packets[i] as Packet;
    const clean = verifies(packet, salt);
    const wentOut = sent[next] === packet.text;
    if (clean && !wentOut) {
      return {
        where: `packet ${String(i)} on the band`,
        expected: 'relayed',
        received: sent[next] === undefined ? 'nothing more was sent' : 'not relayed',
      };
    }
    if (!clean && wentOut) {
      return {
        where: `packet ${String(i)} on the band`,
        expected: 'held back',
        received: 'relayed',
      };
    }
    if (wentOut) next++;
  }
  const extra = sent[next];
  if (extra === undefined) return undefined;
  return {
    where: 'after the last clean packet',
    expected: 'nothing more',
    received: clipValue(extra),
  };
}

/** `bad <packet> <byte>` split back into its two numbers, or null when it is not that shape. */
function readFault(line: string): { packet: number; byte: number } | null {
  const parts = line.split(' ');
  if (parts.length !== 3) return null;
  const packet = Number(parts[1]);
  const byte = Number(parts[2]);
  if (!Number.isInteger(packet) || !Number.isInteger(byte)) return null;
  return { packet, byte };
}

/**
 * Where the fault report and the band part company, without ever saying which byte was altered.
 *
 * Naming the byte would be the whole bonus, so what comes back instead is the run's own answer
 * for one packet and the fact that it is the wrong one. That rules out a single byte of the four
 * to ten in that packet and leaves the arithmetic that finds the rest exactly where it was.
 */
function firstFault(ctx: ObjectiveContext): Divergence | undefined {
  const wanted = faultReports(ctx.initialWorld);
  const said = reported(ctx);
  const i = matchingPrefix(said, wanted);
  const want = wanted[i];
  const got = said[i];
  if (want === undefined) {
    if (got === undefined) return undefined;
    return {
      where: `fault line ${String(i + 1)}`,
      expected: 'no more corrupt packets',
      received: clipValue(got),
    };
  }
  const target = readFault(want);
  if (target === null) return undefined;
  if (got === undefined) {
    return {
      where: `packet ${String(target.packet)} on the band`,
      expected: 'a line naming its altered byte',
      received: NOTHING,
    };
  }
  const mine = readFault(got);
  if (mine !== null && mine.packet === target.packet) {
    return {
      where: `packet ${String(target.packet)} on the band`,
      expected: 'a different byte',
      received: `byte ${String(mine.byte)}`,
    };
  }
  return {
    where: `fault line ${String(i + 1)}`,
    expected: `a line about packet ${String(target.packet)}`,
    received: clipValue(got),
  };
}

/**
 * The salt is the anti-hardcode axis alongside the corruption pattern: it is drawn per seed and
 * only readable from the antenna, so a memorised check fails on the next shift.
 *
 * Par: the reference transmits every clean packet and nothing else, so its tick count is the
 * clean-packet count. Seed 2 has no corruption and costs 37 ticks, the most of any seed; that is
 * `par.ticks`. No shave is available — a packet cannot be relayed for less than one transmit.
 */
export const w6_02: LevelDef = {
  id: 'w6-02',
  world: 6,
  index: 2,
  title: 'Checksum',
  hardware: ['transmit'],
  brief: [
    '**FROM:** Dep. Coordinator M. Vance',
    '',
    'Signal discipline on this band is mandatory. In 2207 an unverified packet was actioned and',
    'the south field harvested itself on schedule. Memo KD-2601 covers it, in one paragraph, and',
    'it is not reassuring.',
    '',
    'Relay every packet whose check values match, unchanged and in order. Relay nothing else.',
  ].join('\n'),
  facts: [
    {
      label: 'A packet',
      value: '`b0,b1,...,bn*S,W` — payload bytes, 0 to 255, then the two check values.',
    },
    { label: '`S`', value: '`(salt + b0 + b1 + ... + bn) mod 256`' },
    { label: '`W`', value: '`(salt + 1*b0 + 2*b1 + ... + (n+1)*bn) mod 256`' },
    { label: 'The salt', value: "`probe('mast').vars.salt`. Free, and a new number every shift." },
    {
      label: '`buffered()`',
      value:
        'How many packets are still unread, without taking one. Free, and it takes nothing off the band — it is the length of the band before you read any of it, and 0 once you have drained it.',
    },
    {
      label: 'A corrupt packet',
      value:
        'Exactly one payload byte altered, and always by an odd amount mod 256 — so both checks disagree, and exactly one position can account for the pair of differences.',
    },
    {
      label: 'Fault report',
      value:
        'One line per corrupt packet, in arrival order: `bad <packet> <byte>`. Both counted from 0, and `<packet>` counts the clean ones too.',
    },
  ],
  seeds: [1, 2, 3, 4],
  par: { ticks: 37 },
  build(seed: number): World {
    const world = createWorld({ w: 12, h: 6, seed, fill: Terrain.Floor });
    paintAscii(world, SHACK, LEGEND);
    const rng = new Rng(seed * 7919 + 62);
    const salt = rng.int(0, 255);
    const count = rng.int(20, 40);
    // Seed 2 is the clean band; seed 3 corrupts packet 0. CURRICULUM.md §8.
    const rate = seed === 2 ? 0 : rng.int(10, 30) / 100;
    const packets: string[] = [];
    let corrupted = 0;
    for (let i = 0; i < count; i++) {
      const bytes: number[] = [];
      const length = rng.int(4, 10);
      for (let b = 0; b < length; b++) bytes.push(rng.int(0, 255));
      const sum = additive(bytes, salt);
      const skew = weighted(bytes, salt);
      const last = i === count - 1;
      const spoil =
        rate > 0 && ((seed === 3 && i === 0) || rng.chance(rate) || (last && corrupted === 0));
      if (spoil) {
        const at = rng.int(0, bytes.length - 1);
        bytes[at] = ((bytes[at] ?? 0) + rng.int(0, 127) * 2 + 1) % 256;
        corrupted++;
      }
      packets.push(`${bytes.join(',')}*${String(sum)},${String(skew)}`);
    }
    installPost(world, { at: MAST_AT, packets, vars: { salt } });
    addBot(world, { at: MAST_AT, facing: Dir.East, name: 'RIG-06' });
    return world;
  },
  objectives: [
    Objectives.custom(
      'relay-clean',
      'Relay every packet that verifies, and only those',
      (ctx) => {
        const wanted = cleanTraffic(ctx.initialWorld);
        const sent = relayed(ctx);
        return sent.length === wanted.length && matchingPrefix(sent, wanted) === wanted.length;
      },
      {
        progress: (ctx) => {
          const wanted = cleanTraffic(ctx.initialWorld);
          return [matchingPrefix(relayed(ctx), wanted), wanted.length];
        },
        divergence: firstMishandled,
      },
    ),
  ],
  bonus: [
    Objectives.custom(
      'name-the-fault',
      'Report the altered byte in every corrupt packet',
      (ctx) => {
        const wanted = faultReports(ctx.initialWorld);
        const said = reported(ctx);
        return said.length === wanted.length && matchingPrefix(said, wanted) === wanted.length;
      },
      {
        progress: (ctx) => {
          const wanted = faultReports(ctx.initialWorld);
          return [matchingPrefix(reported(ctx), wanted), wanted.length];
        },
        divergence: firstFault,
      },
    ),
  ],
  starter: [
    '// Relay the packets that verify. Reject the rest.',
    '',
    "const salt = probe('mast').vars.salt;",
    '',
    'let packet = receive();',
    'while (packet !== null) {',
    '  packet = receive();',
    '}',
    '',
  ].join('\n'),
  hints: [
    'A packet carries its own verdict. Work out what the two check values should be before you decide what to do with the packet.',
    'The salt is not in this text and it is not the same on the next shift. The antenna knows it, and asking costs nothing.',
    'Declining to send is an action. Some shifts nothing is wrong, and some shifts the first thing you see is.',
  ],
  docs: ['transmit', 'probe', 'receive', 'buffered'],
};
