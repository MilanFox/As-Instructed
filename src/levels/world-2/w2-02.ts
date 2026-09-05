import type { Vec, World } from '../../engine/index.ts';
import { Dir, ItemKind, Terrain, addBot, createWorld, setTile, vec } from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { clearedEveryRipeTile, harvestedNothingTwice } from './shared.ts';

const WIDTH = 8;
const HEIGHT = 4;
const MAX_GROWTH = 8;

/**
 * The field is the same size every shift and its contents never are. Nothing carries `plantedAt`,
 * so the second sowing is exactly as unripe at the end of the shift as it was at the start — the
 * only decision on a tile is whether it is ready now.
 */
function sowField(world: World): void {
  const tiles: Vec[] = [];
  for (let y = 1; y <= HEIGHT; y++) {
    for (let x = 1; x <= WIDTH; x++) tiles.push(vec(x, y));
  }
  const order = world.rng.shuffle(tiles);
  const ripe = world.rng.int(7, 9);
  const bare = world.rng.int(3, 6);

  order.forEach((at, i) => {
    if (i < ripe) {
      setTile(world, at, {
        terrain: Terrain.Soil,
        crop: ItemKind.Crop,
        growth: MAX_GROWTH,
        maxGrowth: MAX_GROWTH,
      });
      return;
    }
    if (i < ripe + bare) {
      setTile(world, at, { terrain: Terrain.Soil });
      return;
    }
    setTile(world, at, {
      terrain: Terrain.Soil,
      crop: ItemKind.Crop,
      growth: world.rng.int(1, 6),
      maxGrowth: MAX_GROWTH,
    });
  });
}

export const w2_02: LevelDef = {
  id: 'w2-02',
  world: 2,
  index: 2,
  title: 'Ripe Only',
  hardware: ['harvest'],
  brief: [
    '**FROM:** Dep. Coordinator M. Vance',
    '**RE:** South field, first cut',
    '',
    'The south field was sown in two passes, eleven days apart. The gap was raised as a',
    'concern in 2210 and the concern was filed.',
    '',
    'Sweep the field and **harvest every crop that is ready.** A crop is ready when its',
    '`growth` has reached its `maxGrowth`.',
    '',
    'The field is 8 tiles across and 4 deep, walled all round, and the bot starts in the',
    'north-west corner. `harvest()` costs two ticks whether or not it finds anything. Bare',
    'soil reports `crop: null` with `growth: 0` of `maxGrowth: 0`.',
  ].join('\n'),
  seeds: [1, 2, 3, 4],
  par: { ticks: 49, chars: 400 },
  build(seed: number): World {
    const world = createWorld({ w: WIDTH + 2, h: HEIGHT + 2, seed, fill: Terrain.Wall });
    sowField(world);
    addBot(world, { at: vec(1, 1), facing: Dir.East, capacity: 32, name: 'FIELD-02' });
    return world;
  },
  objectives: [clearedEveryRipeTile()],
  bonus: [harvestedNothingTwice('One swing per ripe crop, and no empty swings')],
  starter: [
    '// NOTE(4470): two ticks a swing, ready or not. the field does not care',
    '// NOTE(4470): the sensor is free. use it before the arm',
    '',
    'const here = scan();',
    'print(`${here.crop} ${here.growth}/${here.maxGrowth}`);',
    '',
  ].join('\n'),
  hints: [
    'A swing of the arm costs two ticks even on bare soil. What can you find out for free before you spend them?',
    'Ready means growth has caught up with maxGrowth. Bare soil reports both as zero, which is technically also caught up.',
    'The field is walled on all four sides. The sweep that inspected Bay 7 covers it — the new part is deciding what to do once you arrive on a tile.',
  ],
  docs: ['scan', 'harvest'],
};
