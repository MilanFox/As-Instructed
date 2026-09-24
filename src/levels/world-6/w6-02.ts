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
        where: `packet ${String(i)} in the queue`,
        expected: 'sent',
        received: sent[next] === undefined ? 'nothing more was sent' : 'not sent',
      };
    }
    if (!clean && wentOut) {
      return {
        where: `packet ${String(i)} in the queue`,
        expected: 'held back',
        received: 'sent',
      };
    }
    if (wentOut) next++;
  }
  const extra = sent[next];
  if (extra === undefined) return undefined;
  return {
    where: 'after the last good packet',
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
      expected: 'no more bad packets',
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
      where: `packet ${String(target.packet)} in the queue`,
      expected: 'a line naming its changed byte',
      received: NOTHING,
    };
  }
  const mine = readFault(got);
  if (mine !== null && mine.packet === target.packet) {
    return {
      where: `packet ${String(target.packet)} in the queue`,
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
    'In 2207 we obeyed a bad packet and harvested a whole field by mistake. For each bad one, tell us which byte lied. — M. Vance',
    '',
    '**Check every packet. Send the good ones. Do not send the bad ones.**',
  ].join('\n'),
  board: {
    redrawn: [
      'the salt',
      '20 to 40 packets',
      'bytes per packet',
      '10% to 30% of packets are bad, or none',
      'which byte is changed',
      'whether the first packet is bad',
    ],
  },
  facts: [
    {
      label: 'Packet format',
      value: '`b0,b1,...,bn*S,W`: the bytes (0 to 255), then two check values.',
    },
    {
      label: 'Checks',
      value:
        '`S` is `(salt + b0 + b1 + ... + bn) mod 256`. `W` is `(salt + 1*b0 + 2*b1 + ... + (n+1)*bn) mod 256`.',
    },
    { label: 'Salt', value: "`probe('mast').vars.salt`. Costs no tick." },
    {
      label: 'Good packet',
      value: 'Both `S` and `W` match. Send its text unchanged with `transmit()`.',
    },
    {
      label: 'Bad packet',
      value:
        'One byte was changed by an odd amount. `S` and `W` were not changed. Only one byte position explains both errors.',
    },
    {
      label: 'Changed byte',
      value:
        'For each bad packet, in order, print `bad <packet> <byte>`. Both count from 0. `<packet>` counts all packets. If none is bad, print `bad none`.',
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
      'Send every good packet, in arrival order, and no bad packet',
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
      'Print the changed byte of every bad packet',
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
    '// Send the packets whose checks match. Do not send the others.',
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
    'Compute both check values yourself. Compare them with the two in the packet.',
    'In a bad packet, compare the error in W with the error in S.',
  ],
  docs: ['transmit', 'probe', 'receive', 'buffered'],
};
