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

/** Path length in cells. 16..30 cells is 31..59 floor tiles, the length the curriculum asks for. */
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

/**
 * The allowance for the whole shift, in rays.
 *
 * Measured, not guessed. A run that looks one tile ahead before every step casts 85, 108 and 101
 * rays on the three declared seeds; a run that looks *down* each corridor and drives the straight
 * stretch it sees casts 35, 41 and 34 for the identical route and the identical tick count. Sixty
 * sits between the two families with room on both sides: it admits a bot that checks all four
 * directions at every bend rather than stopping at the first opening, and refuses anything that
 * treats the ray as a one-tile feeler.
 */
const LOOK_BUDGET = 60;

/** Rays cast this run. Counted off the trace, which is exact — `Verdict.stats.senses` is too. */
const raysCast = (ctx: ObjectiveContext): number =>
  ctx.senses?.['look'] ?? senseTotals(ctx.trace)['look'] ?? 0;

/**
 * A single tunnel with no branches and no cycles, so the only decision on each tile is "which way
 * is not the way I came from". Par is the longest seed's tunnel: the route is forced, the
 * reference walks it once, and there is nothing honest left to shave off.
 */
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
  facts: [
    { label: 'The tunnel', value: 'A different shape every shift.' },
    {
      label: '`look(dir)`',
      value:
        'Returns the tiles along that direction, nearest first. It stops at the first thing it cannot see through.',
    },
    { label: 'Looking', value: 'Free, and as often as you like.' },
    { label: 'The pad', value: 'The only tile in the tunnel that is not plain floor.' },
    {
      label: 'The lamp',
      value: `For the star: reach the pad having cast at most ${String(LOOK_BUDGET)} rays in the whole shift. One ray reports a whole corridor.`,
    },
  ],
  seeds: [1, 2, 3],
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
    /*
     * `single-pass` — reach the pad without entering a tile twice — was measured free. The tunnel
     * does not fork, so any program that arrives has already walked it once and nothing else; the
     * reference took the star on all three seeds and so does every correct program — this is the
     * one level in Worlds 3–8 where the route is forced and par cannot rank anything.
     *
     * That is what makes an information budget the only honest star here. Ticks are identical for
     * every correct program; rays are not. The id is minted in the engine's `within-<n>-<meter>`
     * shape on purpose, so the readout takes the meter from the id and never from the label
     * (DESIGN.md §5) — this level counts the whole of the `look` meter, so the bar is honest.
     *
     * The arrival conjunct is not decoration. A budget alone is satisfied by a program that never
     * runs: nought rays is inside any allowance. A star has to be earned by playing.
     */
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
