import type { World } from '../../engine/index.ts';
import { Dir, ItemKind, Terrain, addBot, createWorld, setTile, vec } from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { parkedOnRipestCrop, shortestSurvey } from './shared.ts';

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
    'sensor package came up on the mule this morning. it reads a tile without touching it,',
    'which makes it the only free thing on this site.',
    '',
    'Bay 9 is one row. Drive along it and **park the bot on the crop with the highest',
    '`growth` reading.** Exactly one tile has the highest reading.',
    '',
    '`scan()` returns the tile under the bot and `scan(Dir.East)` returns the one beside it.',
    'Both are free. Moving is not. A bare tile reads `crop: null` and `growth: 0`, and is',
    'not a candidate.',
    '',
    '> ONBOARD: WELCOME TO AGRICULTURE, NEW HIRE! TIP TWO OF THREE: MEASURE TWICE, IT COSTS',
    '> NOTHING TO MEASURE UNLESS YOUR LICENCE HAS— `[EVALUATION LICENCE — 0 SEATS REMAINING]`',
  ].join('\n'),
  seeds: [1, 2, 8, 13],
  par: { ticks: 18, chars: 320 },
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
  bonus: [shortestSurvey('Survey the row without a wasted move')],
  starter: [
    '// scan() reads the tile under the bot. scan(Dir.East) reads the next one along.',
    '',
    'const here = scan();',
    'print(`growth ${here.growth} of ${here.maxGrowth}`);',
    '',
  ].join('\n'),
  hints: [
    'Reading a tile costs nothing and driving over it costs a tick. The row is short enough to read all of it.',
    'You cannot know which reading is the highest until you have seen the last one. What has to survive the walk?',
    'Two things travel with you: the best reading so far, and the position it came from.',
    'The bot ends the run wherever it stops. Getting back to the best tile is part of the job.',
  ],
  docs: ['scan', 'move'],
};
