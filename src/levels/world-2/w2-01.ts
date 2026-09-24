import type { Vec, World } from '../../engine/index.ts';
import { Dir, ItemKind, Terrain, addBot, createWorld, setTile, vec } from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { everyTilePlanted, harvestedEvery, noWastedFieldwork, ripeAtStart } from './shared.ts';

const FIELD = 5;
const MAX_GROWTH = 8;
const SEED_LOAD = 30;

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

export const w2_01: LevelDef = {
  id: 'w2-01',
  world: 2,
  index: 1,
  title: 'Rotation',
  hardware: ['scan', 'harvest', 'plant'],
  brief: [
    'We pay for every harvest and every plant, even one that does nothing. Doing nothing is a job for management only. — D. Halloran',
    '',
    '**Harvest the ready crops and leave every tile planted.**',
  ].join('\n'),
  board: {
    redrawn: [
      'the start corner',
      'which tiles are ready (8 to 10) and which are bare (4 to 6)',
      'how far the other crops have grown',
    ],
  },
  facts: [
    {
      label: 'Ready crop',
      value:
        'A crop whose `growth` equals `maxGrowth`. Harvesting it leaves bare soil. A crop that is not ready at the start stays not ready.',
    },
    {
      label: 'Planted',
      value:
        'A tile with a crop, ready or not. The field is 5 by 5, all soil. Bare soil reads `crop: null` and growth 0 of 0. `plant()` works only on bare soil. You carry enough seed and have room for every crop.',
    },
    {
      label: 'Ticks',
      value: '`harvest()` and `plant()` take 2 ticks each, even when they do nothing.',
    },
  ],
  seeds: [1, 2, 3, 4],
  par: { ticks: 76 },
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
    harvestedEvery(ripeAtStart, 'Harvest every ready crop', 'harvested-ripe'),
    everyTilePlanted(),
  ],
  bonus: [noWastedFieldwork('No harvest or plant that does nothing')],
  starter: [
    '// NOTE(4470): new corner every shift. canMove() is free.',
    '',
    'const here = scan();',
    'print(`${here.crop} ${here.growth}/${here.maxGrowth}`);',
    '',
  ].join('\n'),
  hints: [
    'scan() is free. harvest() and plant() cost 2 ticks each.',
    'Bare soil reads growth 0 of 0. Check crop too.',
    'plant() fails on a tile that still has a crop.',
    'Two canMove() checks tell you which corner you are in.',
    'Drive row by row and turn at the walls.',
  ],
  docs: ['scan', 'harvest', 'plant'],
};
