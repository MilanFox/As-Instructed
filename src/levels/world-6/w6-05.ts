import type { Divergence, ObjectiveContext, Vec, World } from '../../engine/index.ts';
import {
  Dir,
  NOTHING,
  Objectives,
  Rng,
  Terrain,
  addBot,
  botById,
  clipValue,
  createWorld,
  setTerrain,
  step,
  tileAt,
  vec,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import {
  additive,
  charCodes,
  encipher,
  installPost,
  point,
  stayOnRoute,
  weighted,
} from './signal.ts';

const FIELD = 30;
/** Every seed's route is exactly this long, so par means the same thing on all five. */
const ROUTE_MOVES = 60;
const CORRUPT_BLOCKS = 3;
const LETTERS = 'NESW';

const dirOf = (letter: string): Dir =>
  letter === 'N' ? Dir.North : letter === 'E' ? Dir.East : letter === 'S' ? Dir.South : Dir.West;

/**
 * Nesting depth per seed. Seed 1 nests once, so a flat reader that ignores calls walks a truncated
 * route on the first shift a player runs rather than passing it and failing the second
 * (DESIGN.md §11.5). Seed 2 is the depth-1 case CURRICULUM.md §8 asks for — `main` holds nothing
 * but move groups, which is the reader's base case and reads as a confirmation once the recursion
 * is written. Seeds 3 and 5 go to four.
 */
const DEPTHS: Readonly<Record<number, number>> = Object.freeze({ 1: 2, 2: 1, 3: 4, 4: 3, 5: 4 });

const depthFor = (seed: number): number => DEPTHS[seed] ?? 3;

type Token = { kind: 'run'; count: number; letter: string } | { kind: 'call'; name: string; times: number };

interface Block {
  name: string;
  body: Token[];
}

function tokenText(token: Token): string {
  return token.kind === 'run'
    ? `${String(token.count)}${token.letter}`
    : `${token.name}*${String(token.times)}`;
}

const bodyText = (block: Block): string => block.body.map(tokenText).join(',');

const plainOf = (block: Block): string => `${block.name}|${bodyText(block)}`;

function expand(blocks: readonly Block[], name: string, depth = 0): string[] {
  if (depth > 8) return [];
  const block = blocks.find((candidate) => candidate.name === name);
  if (!block) return [];
  const out: string[] = [];
  for (const token of block.body) {
    if (token.kind === 'run') {
      for (let i = 0; i < token.count; i++) out.push(token.letter);
      continue;
    }
    const inner = expand(blocks, token.name, depth + 1);
    for (let i = 0; i < token.times; i++) out.push(...inner);
  }
  return out;
}

function walkExtent(moves: readonly string[]): { minX: number; minY: number; maxX: number; maxY: number; end: Vec } {
  let at = vec(0, 0);
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  for (const letter of moves) {
    at = step(at, dirOf(letter));
    minX = Math.min(minX, at.x);
    minY = Math.min(minY, at.y);
    maxX = Math.max(maxX, at.x);
    maxY = Math.max(maxY, at.y);
  }
  return { minX, minY, maxX, maxY, end: at };
}

/** One draw of the grammar. Returns null when the shape does not fit the field. */
function drawBlocks(rng: Rng, depth: number): Block[] | null {
  const blocks: Block[] = [];
  for (let level = depth; level >= 1; level--) {
    const name = level === 1 ? 'main' : `g${String(level - 1)}`;
    const body: Token[] = [];
    // A depth-1 stream has no calls to carry the length, so `main` carries all of it itself.
    const runs = depth === 1 ? rng.int(12, 20) : rng.int(1, 6);
    for (let i = 0; i < runs; i++) {
      body.push({ kind: 'run', count: rng.int(1, 4), letter: LETTERS[rng.int(0, 3)] as string });
    }
    if (level < depth) {
      body.splice(rng.int(0, body.length), 0, {
        kind: 'call',
        name: `g${String(level)}`,
        times: rng.int(2, 3),
      });
    }
    blocks.unshift({ name, body });
  }

  const moves = expand(blocks, 'main');
  if (moves.length < ROUTE_MOVES - 22 || moves.length > ROUTE_MOVES - 2) return null;

  const pad = ROUTE_MOVES - moves.length;
  const extent = walkExtent(moves);
  const width = extent.maxX - extent.minX;
  const height = extent.maxY - extent.minY;
  const letter = width + pad <= 22 ? 'E' : height + pad <= 22 ? 'S' : null;
  if (letter === null) return null;

  const main = blocks.find((block) => block.name === 'main') as Block;
  main.body.push({ kind: 'run', count: pad, letter });

  const full = walkExtent(expand(blocks, 'main'));
  if (full.maxX - full.minX > 24 || full.maxY - full.minY > 24) return null;
  return blocks;
}

function blocksFor(seed: number): Block[] {
  const depth = depthFor(seed);
  for (let attempt = 0; attempt < 400; attempt++) {
    const drawn = drawBlocks(new Rng(seed * 6151 + attempt * 97 + 11), depth);
    if (drawn) return drawn;
  }
  throw new Error(`w6-05: seed ${String(seed)} produced no routable grammar`);
}

interface Packet {
  text: string;
  corrupt: boolean;
  /** The plain text as sent, for the repair bonus. */
  plain: string;
}

function seal(plain: string, salt: number): string {
  const codes = charCodes(plain);
  return `${plain}*${String(additive(codes, salt))},${String(weighted(codes, salt))}`;
}

function verifies(text: string, salt: number): boolean {
  const star = text.lastIndexOf('*');
  if (star < 0) return false;
  const claimed = text.slice(star + 1).split(',').map(Number);
  if (claimed.length !== 2) return false;
  const codes = charCodes(text.slice(0, star));
  return additive(codes, salt) === claimed[0] && weighted(codes, salt) === claimed[1];
}

/**
 * Flips one character of the `name|body` half to another printable one an odd distance away.
 * Odd makes the difference invertible mod 256, which is what makes the position — and so the
 * original character — recoverable rather than merely detectable. The check values themselves
 * are never touched, so a repair always has something true to work back from.
 */
function spoil(rng: Rng, text: string, salt: number): string | null {
  const at = rng.int(0, text.lastIndexOf('*') - 1);
  const code = text.charCodeAt(at);
  const candidates: number[] = [];
  for (let next = 33; next <= 126; next++) {
    if (next !== code && Math.abs(next - code) % 2 === 1) candidates.push(next);
  }
  const replacement = candidates[rng.int(0, candidates.length - 1)] as number;
  const spoiled = text.slice(0, at) + String.fromCharCode(replacement) + text.slice(at + 1);
  for (let key = 0; key < 95; key++) {
    if (verifies(encipher(spoiled, -key), salt)) return null;
  }
  return spoiled;
}

export interface Telemetry {
  blocks: Block[];
  packets: Packet[];
  salt: number;
  start: Vec;
  pad: Vec;
  moves: string[];
}

export function telemetryFor(seed: number): Telemetry {
  const blocks = blocksFor(seed);
  const moves = expand(blocks, 'main');
  const extent = walkExtent(moves);
  const start = vec(3 - extent.minX, 3 - extent.minY);
  const pad = vec(start.x + extent.end.x, start.y + extent.end.y);

  const rng = new Rng(seed * 3407 + 29);
  const salt = rng.int(0, 255);
  const clean = blocks.map((block) => ({ name: block.name, sealed: seal(plainOf(block), salt) }));

  // One clean block goes out shifted. Its checksum is what tells a program it found the shift.
  const shifted = rng.int(0, clean.length - 1);
  const cipherKey = rng.int(1, 94);

  const packets: Packet[] = clean.map((entry, index) => ({
    text: index === shifted ? encipher(entry.sealed, cipherKey) : entry.sealed,
    corrupt: false,
    plain: entry.sealed,
  }));

  for (let i = 0; i < CORRUPT_BLOCKS; i++) {
    const source = clean[rng.int(0, clean.length - 1)] as { name: string; sealed: string };
    let spoiled: string | null = null;
    for (let attempt = 0; attempt < 40 && spoiled === null; attempt++) {
      spoiled = spoil(rng, source.sealed, salt);
    }
    if (spoiled === null) continue;
    packets.push({ text: spoiled, corrupt: true, plain: source.sealed });
  }

  return { blocks, packets: rng.shuffle(packets), salt, start, pad, moves };
}

interface RepairTarget {
  /** Where the corrupt block sat on the band, counting from 0. */
  index: number;
  line: string;
}

/** The repair lines the bonus wants, each tagged with the band slot it answers. */
function repairTargets(world: World): RepairTarget[] {
  const seed = world.vars.seed ?? 1;
  const out: RepairTarget[] = [];
  telemetryFor(seed).packets.forEach((packet, index) => {
    if (!packet.corrupt) return;
    out.push({ index, line: `fix ${packet.plain.slice(0, packet.plain.lastIndexOf('*'))}` });
  });
  return out;
}

/** Every `fix ...` line the run printed, in the order it printed them. */
function printedFixes(ctx: ObjectiveContext): string[] {
  return ctx.trace.events
    .filter((event) => event.kind === 'print')
    .map((event) => (event.kind === 'print' ? event.text : ''))
    .filter((line) => line.startsWith('fix '));
}

/** The pad against where the run left the bot. Both tiles are painted on the map already. */
function parked(ctx: ObjectiveContext): Divergence | undefined {
  const pad = telemetryFor(ctx.initialWorld.vars.seed ?? 1).pad;
  const bot = botById(ctx.world, 0);
  if (bot === undefined) {
    return { where: 'end of run', expected: point(pad), received: NOTHING };
  }
  return {
    where: 'end of run',
    expected: point(pad),
    received: bot.alive ? point(bot.at) : `${point(bot.at)}, and not running`,
  };
}

/**
 * Which corrupt block the repair report first disagrees about — never what the repair should say.
 *
 * Where the altered character sits is the arithmetic the bonus exists for, and the character
 * itself falls straight out of the position, so neither appears. The block is named by the slot
 * it arrived in, which is the player's own copy of the band, and the run's own line comes back
 * unchanged beside it.
 */
function firstRepair(ctx: ObjectiveContext): Divergence | undefined {
  const targets = repairTargets(ctx.initialWorld);
  const said = printedFixes(ctx);
  if (targets.length === 0) {
    return { where: 'the band', expected: 'a corrupt block to repair', received: 'none arrived' };
  }
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i] as RepairTarget;
    const line = said[i];
    if (line === target.line) continue;
    return {
      where: `block ${String(target.index)} on the band`,
      expected: line === undefined ? 'a repair for it' : 'a different repair',
      received: line === undefined ? NOTHING : clipValue(line),
    };
  }
  const extra = said[targets.length];
  if (extra === undefined) return undefined;
  return {
    where: `repair line ${String(targets.length + 1)}`,
    expected: 'no more corrupt blocks',
    received: clipValue(extra),
  };
}

