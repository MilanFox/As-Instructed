import type { ObjectiveContext, Rng, Vec, World } from '../../engine/index.ts';
import {
  Objectives,
  Terrain,
  addBot,
  createWorld,
  eq,
  senseTotals,
  setTerrain,
  tileAt,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { carveTunnel, cellTile, paintCave, walkableNeighbours } from './caves.ts';
import { botEndsOn, endedOn } from './objectives.ts';

const CELLS = 11;
const SIZE = 2 * CELLS + 1;

function tunnelCells(rng: Rng): number {
  return rng.int(16, 30);
}

function build(seed: number): World {
  const world = createWorld({ w: SIZE, h: SIZE, seed, fill: Terrain.Rock });
  const rng = world.rng;
  const { grid, path } = carveTunnel(rng, CELLS, CELLS, tunnelCells(rng));
  paintCave(world, grid);

  const head = path[0] ?? { i: 0, j: 0 };
  const tail = path[path.length - 1] ?? head;
  setTerrain(world, cellTile(tail.i, tail.j), Terrain.Pad);
  addBot(world, { at: cellTile(head.i, head.j), name: 'RIG-04' });
  return world;
}

const PER_RUN = 3;
const SPARE = 12;
const AT_THE_DEAD_END = 4;
const PER_BEND = 2;
const STEP_SLACK = 3;

function tunnelShape(world: World): { runs: number; steps: number } {
  const bot = world.bots[0];
  if (bot === undefined) return { runs: 0, steps: 0 };
  let at: Vec = bot.at;
  let from: Vec | undefined;
  let heading: string | undefined;
  let runs = 0;
  let steps = 0;
  for (;;) {
    const onward = walkableNeighbours(world, at).find(
      (next) => from === undefined || !eq(next, from),
    );
    if (onward === undefined) return { runs, steps };
    const along = `${String(onward.x - at.x)},${String(onward.y - at.y)}`;
    if (along !== heading) runs++;
    heading = along;
    steps++;
    from = at;
    at = onward;
  }
}

const allowance = (ctx: ObjectiveContext): number =>
  PER_RUN * tunnelShape(ctx.initialWorld).runs + SPARE;

const tightAllowance = (ctx: ObjectiveContext): number =>
  AT_THE_DEAD_END + PER_BEND * Math.max(tunnelShape(ctx.initialWorld).runs - 1, 0);

const stepAllowance = (ctx: ObjectiveContext): number =>
  tunnelShape(ctx.initialWorld).steps + STEP_SLACK;

const readingsTaken = (ctx: ObjectiveContext): number =>
  Object.values(ctx.senses ?? senseTotals(ctx.trace)).reduce((sum, count) => sum + count, 0);

const stepsTaken = (ctx: ObjectiveContext): number =>
  ctx.trace.events.filter((event) => event.kind === 'move').length;

export const w4_01: LevelDef = {
  id: 'w4-01',
  world: 4,
  index: 1,
  title: 'Headlamp',
  hardware: ['look'],
  brief: [
    '```',
    'MEMO KD-2401',
    'FROM: Dep. Coordinator M. Vance',
    'RE:   Subsurface access',
    '',
    'The tunnels are not lit, not surveyed, and not, strictly, ours.',
    'The Charter grants us surface rights. Legal advise that "surface"',
    'is defined in Appendix C.',
    '```',
    '',
    'One tunnel. It bends, does not fork, and ends on a marked pad. Drive the bot there',
    'on a metered lamp, without a wasted step. Both allowances are below.',
  ].join('\n'),
  board: {
    fixed: [
      'the map is 23 tiles square, and rock everywhere the tunnel is not',
      'one tunnel and nothing else — every floor tile belongs to it',
      'the tunnel is one tile wide and never runs alongside itself, so no tile on it has more than two openings',
      'a tile with an even `x` and an even `y` is always rock',
      'RIG-04 starts at one end of the tunnel and the pad is at the other',
    ],
    redrawn: [
      'the shape of the tunnel, bend for bend',
      'its length — 31 to 59 tiles of floor',
      `both allowances with it — ${String(PER_RUN)} readings per straight run plus ${String(SPARE)}, and one step per tile between RIG-04 and the pad, plus ${String(STEP_SLACK)}`,
      'where in the rock it is carved',
      'which end of it RIG-04 starts from',
    ],
  },
  facts: [
    { label: 'The tunnel', value: 'A different shape every shift, and a different length.' },
    {
      label: 'The rock',
      value:
        'Rock (a terrain) fills everything the tunnel is not. It cannot be walked on and a ray cannot see through it.',
    },
    {
      label: '`look(dir)`',
      value:
        'Returns the tiles along that direction, nearest first. It stops at the first thing it cannot see through, and reports that tile last. The second argument limits how far to look; left out, the ray runs until something stops it.',
    },
    {
      label: 'Looking',
      value:
        'Costs no ticks. Every question the bot asks is one reading — `look`, `scan`, `pos`, any of them, whatever range it was given — and both allowances below count all of them.',
    },
    { label: 'The pad', value: 'The only tile in the tunnel that is not plain floor.' },
    {
      label: 'The lamp',
      value: `The shift allows ${String(PER_RUN)} readings for every straight run of the tunnel, plus ${String(SPARE)}. One ray reports a whole run; feeling along the tunnel a tile at a time does not fit.`,
    },
    {
      label: 'The steps',
      value: `The shift allows one step for every tile of tunnel between RIG-04 and the pad, plus ${String(STEP_SLACK)}. A move into rock takes a tick and counts as a step, so finding the way by walking into walls does not fit either.`,
    },
    {
      label: 'The star',
      value: `${String(AT_THE_DEAD_END)} readings, plus ${String(PER_BEND)} for every bend. The dead end can cost four rays before one of them opens; after that, the ray that carried you in already reported the rock ahead, so a bend has two candidates left and costs at most two.`,
    },
  ],
  seeds: [1, 2, 46],
  par: { ticks: 52 },
  build,
  objectives: [
    Objectives.custom(
      'reach-tunnel-end',
      'Park the bot on the pad at the far end',
      (ctx) => {
        const bot = ctx.world.bots[0];
        if (!bot || !bot.alive) return false;
        return tileAt(ctx.world, bot.at)?.terrain === Terrain.Pad;
      },
      { divergence: (ctx) => endedOn(ctx, Terrain.Pad) },
    ),
    Objectives.custom(
      'reading-allowance',
      'Stay inside the reading allowance',
      (ctx) => readingsTaken(ctx) <= allowance(ctx),
      {
        progress: (ctx) => [Math.min(readingsTaken(ctx), allowance(ctx)), allowance(ctx)],
        divergence: (ctx) => ({
          where: 'readings this shift',
          expected: `${String(allowance(ctx))} at most`,
          received: `${String(readingsTaken(ctx))} taken`,
        }),
      },
    ),
    Objectives.custom(
      'no-wasted-steps',
      'Walk the tunnel and nothing else',
      (ctx) => stepsTaken(ctx) <= stepAllowance(ctx),
      {
        meter: { kind: 'events', event: 'move' },
        unit: 'steps',
        progress: (ctx) => [Math.min(stepsTaken(ctx), stepAllowance(ctx)), stepAllowance(ctx)],
        divergence: (ctx) => ({
          where: 'steps this shift',
          expected: `${String(stepAllowance(ctx))} at most`,
          received: `${String(stepsTaken(ctx))} walked`,
        }),
      },
    ),
  ],
  bonus: [
    Objectives.custom(
      'tight-reading-bound',
      'Reach the pad on 4 readings, plus 2 for each bend',
      (ctx) => botEndsOn(ctx, Terrain.Pad) && readingsTaken(ctx) <= tightAllowance(ctx),
      {
        progress: (ctx) => [Math.min(readingsTaken(ctx), tightAllowance(ctx)), tightAllowance(ctx)],
        divergence: (ctx) =>
          botEndsOn(ctx, Terrain.Pad)
            ? {
                where: 'readings this shift',
                expected: `${String(tightAllowance(ctx))} at most`,
                received: `${String(readingsTaken(ctx))} taken`,
              }
            : endedOn(ctx, Terrain.Pad),
      },
    ),
  ],
  starter: [
    '// look(dir, 1) and look(dir) cost one reading each. Only one of them is a survey.',
    '',
    'const east = look(Dir.East);',
    'print(east.length + " tiles east, ending in " + east[east.length - 1].terrain);',
    '',
  ].join('\n'),
  hints: [
    'The bot cannot see the tunnel. It can see along each of four directions, and looking costs no ticks.',
    'A move into rock still takes a tick, and the step allowance counts it. The way through has to be known before it is walked, not found by bumping.',
    'Standing anywhere in the middle of the tunnel there are exactly two openings, and you arrived through one of them.',
    'So you already know one direction you do not want. Hold on to it across the loop, rather than working it out again.',
    'The pad is the only tile in the tunnel that is not plain floor. A ray reports the terrain of every tile it crosses, so the pad arrives in the same reading that reports the corridor.',
    'A ray is not a feeler. `look(dir)` hands back the whole straight run of corridor at once, so one call is worth as many steps as the corridor is long — and the next call is only needed where it bends.',
  ],
  docs: ['look', 'coordinates', 'memory'],
};
