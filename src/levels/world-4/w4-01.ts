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
import type { Cell } from './caves.ts';
import { carveTunnel, cellTile, paintCave, walkableNeighbours } from './caves.ts';
import { botEndsOn, endedOn } from './objectives.ts';

const CELLS = 11;
const SIZE = 2 * CELLS + 1;
const RUNS = 19;
const LAMP = 3 * RUNS + 12;
const STAR = 4 + 2 * (RUNS - 1);
const STEP_SLACK = 3;

function tunnelCells(rng: Rng): number {
  return rng.int(16, 30);
}

function cellRuns(path: Cell[]): number {
  let runs = 0;
  let heading: string | undefined;
  for (let n = 1; n < path.length; n++) {
    const previous = path[n - 1] as Cell;
    const current = path[n] as Cell;
    const along = `${String(current.i - previous.i)},${String(current.j - previous.j)}`;
    if (along !== heading) runs++;
    heading = along;
  }
  return runs;
}

function build(seed: number): World {
  const world = createWorld({ w: SIZE, h: SIZE, seed, fill: Terrain.Rock });
  const rng = world.rng;
  let drawn = carveTunnel(rng, CELLS, CELLS, tunnelCells(rng));
  while (cellRuns(drawn.path) !== RUNS) drawn = carveTunnel(rng, CELLS, CELLS, tunnelCells(rng));
  const { grid, path } = drawn;
  paintCave(world, grid);

  const head = path[0] ?? { i: 0, j: 0 };
  const tail = path[path.length - 1] ?? head;
  setTerrain(world, cellTile(tail.i, tail.j), Terrain.Pad);
  addBot(world, { at: cellTile(head.i, head.j), name: 'RIG-04' });
  return world;
}

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
    'Each lamp reading in the dark tunnels costs money. Finance says you should "feel your way", but Finance has never been down there. — M. Vance',
    '',
    '**Drive the bot along the dark tunnel to the pad, with few readings. Every sensing call, like `look` or `pos`, is one reading.**',
  ].join('\n'),
  board: {
    redrawn: [
      'the shape and place of the tunnel',
      'its length: 41 to 59 tiles, so also the step limit',
      'which end the bot starts at',
    ],
  },
  facts: [
    {
      label: 'Tunnel',
      value: `One tile wide, with rock all around. Rock stops both moves and looks. No branches, and no two parts of it touch, so each tile has at most two open sides. ${String(RUNS)} straight parts, ${String(RUNS - 1)} bends. the bot starts at one end.`,
    },
    { label: 'Pad', value: 'At the other end of the tunnel. `look` shows it like any tile.' },
    {
      label: 'Readings',
      value:
        'Every sensing call (`look`, `scan`, `pos`, …) is one reading, however far it sees. Readings cost no ticks.',
    },
    {
      label: 'Steps',
      value: `Limit: the steps along the tunnel from the bot to the pad, plus ${String(STEP_SLACK)}. A move into rock counts as a step.`,
    },
  ],
  seeds: [1, 2, 46],
  par: { ticks: 58 },
  build,
  objectives: [
    Objectives.custom(
      'reach-tunnel-end',
      'End the run on the pad',
      (ctx) => {
        const bot = ctx.world.bots[0];
        if (!bot || !bot.alive) return false;
        return tileAt(ctx.world, bot.at)?.terrain === Terrain.Pad;
      },
      { divergence: (ctx) => endedOn(ctx, Terrain.Pad) },
    ),
    Objectives.custom(
      'reading-allowance',
      `Reach the pad with at most ${String(LAMP)} readings`,
      (ctx) => botEndsOn(ctx, Terrain.Pad) && readingsTaken(ctx) <= LAMP,
      {
        progress: (ctx) => [Math.min(readingsTaken(ctx), LAMP), LAMP],
        divergence: (ctx) =>
          botEndsOn(ctx, Terrain.Pad)
            ? {
                where: 'readings this shift',
                expected: `${String(LAMP)} at most`,
                received: `${String(readingsTaken(ctx))} taken`,
              }
            : endedOn(ctx, Terrain.Pad),
      },
    ),
    Objectives.custom(
      'no-wasted-steps',
      `Take at most ${String(STEP_SLACK)} steps more than the tunnel needs`,
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
      `Reach the pad with at most ${String(STAR)} readings`,
      (ctx) => botEndsOn(ctx, Terrain.Pad) && readingsTaken(ctx) <= STAR,
      {
        progress: (ctx) => [Math.min(readingsTaken(ctx), STAR), STAR],
        divergence: (ctx) =>
          botEndsOn(ctx, Terrain.Pad)
            ? {
                where: 'readings this shift',
                expected: `${String(STAR)} at most`,
                received: `${String(readingsTaken(ctx))} taken`,
              }
            : endedOn(ctx, Terrain.Pad),
      },
    ),
  ],
  starter: [
    '// Each look is one reading, however far it sees.',
    '',
    'const east = look(Dir.East);',
    'print(east.length + " tiles east, ending in " + east[east.length - 1].terrain);',
    '',
  ].join('\n'),
  hints: [
    'Each tunnel tile has two open sides. You came in through one of them.',
    'Remember the direction you came from, so you never need to check it.',
    'One look shows a whole straight part. Walk all of it, then look again at the bend.',
    'The pad shows up in a look like any other tile. Check the terrain of each tile.',
  ],
  docs: ['look', 'coordinates', 'memory'],
};
