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
  /**
   * DESIGN.md §11.10, and the two guarantees `bayLayout` enforces without saying so anywhere.
   *
   * The facts table says the bay is a rectangle, a different size every shift, with the partition
   * in a different column. What it never says is that `divider` is drawn from `3` to `width - 2`,
   * so both halves are at least two columns wide on every seed. That matters to a snake: a
   * one-column half has no second column to climb back through, and a run written to handle the
   * degenerate case it will never meet is longer than the run that ships. Same for the doorway —
   * "always the southern end of the partition" is on the table, but not that the partition itself
   * always reaches the north wall, which is what makes the door the *only* gap in it.
   *
   * The parity line is the one that decides the star. `oneMovePerFloorTile` allows no re-entered
   * tile, and which wall a snake finishes at is settled by whether the half it just swept had an
   * even or an odd number of columns. That was in the hint budget and nowhere else, which
   * §11.3 rules out: a hint sharpens an idea, it does not carry the premise. Stating that the
   * parity is redrawn says the run has to read it at runtime. It does not say what to do about it.
   */
  board: {
    fixed: [
      'Bay 7 is a rectangle of floor inside a solid wall, with nothing in it but the partition',
      'one partition and one doorway, and the partition reaches the north wall',
      'the doorway is the southernmost row, so both halves join along the bottom',
      'at least two columns of floor either side of the partition',
      'RIG-01 starts in the north-west corner, facing East',
    ],
    redrawn: [
      'the width of the bay, six to ten columns',
      'the depth of the bay, five to eight rows',
      'the column the partition stands in',
      'whether each half has an even or an odd number of columns',
    ],
  },
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
    'Count the columns in the west half before committing to a direction. An even count and a row-by-row snake reaches the door on its own. An odd count needs the snake run column by column instead.',
  ],
  docs: ['canMove', 'move'],
};
