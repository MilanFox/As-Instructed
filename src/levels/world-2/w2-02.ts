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
    'Work every tile of the field.',
  ].join('\n'),
  facts: [
    { label: 'Ready', value: 'A crop whose `growth` has reached its `maxGrowth`.' },
    { label: 'A ready tile', value: 'Harvest it, then plant it again before you move on.' },
    {
      label: 'Bare soil',
      value:
        'Plant it. Reads `crop: null` and `growth: 0` of `maxGrowth: 0`. Seed only goes into bare soil.',
    },
    { label: 'Not ready', value: 'Leave it standing. It already counts as planted.' },
    {
      label: 'A swing',
      value:
        '`harvest()` and `plant()` cost **two ticks each**, whether or not they find anything.',
    },
    { label: 'The hopper', value: 'Far more seed than the field needs.' },
  ],
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
    'A swing of the arm costs two ticks even on bare soil. Scanning first costs nothing.',
    'Ready means growth has caught up with maxGrowth. Bare soil reports both as zero, which also counts as caught up.',
    'Each tile needs at most two actions. Harvest, then plant. The other way round leaves the tile empty.',
    'You start in a different corner each shift. Two free canMove questions tell you which way the field runs.',
    'Sweep row by row and turn at the walls. canMove finds the walls, so the same sweep works from any corner.',
  ],
  docs: ['scan', 'harvest', 'plant'],
};
