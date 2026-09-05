import type { World } from '../../engine/index.ts';
import { Dir, Rng, Terrain, addBot, createWorld, setTerrain, vec } from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { inspectedEveryTile, oneMovePerFloorTile } from './shared.ts';

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
    'Bay 7 is inspected by driving a bot across every tile of it. The inspection measures',
    'nothing. It produces a figure, and the figure is filed.',
    '',
    'Drive over **every floor tile in the bay**.',
    '',
    'Head Office has asked, in writing, why Bay 7 files more entries than it has floor.',
  ].join('\n'),
  facts: [
    { label: 'Inspected', value: 'Any tile the bot stands on. The tile you start on is done.' },
    { label: 'The bay', value: 'A rectangle. A different size every shift.' },
    {
      label: 'The partition',
      value: 'One wall running North to South, in a different column every shift.',
    },
    { label: 'The doorway', value: 'Always the tile at the **southern end** of the partition.' },
    { label: 'An entry', value: 'One tile entered once. Enter it twice and it is filed twice.' },
  ],
  seeds: [21, 1, 2, 6, 8],
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
  bonus: [oneMovePerFloorTile('Inspect the bay in no more than one move per floor tile')],
  starter: [
    '// NOTE(4470): the sweep works. it works because the room is square',
    '// NOTE(4470): the room is not always square',
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
  ],
  docs: ['canMove', 'move'],
};
