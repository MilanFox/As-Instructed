import type { World } from '../../engine/index.ts';
import { Dir, ItemKind, Terrain, addBot, createWorld, setTile, vec } from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { parkedOnRipestCrop, parkedWithoutOvershoot } from './shared.ts';

const ROW_Y = 1;
const FIRST_X = 1;
const ROW_LENGTH = 10;
const MAX_GROWTH = 8;
const BARE = -1;

/**
 * One reading is always strictly the highest, and it is drawn last so it can land on a tile the
 * first pass left bare. Nothing here ripens: no tile carries `plantedAt`, so every reading is the
 * reading the sensor was installed to compare.
 */
function rowReadings(world: World): number[] {
  const growth: number[] = [];
  for (let i = 0; i < ROW_LENGTH; i++) {
    growth.push(world.rng.chance(0.2) ? BARE : world.rng.int(1, 6));
  }
  growth[world.rng.int(0, ROW_LENGTH - 1)] = MAX_GROWTH;
  return growth;
}

export const w2_01: LevelDef = {
  id: 'w2-01',
  world: 2,
  index: 1,
  title: 'The Sensor Package',
  hardware: ['scan'],
  brief: [
    '**FROM:** Field Eng. D. Halloran',
    '',
    'sensor package came up on the mule. it reads a tile without touching it, which makes it',
    'the only free thing on this site.',
    '',
    'Park on the crop with the highest `growth` reading.',
    '',
    '> ONBOARD: WELCOME TO AGRICULTURE! TIP TWO OF THREE: MEASURE TWICE, IT COSTS NOTHING—',
    '> `[EVALUATION LICENCE — 0 SEATS REMAINING]`',
  ].join('\n'),
  facts: [
    { label: 'Bay 9', value: 'One row.' },
    {
      label: '`scan()`',
      value: 'Reads the tile under the bot. `scan(Dir.East)` reads the next one along. Free.',
    },
    { label: 'One move', value: 'One tick. Reading is free; driving is not.' },
    { label: 'A bare tile', value: 'Reads `crop: null` and `growth: 0`. Not a candidate.' },
    { label: 'The highest', value: 'Exactly one tile has it.' },
    {
      label: '`maxGrowth`',
      value: 'The top of the scale. Nothing in Bay 9 is coming on any further today.',
    },
  ],
  seeds: [1, 2, 8, 13],
  par: { ticks: 18 },
  build(seed: number): World {
    const world = createWorld({ w: 12, h: 3, seed, fill: Terrain.Wall });
    const readings = rowReadings(world);
    readings.forEach((growth, i) => {
      const at = vec(FIRST_X + i, ROW_Y);
      if (growth === BARE) {
        setTile(world, at, { terrain: Terrain.Soil });
        return;
      }
      setTile(world, at, {
        terrain: Terrain.Soil,
        crop: ItemKind.Crop,
        growth,
        maxGrowth: MAX_GROWTH,
      });
    });
    addBot(world, { at: vec(FIRST_X, ROW_Y), facing: Dir.East, name: 'FIELD-02' });
    return world;
  },
  objectives: [parkedOnRipestCrop()],
  bonus: [parkedWithoutOvershoot('Park on the ripest crop without driving one move past it')],
  starter: [
    '// scan() reads the tile under the bot. scan(Dir.East) reads the next one along.',
    '',
    'const here = scan();',
    'print(`growth ${here.growth} of ${here.maxGrowth}`);',
    '',
  ].join('\n'),
  hints: [
    'Reading a tile is free. Driving over it costs a tick. The row is short enough to read all of it.',
    'You cannot name the highest reading until you have seen every tile in the row.',
    'Two things need to travel with you: the best reading so far, and where you saw it.',
    'Read the whole row first, then drive back to the tile you kept. The bot ends the run wherever it stops.',
  ],
  docs: ['scan', 'move'],
};
