import type { Divergence, ObjectiveContext, Vec, World } from '../../engine/index.ts';
import {
  Dir,
  NOTHING,
  Objectives,
  Rng,
  Terrain,
  addBot,
  clipValue,
  createWorld,
  setTerrain,
  step,
  vec,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import {
  decipher,
  driveTheRoute,
  installPost,
  postVar,
  queued,
  stayOnRoute,
  transmitted,
} from './signal.ts';

const FIELD = 20;
const START = vec(1, 5);
const PAD = vec(18, 13);

const EAST_SEGMENTS = 7;
const EAST_TOTAL = 17;
const DOWN_TOTAL = 14;
const UP_TOTAL = 6;
const ROUTE_MOVES = EAST_TOTAL + DOWN_TOTAL + UP_TOTAL;

const LETTERS = 'NESW';

const dirOf = (letter: string): Dir =>
  letter === 'N' ? Dir.North : letter === 'E' ? Dir.East : letter === 'S' ? Dir.South : Dir.West;

function split(rng: Rng, total: number, parts: number, max: number): number[] {
  const out = new Array<number>(parts).fill(1);
  let left = total - parts;
  while (left > 0) {
    const i = rng.int(0, parts - 1);
    if ((out[i] ?? 0) >= max) continue;
    out[i] = (out[i] ?? 0) + 1;
    left--;
  }
  return out;
}

function insertAt(values: readonly number[], index: number, value: number): number[] {
  return [...values.slice(0, index), value, ...values.slice(index)];
}

function eastSegments(rng: Rng): number[] {
  const long = rng.int(10, 11);
  const rest = split(rng, EAST_TOTAL - long - 1, EAST_SEGMENTS - 2, 9);
  const withOne = insertAt(rest, rng.int(0, EAST_SEGMENTS - 2), 1);
  return insertAt(withOne, rng.int(0, EAST_SEGMENTS - 1), long);
}

interface Run {
  count: number;
  letter: string;
}

function routeRuns(rng: Rng): Run[] {
  const east = eastSegments(rng);
  const down = split(rng, DOWN_TOTAL, 3, 9);
  const up = split(rng, UP_TOTAL, 3, 4);
  const runs: Run[] = [];
  for (let i = 0; i < EAST_SEGMENTS; i++) {
    runs.push({ count: east[i] ?? 1, letter: 'E' });
    if (i < 3) runs.push({ count: down[i] ?? 1, letter: 'S' });
    if (i >= 3 && i < 6) runs.push({ count: up[i - 3] ?? 1, letter: 'N' });
  }
  return runs;
}

function encodeRuns(rng: Rng, runs: readonly Run[]): string {
  const eligible: number[] = [];
  runs.forEach((run, i) => {
    if (run.count >= 2 && run.count <= 5) eligible.push(i);
  });
  const forced = eligible.length > 0 ? rng.pick(eligible) : -1;
  let out = '';
  runs.forEach((run, i) => {
    const cut = eligible.includes(i) && (i === forced || rng.chance(0.35));
    if (!cut) {
      out += `${String(run.count)}${run.letter}`;
      return;
    }
    const head = rng.int(1, run.count - 1);
    out += `${String(head)}${run.letter}${String(run.count - head)}${run.letter}`;
  });
  return out;
}

export function expand(stream: string): string[] {
  const moves: string[] = [];
  let digits = '';
  for (const character of stream) {
    if (character >= '0' && character <= '9') {
      digits += character;
      continue;
    }
    const count = Number(digits);
    if (digits === '' || count <= 0 || !LETTERS.includes(character)) return [];
    for (let i = 0; i < count; i++) moves.push(character);
    digits = '';
  }
  return digits === '' ? moves : [];
}

export function shortestEncoding(moves: readonly string[]): string {
  let out = '';
  let run = 0;
  for (let i = 0; i < moves.length; i++) {
    run++;
    if (moves[i] !== moves[i + 1]) {
      out += `${String(run)}${String(moves[i])}`;
      run = 0;
    }
  }
  return out;
}

const inbound = (world: World): string => decipher(queued(world)[0] ?? '', postVar(world, 'key'));

function returnPacket(ctx: ObjectiveContext): Divergence | undefined {
  const sent = transmitted(ctx.world);
  const theirs = inbound(ctx.initialWorld);
  if (sent.length !== 1) {
    return {
      where: 'the return packet',
      expected: '1 line',
      received: sent.length === 0 ? 'nothing sent' : `${String(sent.length)} lines`,
    };
  }
  const mine = sent[0] ?? '';
  const mineMoves = expand(mine);
  if (mineMoves.length === 0) {
    return {
      where: 'the return packet',
      expected: 'a count then N, E, S or W',
      received: clipValue(mine),
    };
  }
  const routeMoves = expand(theirs);
  for (let i = 0; i < Math.max(mineMoves.length, routeMoves.length); i++) {
    if (mineMoves[i] === routeMoves[i]) continue;
    return {
      where: `move ${String(i + 1)} of the route`,
      expected: routeMoves[i] ?? NOTHING,
      received: mineMoves[i] ?? NOTHING,
    };
  }
  return {
    where: 'length of the return packet',
    expected: `${String(shortestEncoding(routeMoves).length)} characters`,
    received: `${String(mine.length)} characters`,
  };
}

export const w6_03: LevelDef = {
  id: 'w6-03',
  world: 6,
  index: 3,
  title: 'Compression',
  hardware: ['decode'],
  brief: [
    'We pay for every character we send. Accounting now reads our messages out loud to find the long ones. — D. Halloran',
    '',
    '**Decode the route, drive it to the pad, and send it back shorter.**',
  ].join('\n'),
  board: {
    redrawn: [
      'the key',
      'where the route turns',
      'how the moves are grouped, and which groups are split in two',
    ],
  },
  facts: [
    {
      label: 'Route key',
      value:
        "The route is encrypted with this key. Get it with `probe('mast').vars.key`. Costs no tick.",
    },
    {
      label: 'Route',
      value:
        'The only packet in the queue. Groups with no spaces, like `4E12S1W`. Each group is a count (one or more digits), then `N`, `E`, `S` or `W`.',
    },
    { label: 'Split groups', value: 'Two groups in a row can have the same direction.' },
    {
      label: 'Pits',
      value:
        'Every tile off the route is a pit. A bot that moves onto one is lost. On a pit, `scan(dir).lethal` is `true` (and so is `walkable`).',
    },
    {
      label: 'Return packet',
      value:
        'Send the route once with `transmit()`, in the same format. The shortest form is 27 characters.',
    },
  ],
  seeds: [1, 2, 3, 4],
  par: { ticks: 38 },
  graded: false,
  build(seed: number): World {
    const world = createWorld({ w: FIELD, h: FIELD, seed, fill: Terrain.Pit });
    const rng = new Rng(seed * 7919 + 63);
    const runs = routeRuns(rng);
    const stream = encodeRuns(rng, runs);
    const key = rng.int(1, 94);

    let at: Vec = START;
    setTerrain(world, at, Terrain.Floor);
    for (const move of expand(stream)) {
      at = step(at, dirOf(move));
      setTerrain(world, at, Terrain.Floor);
    }
    setTerrain(world, PAD, Terrain.Pad);

    installPost(world, { at: START, packets: [encipherStream(stream, key)], vars: { key } });
    addBot(world, { at: START, facing: Dir.East, name: 'RIG-06' });
    return world;
  },
  objectives: [
    Objectives.botAt(PAD, { id: 'reach-pad', label: 'Park the bot on the landing pad' }),
    stayOnRoute(),
    driveTheRoute((world) => expand(inbound(world))),
  ],
  bonus: [
    Objectives.custom(
      'shorter-encoding',
      'Send the route back once, in 27 characters',
      (ctx) => {
        const sent = transmitted(ctx.world);
        if (sent.length !== 1) return false;
        const mine = sent[0] ?? '';
        const routeMoves = expand(inbound(ctx.initialWorld));
        return (
          expand(mine).length === ROUTE_MOVES &&
          expand(mine).join('') === routeMoves.join('') &&
          mine.length === shortestEncoding(routeMoves).length
        );
      },
      { divergence: returnPacket },
    ),
  ],
  starter: [
    '// Every tile off the route is a pit.',
    '',
    "const key = probe('mast')?.vars.key ?? 0;",
    'const raw = receive();',
    "const route = raw === null ? '' : decode(raw, key);",
    'print(route);',
    '',
  ].join('\n'),
  hints: [
    'After you decode the packet, you still have to expand each group into moves.',
    'A count can have two digits. Read all the digits before the letter.',
  ],
  docs: ['decode', 'probe', 'receive', 'buffered', 'transmit'],
};

function encipherStream(stream: string, key: number): string {
  return decipher(stream, -key);
}
