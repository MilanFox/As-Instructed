import type { World } from '../../engine/index.ts';
import { Dir, Rng, Terrain, addBot, createWorld, setTerrain, vec } from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { inspectedEveryTile, noBlockedMoves } from './shared.ts';

const START = vec(1, 1);

export interface BayLayout {
  /** Interior width and height. The grid is one wall tile larger on every side. */
  width: number;
  height: number;
  /** Interior column the partition wall stands in. The doorway is its southern-most tile. */
  divider: number;
}

/** Both dimensions and the partition move between shifts, so no leg length is a constant. */
export function bayLayout(seed: number): BayLayout {
  const rng = new Rng(seed);
  const width = rng.int(6, 10);
  const height = rng.int(5, 8);
  const divider = rng.int(3, width - 2);
  return { width, height, divider };
}

export const w1_05: LevelDef = {
  id: 'w1-05',
  world: 1,
  index: 5,
  title: 'Floor Inspection',
  hardware: [],
  brief: [
    '**FROM:** Dep. Coordinator M. Vance',
    '**RE:** Quarterly floor inspection, Bay 7',
    '',
    'Bay 7 is inspected by driving a bot across every tile of it. The inspection does not',
    'measure anything. It produces a figure, and the figure is filed.',
    '',
    'Drive the bot over **every floor tile in the bay**. Standing on a tile counts as',
    'inspecting it; the tile you start on is already done.',
    '',
    'The bay is a rectangle split by a partition wall running North to South. The partition',
    'has exactly one doorway and it is always the tile at the **southern end** of the wall.',
    'The bay is a different size every shift and the partition stands in a different column.',
  ].join('\n'),
  seeds: [1, 2, 6, 8],
  par: { ticks: 50, chars: 420 },
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
  bonus: [noBlockedMoves('Sweep the whole bay without one blocked move')],
  starter: [
    '// NOTE(4470): the sweep works. it works because the room is square',
    '// NOTE(4470): the room is not always square',
    '',
    '// Sweep East while canMove(Dir.East) says there is more row.',
    '',
  ].join('\n'),
  hints: [
    'You cannot measure the bay before you start. canMove() answers one question at a time, for free, about the tile next to you.',
    'Turning round at the end of a row is cheaper than driving back to the start of the next one.',
    'The doorway is the last tile of the partition, at the South end. A sweep that reaches the bottom row going East goes through it without being asked.',
    'Once the bot is in the east half, the same sweep works again — only the direction it climbs has changed.',
  ],
  docs: ['canMove', 'move'],
};
