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
 * Gold is the sensor used for what it is for, not the row walked twice.
 *
 * Reading every tile and driving back to the best one is correct and costs 18 on the worst seed:
 * out to the far wall and most of the way back. But exactly one tile is at `maxGrowth` and the
 * facts table says so, so a reading that hits the ceiling has nothing left to be compared against
 * — the bot can stop on it. That answer costs at most 9, which is the walk out and no walk back.
 *
 * Par sits between them at 16, which golds the early stop with seven ticks of room and silvers the
 * double walk at 18 against a silver line of 20. Both programs are correct; one of them believed
 * the instrument.
 */
const PAR_TICKS = 16;

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
    {
      label: 'The highest',
      value: 'Exactly one tile has it, and it reads **at `maxGrowth`**.',
    },
    {
      label: '`maxGrowth`',
      value: 'The top of the scale. Nothing in Bay 9 is coming on any further today.',
    },
  ],
  seeds: [1, 2, 8, 13],
  par: { ticks: PAR_TICKS },
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
    'Two things need to travel with you: the best reading so far, and where you saw it.',
    'Read the whole row first, then drive back to the tile you kept. The bot ends the run wherever it stops.',
    'That walk back is most of what the run costs. The tile you wanted was under the bot once and the bot carried on past it.',
    'Nothing in Bay 9 is above the top of the scale, and one tile is on it. A reading that hits maxGrowth has nothing left to be compared against.',
  ],
  docs: ['scan', 'move'],
};
