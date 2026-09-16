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
  const claimed = text
    .slice(star + 1)
    .split(',')
    .map(Number);
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

const NIL_RETURN = 'bad none';

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
  return out.length === 0 ? [NIL_RETURN] : out;
};

const relayed = (ctx: ObjectiveContext): string[] => transmitted(ctx.world);

const reported = (ctx: ObjectiveContext): string[] =>
  ctx.trace.events
    .filter((event) => event.kind === 'print')
    .map((event) => (event.kind === 'print' ? event.text : ''))
    .filter((line) => line.startsWith('bad '));

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

function readFault(line: string): { packet: number; byte: number } | null {
  const parts = line.split(' ');
  if (parts.length !== 3) return null;
  const packet = Number(parts[1]);
  const byte = Number(parts[2]);
  if (!Number.isInteger(packet) || !Number.isInteger(byte)) return null;
  return { packet, byte };
}

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
  if (want === NIL_RETURN) {
    return {
      where: 'the fault report',
      expected: NIL_RETURN,
      received: got === undefined ? NOTHING : clipValue(got),
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
      expected: 'the byte that explains both checks',
      received: `byte ${String(mine.byte)}`,
    };
  }
  return {
    where: `fault line ${String(i + 1)}`,
    expected: `a line about packet ${String(target.packet)}`,
    received: clipValue(got),
  };
}

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
    'the south field harvested itself on schedule. Memo KD-2601 covers it and is not reassuring.',
    '',
    'Relay the packets that verify. Name the failing byte in anything you hold; a nil return is',
    'still a return.',
  ].join('\n'),
  board: {
    fixed: [
      'the post is a 12 by 6 shack; RIG-06 stays on the antenna',
      'the whole band is queued before the shift starts, and it is drained once, in arrival order',
      'every packet carries its own two check values, over four to ten payload bytes',
      'a corrupt packet has exactly one payload byte altered; the check values themselves are never touched',
    ],
    redrawn: [
      'the salt',
      'twenty to forty packets on the band',
      'how many bytes each packet carries',
      'how much of the band is corrupt — a tenth to a third of it, or none of it',
      'which byte of a corrupt packet was altered',
      'whether the first packet you read is one of them',
    ],
  },
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
        'One line per corrupt packet, in arrival order: `bad <packet> <byte>`. Both counted from 0, and `<packet>` counts the clean ones too. A shift with nothing corrupt gets one line, `bad none`.',
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
