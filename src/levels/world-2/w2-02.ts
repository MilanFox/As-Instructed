import type { Vec, World } from '../../engine/index.ts';
import { Dir, ItemKind, Terrain, addBot, createWorld, setTile, vec } from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { everyTilePlanted, harvestedEvery, noWastedFieldwork, ripeAtStart } from './shared.ts';

const FIELD = 5;
const MAX_GROWTH = 8;
const SEED_LOAD = 30;

/** The silo moves between quarters and the mule parks beside it, so the sweep starts anywhere. */
const CORNERS: readonly Vec[] = [vec(1, 1), vec(FIELD, 1), vec(1, FIELD), vec(FIELD, FIELD)];

function sowField(world: World): void {
  const tiles: Vec[] = [];
  for (let y = 1; y <= FIELD; y++) {
    for (let x = 1; x <= FIELD; x++) tiles.push(vec(x, y));
  }
  const order = world.rng.shuffle(tiles);
  const ripe = world.rng.int(8, 10);
  const bare = world.rng.int(4, 6);

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
  title: 'Rotation',
  hardware: ['harvest', 'plant'],
  brief: [
    '**FROM:** Field Eng. D. Halloran',
    '',
    'you will have seen the rotation memo. it is real and they do check. the silo was moved',
    'again over the winter, so the mule drops you at a different corner than last time.',
    '',
    'Work every tile of the field. **A crop is ready when its `growth` has reached its',
    '`maxGrowth`.** On a tile whose crop is ready: **harvest it, then plant the same tile',
    'again before moving on.** On a tile that is bare: plant it. **No soil tile may be left',
    'empty at the end of the shift.**',
    '',
    'Crops that are not ready are left standing; they already count as planted. The hopper',
    'holds far more seed than the field needs. `harvest()` and `plant()` cost two ticks each',
    'whether or not they find anything, and seed only goes into bare soil. Bare soil reports',
    '`crop: null` with `growth: 0` of `maxGrowth: 0`.',
  ].join('\n'),
  seeds: [1, 2, 3, 4],
  par: { ticks: 76, chars: 600 },
  build(seed: number): World {
    const world = createWorld({ w: FIELD + 2, h: FIELD + 2, seed, fill: Terrain.Wall });
    sowField(world);
    const corner = world.rng.pick(CORNERS);
    addBot(world, {
      at: corner,
      facing: Dir.East,
      capacity: 60,
      inventory: [{ kind: ItemKind.Seed, count: SEED_LOAD }],
      name: 'FIELD-02',
    });
    return world;
  },
  objectives: [
    harvestedEvery(ripeAtStart, 'Harvest every crop that was ready', 'harvested-ripe'),
    everyTilePlanted(),
  ],
  bonus: [noWastedFieldwork('Waste no swing and no seed')],
  starter: [
    '// NOTE(4470): two ticks a swing, ready or not. the field does not care',
    '// The mule parks at a different corner each quarter. canMove() is free.',
    '',
    'const here = scan();',
    'print(`${here.crop} ${here.growth}/${here.maxGrowth}`);',
    '',
  ].join('\n'),
  hints: [
    'A swing of the arm costs two ticks even on bare soil. What can you find out for free before you spend them?',
    'Ready means growth has caught up with maxGrowth. Bare soil reports both as zero, which is technically also caught up.',
    'The tile you just harvested is bare, and the tile you just planted is not ready. Both were true one tick after you last sensed them.',
    'Which corner you woke up in decides which way the field runs. Two free questions at the start of the run settle it for good.',
    'A tile needs at most two actions and the order is not negotiable. Doing them the other way round leaves the tile empty.',
  ],
  docs: ['scan', 'harvest', 'plant'],
};
