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
    '**FROM:** Dep. Coordinator M. Vance\\',
    '**RE:** Quarterly floor inspection, Bay 7',
    '',
    'Bay 7 is inspected by driving a bot across every tile of it. The inspection measures',
    'nothing. It produces a figure, and the figure is filed.',
    '',
    'Drive over **every floor tile in the bay**.',
    '',
    'Head Office has asked, in writing, why Bay 7 files more entries than it has floor.',
  ].join('\n'),
  board: {
    fixed: [
      'Bay 7 is a rectangle of floor inside a solid wall, with nothing in it but the partition',
      'the bay is five rows deep, on every shift',
      'one partition and one doorway, and the partition reaches the north wall',
      'the doorway is the southernmost row, so both halves join along the bottom',
      'at least two columns of floor either side of the partition',
      'RIG-01 starts in the north-west corner, facing East',
    ],
    redrawn: ['the width of the bay, six to ten columns', 'the column the partition stands in'],
  },
  facts: [
    { label: 'Inspected', value: 'Any tile the bot stands on. The tile you start on is done.' },
    {
      label: 'The bay',
      value: 'Five rows deep every shift. Six to ten columns wide, redrawn every shift.',
    },
    {
      label: 'The partition',
      value: 'One wall running North to South, in a different column every shift.',
    },
    { label: 'The doorway', value: 'Always the tile at the **southern end** of the partition.' },
    { label: 'An entry', value: 'One tile entered once. Enter it twice and it is filed twice.' },
    {
      label: 'A refused move',
      value: 'Filed too. Driving into a wall spends the allowance without inspecting anything.',
    },
    {
      label: 'The allowance',
      value: 'One move fewer than the bay has floor tiles. A clean route always fits it.',
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
  bonus: [fewerMovesThanFloorTiles('Inspect the bay in fewer moves than it has floor tiles')],
  starter: [
    '// NOTE(4470): the sweep works. it works because I counted this chamber once',
    '// NOTE(4470): the wall moved. the chambers are not always that wide',
    '',
    '// Sweep East while canMove(Dir.East) says there is more row.',
    '',
  ].join('\n'),
  hints: [
    'You cannot measure the bay before you start. canMove() answers one free question about the tile next to you.',
    'Turning round at the end of a row is cheaper than driving back to the start of the next one.',
    'The doorway sits at the South end of the partition. A sweep that reaches the bottom row going East drives through it without being told to.',
    'Once the bot is in the east half, the same sweep works again. Only the direction it climbs has changed.',
    'A sweep that ends at the wrong wall has to drive back over a row it already did. Which way you snake decides which wall you end at.',
    'The bay is five rows deep on every shift, so a row-by-row snake covers an odd number of rows and always ends at the far wall, beside the doorway.',
    'A column-by-column snake ends beside the doorway only when the half has an odd number of columns, and the partition decides how many columns each half has.',
    'A move refused by a wall is still a move, and the allowance is one short of the floor count. A route that inspects every tile once and never bumps is exactly the allowance.',
  ],
  docs: ['canMove', 'move'],
};
