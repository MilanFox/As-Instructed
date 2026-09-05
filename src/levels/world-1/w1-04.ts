import type { Vec, World } from '../../engine/index.ts';
import { Dir, Terrain, addBot, createWorld, eq, setTerrain, vec } from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { parkedOnPad, shortestRoute } from './shared.ts';

/** 11 x 11 including the wall, so the interior is (1,1) to (9,9) and the mirror axis is 10. */
const SIZE = 11;
const SPAN = SIZE - 1;

/** Facilities reflect the pad through the middle of the bay. The routine has never been reviewed. */
export function padFor(start: Vec): Vec {
  return vec(SPAN - start.x, SPAN - start.y);
}

export const w1_04: LevelDef = {
  id: 'w1-04',
  world: 1,
  index: 4,
  title: 'Grid Reference',
  hardware: ['wait'],
  brief: [
    '**FROM:** Dep. Coordinator M. Vance',
    '**RE:** Pad allocation, Bay 4',
    '',
    'Bay 4 is square, empty and swept. A routine repositions the pad every shift by',
    'reflecting it through the centre of the bay. Nobody remembers commissioning it.',
    '',
    'The bay is 11 by 11, walled at the edge and completely open inside. Wherever the tug',
    'drops the bot, the pad is at the reflected grid reference: **x becomes 10 - x, and y',
    'becomes 10 - y.**',
    '',
    'Read the start position with `pos()` and drive to the pad.',
    '',
    'Also fitted this shift: `wait(n)`, which burns n ticks doing nothing. Procurement',
    'supply the sensor package as a bundle.',
  ].join('\n'),
  seeds: [1, 3, 5, 7],
  par: { ticks: 16, chars: 250 },
  build(seed: number): World {
    const world = createWorld({ w: SIZE, h: SIZE, seed, fill: Terrain.Floor });
    for (let x = 0; x < SIZE; x++) {
      setTerrain(world, vec(x, 0), Terrain.Wall);
      setTerrain(world, vec(x, SIZE - 1), Terrain.Wall);
    }
    for (let y = 0; y < SIZE; y++) {
      setTerrain(world, vec(0, y), Terrain.Wall);
      setTerrain(world, vec(SIZE - 1, y), Terrain.Wall);
    }
    let start = vec(world.rng.int(1, SIZE - 2), world.rng.int(1, SIZE - 2));
    // The centre reflects onto itself, which would hand the player a pad they are already on.
    while (eq(start, padFor(start))) {
      start = vec(world.rng.int(1, SIZE - 2), world.rng.int(1, SIZE - 2));
    }
    setTerrain(world, padFor(start), Terrain.Pad);
    addBot(world, { at: start, facing: Dir.East, name: 'RIG-01' });
    return world;
  },
  objectives: [parkedOnPad()],
  bonus: [shortestRoute('Arrive in the fewest possible ticks')],
  starter: [
    '// The pad is the reflection of wherever you started: (10 - x, 10 - y).',
    '',
    'const start = pos();',
    'const pad = { x: 10 - start.x, y: 10 - start.y };',
    '',
    '// Close the gap. pos() is free.',
    '',
  ].join('\n'),
  hints: [
    'Two numbers are wrong at the start and only one of them can be fixed at a time. The order does not matter.',
    'If pos().x is smaller than the pad x, the pad is East. If it is larger, the pad is West. The sign of the difference is the direction.',
    'A loop can run until two numbers match instead of running a fixed number of times.',
  ],
  docs: ['pos', 'move'],
};
