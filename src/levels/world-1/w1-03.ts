import type { World } from '../../engine/index.ts';
import { Dir, Rng, Terrain, addBot, createWorld, setTerrain, vec } from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { fewerMovesThanFloorTiles, inspectedEveryTile } from './shared.ts';

const START = vec(1, 1);

/** Odd on purpose: an odd depth is what leaves a clean route through every bay the width can roll. */
export const BAY_DEPTH = 5;

export interface BayLayout {
  width: number;
  height: number;
  divider: number;
}

export function bayLayout(seed: number): BayLayout {
  const rng = new Rng(seed);
  const width = rng.int(6, 10);
  const divider = rng.int(3, width - 2);
  return { width, height: BAY_DEPTH, divider };
}

export const w1_03: LevelDef = {
  id: 'w1-03',
  world: 1,
  index: 3,
  title: 'Floor Inspection',
  hardware: [],
  brief: [
    'The last report listed more moves than Bay 7 has tiles, and Head Office asked why. I said "enthusiasm", and I will not say it twice. — M. Vance',
    '',
    '**Drive over every floor tile in the bay, around an inner wall.**',
  ].join('\n'),
  board: {
    redrawn: ['the bay width, six to ten columns', 'the column of the inner wall'],
  },
  facts: [
    {
      label: 'The start tile counts as visited',
      value: 'A tile is visited once the bot stands on it.',
    },
    {
      label: 'Bay: 5 rows, 6 to 10 columns, start top-left',
      value:
        'The inner wall stands in one of these columns. The bot starts in the top-left corner, on every board.',
    },
    {
      label: 'Inner wall: one column, open in the bottom row',
      value:
        'It runs South from the top wall. The gap is one tile, in the **bottom row**. Its column changes. At least 2 columns of floor on each side.',
    },
    {
      label: 'A route with no repeats uses floor tiles − 1 moves',
      value: 'Every move counts, blocked or repeated too. One move is one tick.',
    },
  ],
  seeds: [11, 5, 7, 15, 30, 88],
  par: { ticks: 50 },
  build(seed: number): World {
    const { width, height, divider } = bayLayout(seed);
    const world = createWorld({ w: width + 2, h: height + 2, seed, fill: Terrain.Wall });
    for (let y = 1; y <= height; y++) {
      for (let x = 1; x <= width; x++) setTerrain(world, vec(x, y), Terrain.Floor);
    }
    for (let y = 1; y < height; y++) setTerrain(world, vec(divider, y), Terrain.Wall);
    addBot(world, { at: START, facing: Dir.East, name: 'RIG-01' });
    return world;
  },
  objectives: [inspectedEveryTile()],
  bonus: [fewerMovesThanFloorTiles('Use fewer moves than the bay has floor tiles')],
  starter: [
    '// NOTE(4470): the inner wall moves every shift.',
    '',
    '// Drive East while canMove(Dir.East) is true.',
    '',
  ].join('\n'),
  hints: [
    'Measuring the bay first costs moves. canMove() costs none and tells you if the next tile is clear.',
    'Change direction at the end of each row. Do not drive back to the start of the row.',
    'The gap is in the bottom row. A sweep going East along the bottom row passes through it.',
    'The bay has 5 rows. A row-by-row sweep drives the bottom row going East, toward the gap.',
  ],
  docs: ['canMove', 'move'],
};
