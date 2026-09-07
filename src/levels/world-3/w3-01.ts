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

/**
 * How many of this shift's trips can be run without ever changing row.
 *
 * A crate in row `y` can be carried to a pad in row `y` on a straight run east, so the most such
 * trips a shift allows is `min(crates, pads)` summed over the rows — the flat part of the job,
 * fixed by where the yard put things and not by the route anyone drives. Nothing about loading the
 * pads depends on it, which is exactly why it is the star: the run has to read both sidings and
 * match them up rather than just fetch and carry.
 */
function straightRuns(world: World): number {
  const crates = new Map<number, number>();
  const pads = new Map<number, number>();
  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      const here = vec(x, y);
      if (countItemsAt(world, here, 'crate') > 0) crates.set(y, (crates.get(y) ?? 0) + 1);
      if (world.tiles[y * world.w + x]?.terrain === Terrain.Pad) pads.set(y, (pads.get(y) ?? 0) + 1);
    }
  }
  let total = 0;
  for (const [row, count] of crates) total += Math.min(count, pads.get(row) ?? 0);
  return total;
}

/** Every line the run filed about the shift, in the order it filed them. */
const filed = (ctx: ObjectiveContext): string[] =>
  ctx.trace.events
    .filter((event) => event.kind === 'print')
    .map((event) => (event.kind === 'print' ? event.text : ''))
    .filter((line) => line.startsWith('straight '));

/**
 * The first pad the run left bare. Which rows the pads sit in changes between shifts, so a run
 * that loaded five of six has no way of telling from its own source which one it walked past.
 */
const barePad = (ctx: ObjectiveContext): Divergence | undefined => {
  const bare = pads(ctx.initialWorld).find((pad) => countItemsAt(ctx.world, pad, 'crate') === 0);
  if (bare === undefined) return undefined;
  return { where: at(bare), expected: 'a crate', received: NOTHING };
};

/**
 * What the shift report said, against the fact that it is the wrong answer — never the number.
 *
 * Giving the figure back would be the whole bonus, so a wrong line comes back as the run's own
 * line and the word "different". A run that filed nothing is told which line is missing and what
 * it is a line about, because "no star" on its own does not say a report was even wanted.
 */
const misfiled = (ctx: ObjectiveContext): Divergence | undefined => {
  const lines = filed(ctx);
  const said = lines[0];
  if (said === undefined) {
    return {
      where: 'the shift report',
      expected: 'a line saying how many trips run flat',
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

/**
 * The whole level is one clamp and two sidings. Capacity is 1, so the obvious "load everything,
 * then unload everything" shape burns a tick per crate on a pickup that takes nothing — which is
 * visible in the trace as a run of failed pickups, and is the only thing this level teaches.
 */
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
    'Every pad on the east side of the shed must end the shift holding a crate.',
  ].join('\n'),
  facts: [
    { label: 'The crates', value: 'On the west siding. As many crates as there are pads.' },
    {
      label: 'Between shifts',
      value: 'Which rows the crates sit in, and which rows the pads sit in, both change.',
    },
    { label: '`pickup()`', value: 'Takes what is lying on the tile the bot is standing on.' },
    { label: '`drop()`', value: 'Puts it back down on the tile the bot is standing on.' },
    { label: 'A full bot', value: '`pickup()` takes nothing and still costs a tick.' },
    { label: 'The clamp', value: 'One crate at a time.' },
    {
      label: 'The shift report',
      value:
        'For the star: file one line, `straight <n>`, where `n` is how many of this shift\'s trips could be run without the bot ever changing row.',
    },
  ],
  seeds: [1, 2, 3],
  par: { ticks: PAR_TICKS },
  build(seed: number): World {
    const world = createWorld({ w: 14, h: 5, seed, fill: Terrain.Floor });
    frame(world);
    const rng = world.rng;
    warm(rng);
    const count = rng.int(3, 6);
    for (const at of rng.shuffle(WEST_SIDING).slice(0, count)) {
      addGroundItems(world, at, 'crate', 1);
    }
    for (const at of rng.shuffle(EAST_PADS).slice(0, count)) {
      setTile(world, at, { terrain: Terrain.Pad });
    }
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
    /*
     * The budget this replaced was `endTick <= PAR_TICKS && failedPickups === 0` — par restated,
     * with a no-error conjunct bolted on. Gold already asks the first half, and the exhaustive
     * pairing measurement shows the only slack left on this board is the
     * survey sweep, so no tighter number was available that was not a tax on walking.
     *
     * The shift's flat trips are the one fact about the yard nothing else grades. Loading the pads
     * needs a crate and a pad; counting the straight runs needs both sidings read *by row* and
     * matched, which is the shape of thinking the level is for.
     */
    Objectives.custom(
      'straight-runs',
      'Report how many trips need no change of row',
      (ctx) => {
        const lines = filed(ctx);
        return lines.length === 1 && lines[0] === `straight ${String(straightRuns(ctx.initialWorld))}`;
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
    'A trip is flat when the crate and the pad share a row. Count the crates in each row and the pads in each row, and a row can only offer as many flat trips as the smaller of the two.',
  ],
  docs: ['pickup', 'drop'],
};
