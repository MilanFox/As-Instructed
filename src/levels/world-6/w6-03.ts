import type { Vec, World } from '../../engine/index.ts';
import {
  Dir,
  Objectives,
  Rng,
  Terrain,
  addBot,
  createWorld,
  setTerrain,
  step,
  vec,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { decipher, installPost, postVar, queued, stayOnRoute, transmitted } from './signal.ts';

const FIELD = 20;
/**
 * The route runs all fourteen of its South legs before any North leg, so the start row plus
 * `DOWN_TOTAL` has to stay on the grid. Starting at y = 5 puts the deepest tile on the last row.
 */
const START = vec(1, 5);
const PAD = vec(18, 13);

/**
 * Seven East segments and six vertical legs, alternating South and North. The totals are fixed,
 * so every seed's route is exactly 37 moves and par means the same thing on all four — the route
 * itself, its splits and the key are what vary.
 */
const EAST_SEGMENTS = 7;
const EAST_TOTAL = 17;
const DOWN_TOTAL = 14;
const UP_TOTAL = 6;
const ROUTE_MOVES = EAST_TOTAL + DOWN_TOTAL + UP_TOTAL;

const LETTERS = 'NESW';

const dirOf = (letter: string): Dir =>
  letter === 'N' ? Dir.North : letter === 'E' ? Dir.East : letter === 'S' ? Dir.South : Dir.West;

/** `parts` numbers, each between 1 and `max`, summing to `total`. */
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

/**
 * Seed 1 keeps every count to one digit, so the one-character-per-count reading works there and
 * nowhere else. Seeds 2 to 4 carry a run of ten or more. Every seed carries a run of 1.
 */
function eastSegments(rng: Rng, seed: number): number[] {
  if (seed === 1) {
    const rest = split(rng, EAST_TOTAL - 1, EAST_SEGMENTS - 1, 9);
    return insertAt(rest, rng.int(0, EAST_SEGMENTS - 1), 1);
  }
  const long = rng.int(10, 11);
  const rest = split(rng, EAST_TOTAL - long - 1, EAST_SEGMENTS - 2, 9);
  const withOne = insertAt(rest, rng.int(0, EAST_SEGMENTS - 2), 1);
  return insertAt(withOne, rng.int(0, EAST_SEGMENTS - 1), long);
}

interface Run {
  count: number;
  letter: string;
}

function routeRuns(rng: Rng, seed: number): Run[] {
  const east = eastSegments(rng, seed);
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

/**
 * Some runs go out split in two — `3E2E` where `5E` would do — which is what leaves room for the
 * bonus to send back something genuinely shorter. Runs of ten or more are never split, so the
 * two-digit count survives to the wire.
 */
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

/** The move letters a run-length stream describes, or an empty list when it does not parse. */
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

const inbound = (world: World): string =>
  decipher(queued(world)[0] ?? '', postVar(world, 'key'));

/**
 * The route is fixed at 37 moves on every seed, so par is the route plus the single `transmit`
 * the bonus costs: 38. The reference walks the decoded route once and sends its own encoding
 * back, so there is nothing to shave — 37 of those ticks are the shortest legal path.
 */
export const w6_03: LevelDef = {
  id: 'w6-03',
  world: 6,
  index: 3,
  title: 'Compression',
  hardware: ['decode'],
  brief: [
    '**FROM:** Field Engineer D. Halloran',
    '',
    'the route comes in compressed because the band is metered by the character. finance reads',
    'the invoice and nothing else.',
    '',
    'One packet is waiting: the route from the tile you are standing on to the landing pad,',
    'enciphered. Decode it, drive it, and park on the pad.',
  ].join('\n'),
  facts: [
    { label: 'The key', value: "`probe('mast').vars.key`. Free, and a new key every shift." },
    {
      label: 'Route format',
      value:
        'Groups run together, like `4E12S1W`: a count of one or more digits, then `N`, `E`, `S` or `W`.',
    },
    { label: 'Watch for', value: 'The same direction can turn up in two groups in a row.' },
    { label: 'Off the route', value: 'Pit. Every tile that is not on the route is a pit.' },
    {
      label: 'Shorter encoding',
      value: 'Transmit one line: the same moves, the same format, fewer characters than arrived.',
    },
  ],
  seeds: [1, 2, 3, 4],
  par: { ticks: 38, chars: 800 },
  build(seed: number): World {
    const world = createWorld({ w: FIELD, h: FIELD, seed, fill: Terrain.Pit });
    const rng = new Rng(seed * 7919 + 63);
    const runs = routeRuns(rng, seed);
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
  ],
  bonus: [
    Objectives.custom('shorter-encoding', 'Send the same route back in fewer characters', (ctx) => {
      const sent = transmitted(ctx.world);
      if (sent.length !== 1) return false;
      const mine = sent[0] ?? '';
      const theirs = inbound(ctx.initialWorld);
      return (
        mine.length < theirs.length &&
        expand(mine).length === ROUTE_MOVES &&
        expand(mine).join('') === expand(theirs).join('')
      );
    }),
  ],
  starter: [
    '// Everything off the route is a pit.',
    '',
    "const key = probe('mast')?.vars.key ?? 0;",
    'const raw = receive();',
    "const route = raw === null ? '' : decode(raw, key);",
    'print(route);',
    '',
  ].join('\n'),
  hints: [
    'Decoding the packet is the cheap half. What comes out is still a description, not a route.',
    'A count is not a character. Read digits until you run out of digits, and only then read the direction.',
    'The stream may say the same direction twice in a row. Nothing says a group has to be as long as it could be.',
  ],
  docs: ['decode', 'probe', 'receive', 'transmit'],
};

function encipherStream(stream: string, key: number): string {
  return decipher(stream, -key);
}
