import type { Vec, World } from '../../engine/index.ts';
import { Objectives, Terrain, addBot, createWorld, setTerrain } from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import type { Cell } from './caves.ts';
import {
  addCycles,
  carvePerfectMaze,
  cellTile,
  deadEndCells,
  distancesFrom,
  keyOf,
  paintCave,
} from './caves.ts';
import { botEndsOn, markCount } from './objectives.ts';

const CELLS = 9;
const SIZE = 20;

/**
 * How many extra connectors get knocked through the spanning tree, and therefore exactly how many
 * loops the cave contains. Zero is in the list on purpose: seed 4 is a plain tree with no loop
 * anywhere in it, so the machinery a player writes for loops is never exercised and they get to
 * find out that breadcrumbs were insurance rather than ceremony.
 */
const CYCLE_CHOICES = [0, 2, 3, 4] as const;

function build(seed: number): World {
  const world = createWorld({ w: SIZE, h: SIZE, seed, fill: Terrain.Rock });
  const rng = world.rng;
  const grid = carvePerfectMaze(rng, CELLS, CELLS);
  addCycles(rng, grid, rng.pick(CYCLE_CHOICES));
  paintCave(world, grid);

  const ends = deadEndCells(grid);
  const startCell: Cell = ends.length > 0 ? rng.pick(ends) : { i: 0, j: 0 };
  const start = cellTile(startCell.i, startCell.j);

  const distances = distancesFrom(world, start);
  const candidates = (ends.length > 1 ? ends : [{ i: CELLS - 1, j: CELLS - 1 }])
    .map((cell) => cellTile(cell.i, cell.j))
    .filter((at) => at.x !== start.x || at.y !== start.y);
  const vein = candidates.reduce<Vec>(
    (best, at) => ((distances.get(keyOf(at)) ?? 0) > (distances.get(keyOf(best)) ?? 0) ? at : best),
    candidates[0] ?? start,
  );

  setTerrain(world, vein, Terrain.Pad);
  addBot(world, { at: start, name: 'RIG-04' });
  return world;
}

/** Above the reference's own worst seed, and well under a program that marks on every step. */
const MARK_BUDGET = 180;

/**
 * The cave loops. The rule that carried w4-01 — never step back the way you came — becomes a
 * closed circuit here, and the replay shows the bot riding it until the shift ends. What breaks
 * the circuit is knowing which tiles have already been stood on.
 */
export const w4_02: LevelDef = {
  id: 'w4-02',
  world: 4,
  index: 2,
  title: 'Breadcrumbs',
  hardware: ['mark', 'readMark'],
  brief: [
    '> dot: survey have a map of this one. it is a photograph of a whiteboard, and the',
    '> whiteboard has since been cleaned. what i can tell you is that the tunnels join up.',
    '> you will arrive somewhere you have already been, and it will not look any different',
    '> when you do.',
    '',
    'Reach the ore vein. It is the one pad tile in the cave, set into the rock at the vein face.',
    '',
    'These tunnels contain loops. A rule like "never go back the way you came" walks a loop',
    'forever, and the run will be cut off when the tick budget runs out.',
    '',
    '`mark(text)` writes a breadcrumb onto the tile the bot is standing on, and costs one tick.',
    "`readMark()` returns the breadcrumb under the bot, and costs nothing. A tile's mark also",
    'appears in what `look` returns, so a neighbour can be checked without stepping onto it.',
  ].join('\n'),
  seeds: [1, 2, 3, 4],
  par: { ticks: 391, chars: 430 },
  budget: { maxTicks: 1600 },
  build,
  objectives: [
    Objectives.custom('reach-vein', 'Park the bot on the ore vein', (ctx) =>
      botEndsOn(ctx, Terrain.Pad),
    ),
  ],
  bonus: [
    Objectives.custom(
      'mark-budget',
      `Reach the vein having placed fewer than ${MARK_BUDGET} marks`,
      (ctx) => markCount(ctx) < MARK_BUDGET,
      (ctx) => [Math.min(markCount(ctx), MARK_BUDGET), MARK_BUDGET],
    ),
  ],
  starter: [
    '// NOTE(4470): the tunnel joins back onto itself. more than once',
    '// NOTE(4470): the junctions all look the same from inside',
    '',
    '// mark() writes on the tile under the bot. look() reports a neighbour mark.',
    'mark("start");',
    'print(readMark());',
    '',
  ].join('\n'),
  hints: [
    'The bot is not lost because it cannot see. It is lost because two junctions look identical from inside.',
    'Something has to be different about a tile you have already stood on. Either the tile changes, or your program remembers it did.',
    'Once every opening out of a tile leads somewhere already accounted for, the tile is finished and the only useful move is backwards.',
    'Backwards is a specific direction, not a general idea. Keep the ones you would need, in order, and the way out is the reverse of the way in.',
  ],
  docs: ['mark', 'look'],
};
