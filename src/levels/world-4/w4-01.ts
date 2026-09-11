import type { ObjectiveContext, Rng, World } from '../../engine/index.ts';
import {
  Objectives,
  Terrain,
  addBot,
  createWorld,
  senseTotals,
  setTerrain,
  tileAt,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { carveTunnel, cellTile, paintCave } from './caves.ts';
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

const LOOK_BUDGET = 60;

const raysCast = (ctx: ObjectiveContext): number =>
  ctx.senses?.['look'] ?? senseTotals(ctx.trace)['look'] ?? 0;

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
    'The tunnels are not lit, not surveyed, and not, in the strict',
    'sense, ours. The Charter grants us surface rights. Legal advise',
    'that "surface" is defined in Appendix C.',
    '```',
    '',
    'There is one tunnel. It bends, it does not fork, and it ends on a marked pad.',
    'Drive the bot onto that pad.',
  ].join('\n'),
  board: {
    fixed: [
      'the map is 23 tiles square, and rock everywhere the tunnel is not',
      'one tunnel and nothing else — every floor tile belongs to it',
      'the tunnel is one tile wide and never runs alongside itself, so no tile on it has more than two openings',
      'a tile with an even `x` and an even `y` is always rock',
      'RIG-04 starts at one end of the tunnel and the pad is at the other',
      'the ray allowance is for the whole shift, however long the tunnel is drawn',
    ],
    redrawn: [
      'the shape of the tunnel, bend for bend',
      'its length — 31 to 59 tiles of floor',
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
        'Returns the tiles along that direction, nearest first. It stops at the first thing it cannot see through.',
    },
    {
      label: 'Looking',
      value: 'Costs no ticks. The star below is the only thing that counts rays.',
    },
    { label: 'The pad', value: 'The only tile in the tunnel that is not plain floor.' },
    {
      label: 'The lamp',
      value: `For the star: reach the pad having cast at most ${String(LOOK_BUDGET)} rays in the whole shift. One ray reports a whole corridor.`,
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
  ],
  bonus: [
    Objectives.custom(
      'within-60-look',
      `Reach the pad on ${String(LOOK_BUDGET)} rays or fewer`,
      (ctx) => botEndsOn(ctx, Terrain.Pad) && raysCast(ctx) <= LOOK_BUDGET,
      {
        progress: (ctx) => [Math.min(raysCast(ctx), LOOK_BUDGET), LOOK_BUDGET],
        divergence: (ctx) =>
          botEndsOn(ctx, Terrain.Pad)
            ? {
                where: 'look()',
                expected: `${String(LOOK_BUDGET)} rays`,
                received: `${String(raysCast(ctx))} rays`,
              }
            : endedOn(ctx, Terrain.Pad),
      },
    ),
  ],
  starter: [
    '// look(dir, 1) returns a single tile view; look(dir) returns up to eight.',
    '',
    'const ahead = look(Dir.East, 1)[0];',
    'print(ahead ? ahead.terrain : "off the map");',
    '',
  ].join('\n'),
  hints: [
    'The bot cannot see the tunnel. It can see along each of four directions, for free, as often as it likes.',
    'Standing anywhere in the middle of the tunnel there are exactly two openings, and you arrived through one of them.',
    'So you already know one direction you do not want. Hold on to it across the loop, rather than working it out again.',
    'The pad is the only tile in the tunnel that is not plain floor. Check what is under the bot before you decide to move again.',
    'A ray is not a feeler. `look(dir)` hands back the whole straight run of corridor at once, so one call is worth as many steps as the corridor is long — and the next call is only needed where it bends.',
  ],
  docs: ['look', 'coordinates', 'memory'],
};