/**
 * Par: the route is exactly 60 moves on every seed and nothing else costs a tick — parsing,
 * checking, key search and the repair report are all free. There is nothing to shave.
 */
export const w6_05: LevelDef = {
  id: 'w6-05',
  world: 6,
  index: 5,
  title: 'Telemetry',
  hardware: [],
  brief: [
    '**MEMO KD-2622**',
    '**FROM:** Dep. Coordinator M. Vance',
    '**CC:** Contractor #4470',
    '**RE:** Dead band',
    '',
    'The band is designated dead. Traffic on a dead band is, by designation, not traffic. The',
    'station still sending on it uses the old nested format.',
    '',
    'The blocks on the band spell out a route from the tile you are standing on to the landing',
    'pad. Read them all, start from `main`, and drive the route.',
  ].join('\n'),
  facts: [
    {
      label: 'A block',
      value:
        '`name|body*S,W`. `name` is `main`, `g1`, `g2` or `g3`. `body` is entries, comma separated.',
    },
    { label: 'Move group', value: 'A count then `N`, `E`, `S` or `W`, like `12S`.' },
    {
      label: 'Call',
      value:
        'A block name, `*`, a repeat count, like `g2*3` — run that whole block three times. Blocks nest up to four deep.',
    },
    {
      label: 'The checks',
      value:
        'Over the characters of `name|body`: `S` is `(salt + c0 + ... + cn) mod 256`, `W` is `(salt + 1*c0 + ... + (n+1)*cn) mod 256`.',
    },
    { label: 'The salt', value: "`probe('mast').vars.salt`. Free, and a new number every shift." },
    {
      label: 'Corrupt blocks',
      value:
        'One character altered — replaced by another whose code is an odd distance from it. The checks themselves are untouched. Each one lies about a block that also arrived intact.',
    },
    {
      label: 'One shifted block',
      value:
        'It came through the old repeater, shifted by a whole number from 0 to 94. Its checks are over the plain text.',
    },
    { label: 'Arrival order', value: 'None. Blocks arrive in any order.' },
    { label: 'Off the route', value: 'Pit. Every tile that is not on the route is a pit.' },
    {
      label: 'Repair report',
      value:
        'For each corrupt block, in arrival order, print `fix ` and the `name|body` it was sent as.',
    },
  ],
  seeds: [1, 2, 3, 4, 5],
  par: { ticks: ROUTE_MOVES },
  graded: false,
  build(seed: number): World {
    const plan = telemetryFor(seed);
    const world = createWorld({ w: FIELD, h: FIELD, seed, fill: Terrain.Pit, vars: { seed } });

    let at = plan.start;
    setTerrain(world, at, Terrain.Floor);
    for (const letter of plan.moves) {
      at = step(at, dirOf(letter));
      setTerrain(world, at, Terrain.Floor);
    }
    setTerrain(world, plan.pad, Terrain.Pad);

    installPost(world, {
      at: plan.start,
      packets: plan.packets.map((packet) => packet.text),
      vars: { salt: plan.salt },
    });
    addBot(world, { at: plan.start, facing: Dir.East, name: 'RIG-06' });
    return world;
  },
  objectives: [
    Objectives.custom(
      'reach-pad',
      'Park the bot on the landing pad',
      (ctx) => {
        const bot = botById(ctx.world, 0);
        return bot !== undefined && tileAt(ctx.world, bot.at)?.terrain === Terrain.Pad;
      },
      { divergence: parked },
    ),
    stayOnRoute(),
  ],
  bonus: [
    Objectives.custom(
      'repair-blocks',
      'Repair every corrupt block instead of discarding it',
      (ctx) => {
        const wanted = repairTargets(ctx.initialWorld).map((target) => target.line);
        const said = printedFixes(ctx);
        return (
          wanted.length > 0 &&
          said.length === wanted.length &&
          wanted.every((line, i) => said[i] === line)
        );
      },
      { divergence: firstRepair },
    ),
  ],
  starter: [
    "// import { findKey, unpack } from 'lib';",
    '// NOTE(4470): the old format nests. mine did not handle that for a month',
    '// NOTE(4470): a block that fails its checks is not a block, it is furniture',
    '',
    "const salt = probe('mast').vars.salt;",
    'const blocks = [];',
    'let packet = receive();',
    'while (packet !== null) {',
    '  blocks.push(packet);',
    '  packet = receive();',
    '}',
    'print(`${blocks.length} blocks on the band`);',
    '',
  ].join('\n'),
  hints: [
    'Sort the traffic before you read any of it. Every block is one of three things, and the checks tell you which.',
    'A block that fails its checks might still be a block. Something happened to it on the way, and you have already been taught how to undo that.',
    'A move group produces moves. A call produces whatever the block it names produces, that many times over. The second sentence has the same shape as the first. So does the reader.',
    'Going down a level means putting your place somewhere and picking it back up after. There are two well-known places to put it.',
    'For the repair: the two checks are each out by a number. One is the size of the change. The other is that size times where it happened.',
  ],
  docs: ['decode', 'probe', 'receive'],
};
