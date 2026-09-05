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

export const w2_03: LevelDef = {
  id: 'w2-03',
  world: 2,
  index: 3,
  title: 'Rotation',
  hardware: ['plant'],
  brief: [
    '**FROM:** Field Eng. D. Halloran',
    '',
    'you will have seen the rotation memo. it is real and they do check. the silo was moved',
    'again over the winter, so the mule drops you at a different corner than last time.',
    '',
    'Work every tile of the field. On a tile whose crop is ready: **harvest it, then plant',
    'the same tile again before moving on.** On a tile that is bare: plant it. **No soil',
    'tile may be left empty at the end of the shift.**',
    '',
    'Crops that are not ready are left standing; they already count as planted. The hopper',
    'holds far more seed than the field needs. `plant()` costs two ticks whether or not the',
    'ground takes it, and it only takes a seed on bare soil.',
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
    '// The mule parks at a different corner each quarter. canMove() is free.',
    '',
    'const here = scan();',
    'if (here.crop === null) {',
    '  plant();',
    '}',
    '',
  ].join('\n'),
  hints: [
    'The tile you just harvested is bare, and the tile you just planted is not ready. Both were true one tick after you last sensed them.',
    'Which corner you woke up in decides which way the field runs. Two free questions at the start of the run settle it for good.',
    'A tile needs at most two actions and the order is not negotiable. Doing them the other way round leaves the tile empty.',
    'Unripe crops need nothing at all. Every tick spent on one is a tick you do not get back.',
  ],
  docs: ['plant', 'harvest', 'scan'],
};
