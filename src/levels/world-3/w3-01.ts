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
      expected: 'a line saying how many pairs share a row',
      received: NOTHING,
    };
  }
  if (lines.length > 1) {
    return {
      where: 'the shift report',
      expected: 'one line about the shift',
      received: `${String(lines.length)} of them`,
    };
  }
  return { where: 'the shift report', expected: 'a different figure', received: clipValue(said) };
};

export const w3_01: LevelDef = {
  id: 'w3-01',
  world: 3,
  index: 1,
  title: 'Pick and Place',
  hardware: ['pickup', 'drop'],
  brief: [
    '**FROM:** Field Engineer D. Halloran',
    '',
    'the arm on RIG-04 has one clamp. the log still shows you tried for a second.',
    '',
    'planning prices the row changes. count the straight runs.',
    '',
    'Every pad on the east side must end the shift holding a crate.',
  ].join('\n'),
  board: {
    fixed: [
      'the shed is 12 wide and 3 deep inside its wall',
      'the west siding is the two columns at the west wall, the pads the two at the east',
      'one crate for every pad',
      'RIG-04 starts mid-shed with a one-crate clamp',
      'the crate rows and the pad rows never agree row for row',
    ],
    redrawn: [
      'three, four or five crates',
      'which siding tiles hold them',
      'which east tiles are pads',
      'the row RIG-04 starts in',
    ],
  },
  facts: [
    {
      label: 'The crates',
      value: 'Crates (an item) lying on the west siding. As many crates as there are pads.',
    },
    {
      label: 'The pads',
      value:
        'Pad (a terrain) on the east side of the shed. A loaded pad is a pad with a crate lying on it.',
    },
    {
      label: 'Between shifts',
      value:
        'The two sidings are stacked separately, and both restack between shifts. A row holding two crates may have no pad at all.',
    },
    { label: '`pickup()`', value: 'Takes what is lying on the tile the bot is standing on.' },
    { label: '`drop()`', value: 'Puts it back down on the tile the bot is standing on.' },
    { label: 'A full bot', value: '`pickup()` takes nothing and still costs a tick.' },
    { label: 'The clamp', value: 'One crate at a time.' },
    {
      label: 'The shift report',
      value:
        'For the star: print one line, `straight <n>`. Pair up as many crates as you can with pads in their own row, one crate to one pad. `n` is the total across all three rows. Where the bot drives does not change it.',
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
      'Leave a crate on every pad',
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
      'Report how many crates can be paired with a pad in their own row',
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
    '// The crates are on the west siding. The pads are on the east side.',
    '',
    'while (canMove(Dir.West)) move(Dir.West);',
    '',
  ].join('\n'),
  hints: [
    'The clamp holds one crate. Set it down before you reach for another.',
    'The crate rows and the pad rows are not the same rows, and they change between shifts.',
    'A pickup that takes nothing still costs a tick, and the log shows it as a failure.',
    'One trip across the shed moves one crate. Fetch, carry, set down, go back for the next.',
    'Count the crates in each row and the pads in each row. A row offers as many pairs as the smaller of those two numbers.',
  ],
  docs: ['pickup', 'drop'],
};
