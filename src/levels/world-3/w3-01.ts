import type { Divergence, ObjectiveContext, Vec, World } from '../../engine/index.ts';
import {
  Dir,
  NOTHING,
  Objectives,
  Terrain,
  addBot,
  addGroundItems,
  clipValue,
  countItemsAt,
  createWorld,
  setTile,
  vec,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { at } from './objectives.ts';
import { frame, warm } from './yard.ts';

const PAR_TICKS = 157;

const WEST_SIDING: readonly Vec[] = [
  vec(1, 1),
  vec(1, 2),
  vec(1, 3),
  vec(2, 1),
  vec(2, 2),
  vec(2, 3),
];

const EAST_PADS: readonly Vec[] = [
  vec(11, 1),
  vec(11, 2),
  vec(11, 3),
  vec(12, 1),
  vec(12, 2),
  vec(12, 3),
];

const pads = (world: World): Vec[] => {
  const out: Vec[] = [];
  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      if (world.tiles[y * world.w + x]?.terrain === Terrain.Pad) out.push(vec(x, y));
    }
  }
  return out;
};

const loadedPads = (ctx: ObjectiveContext): number =>
  pads(ctx.initialWorld).filter((at) => countItemsAt(ctx.world, at, 'crate') > 0).length;

function straightRuns(world: World): number {
  const crates = new Map<number, number>();
  const pads = new Map<number, number>();
  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      const here = vec(x, y);
      if (countItemsAt(world, here, 'crate') > 0) crates.set(y, (crates.get(y) ?? 0) + 1);
      if (world.tiles[y * world.w + x]?.terrain === Terrain.Pad)
        pads.set(y, (pads.get(y) ?? 0) + 1);
    }
  }
  let total = 0;
  for (const [row, count] of crates) total += Math.min(count, pads.get(row) ?? 0);
  return total;
}

const rowsOf = (tiles: readonly Vec[]): string =>
  [1, 2, 3].map((row) => tiles.filter((tile) => tile.y === row).length).join(',');

const rowsMatch = (crates: readonly Vec[], pads: readonly Vec[]): boolean =>
  rowsOf(crates) === rowsOf(pads);

const filed = (ctx: ObjectiveContext): string[] =>
  ctx.trace.events
    .filter((event) => event.kind === 'print')
    .map((event) => (event.kind === 'print' ? event.text : ''))
    .filter((line) => line.startsWith('straight '));

const barePad = (ctx: ObjectiveContext): Divergence | undefined => {
  const bare = pads(ctx.initialWorld).find((pad) => countItemsAt(ctx.world, pad, 'crate') === 0);
  if (bare === undefined) return undefined;
  return { where: at(bare), expected: 'a crate', received: NOTHING };
};

const misfiled = (ctx: ObjectiveContext): Divergence | undefined => {
  const lines = filed(ctx);
  const said = lines[0];
  if (said === undefined) {
    return {
      where: 'the shift report',
      expected: 'one line: straight <n>',
      received: NOTHING,
    };
  }
  if (lines.length > 1) {
    return {
      where: 'the shift report',
      expected: 'one line',
      received: `${String(lines.length)} lines`,
    };
  }
  return {
    where: 'the shift report',
    expected: 'a different pair count',
    received: clipValue(said),
  };
};

export const w3_01: LevelDef = {
  id: 'w3-01',
  world: 3,
  index: 1,
  title: 'Pick and Place',
  hardware: ['pickup', 'drop'],
  brief: [
    'Planning wants to know how many crates could go straight across, with no row change. The number goes on a chart that nobody reads. — D. Halloran',
    '',
    '**Carry the crates to the pads, one at a time, until every pad has a crate.**',
  ].join('\n'),
  board: {
    redrawn: [
      'three, four or five crates',
      'which west tiles hold crates',
      'which east tiles are pads',
      'the row the bot starts in',
    ],
  },
  facts: [
    {
      label: 'Crate',
      value:
        'Crates lie in the two west columns, pads in the two east columns. One crate for every pad. The bot carries one crate at a time. `pickup()` while holding one takes nothing and still costs a tick.',
    },
    {
      label: 'Straight pairs',
      value:
        'A crate and a pad in the same row, each used in one pair only. For the star, print one line: `straight <n>`, where `n` is the most straight pairs you can make in all three rows. Your route does not change it.',
    },
  ],
  seeds: [1, 2, 3],
  par: { ticks: PAR_TICKS },
  build(seed: number): World {
    const world = createWorld({ w: 14, h: 5, seed, fill: Terrain.Floor });
    frame(world);
    const rng = world.rng;
    warm(rng);
    const count = rng.int(3, 5);
    const crates = rng.shuffle(WEST_SIDING).slice(0, count);
    let pads = rng.shuffle(EAST_PADS).slice(0, count);
    while (rowsMatch(crates, pads)) pads = rng.shuffle(EAST_PADS).slice(0, count);
    for (const at of crates) addGroundItems(world, at, 'crate', 1);
    for (const at of pads) setTile(world, at, { terrain: Terrain.Pad });
    addBot(world, { at: vec(6, rng.int(1, 3)), facing: Dir.East, name: 'RIG-04', capacity: 1 });
    return world;
  },
  objectives: [
    Objectives.custom(
      'pads-loaded',
      'Put a crate on every pad',
      (ctx) => loadedPads(ctx) === pads(ctx.initialWorld).length,
      {
        progress: (ctx) => [loadedPads(ctx), pads(ctx.initialWorld).length],
        divergence: barePad,
      },
    ),
  ],
  bonus: [
    Objectives.custom(
      'straight-runs',
      'Print the most straight pairs the board allows (crate and pad in one row)',
      (ctx) => {
        const lines = filed(ctx);
        return (
          lines.length === 1 && lines[0] === `straight ${String(straightRuns(ctx.initialWorld))}`
        );
      },
      { divergence: misfiled },
    ),
  ],
  budget: { maxTicks: 2500 },
  starter: [
    '// Crates are west. Pads are east.',
    '',
    'while (canMove(Dir.West)) move(Dir.West);',
    '',
  ].join('\n'),
  hints: [
    'The bot holds one crate. Drop it before you pick up the next one.',
    'Crates and pads move between shifts. Find them first, then plan.',
    'Each trip moves one crate: fetch it, carry it, drop it, go back.',
    'For the star: a crate or a pad can be in one pair only.',
  ],
  docs: ['pickup', 'drop'],
};
