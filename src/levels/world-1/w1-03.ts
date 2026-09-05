import type { World } from '../../engine/index.ts';
import { Dir, Terrain, addBot, createWorld, setTerrain, vec } from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { parkedOnPad, rationedSurvey } from './shared.ts';

const START = vec(1, 1);
const MIN_LENGTH = 8;
const MAX_LENGTH = 26;

export const w1_03: LevelDef = {
  id: 'w1-03',
  world: 1,
  index: 3,
  title: 'Length Unknown',
  hardware: ['canMove'],
  brief: [
    '**FROM:** Field Eng. D. Halloran',
    '',
    'survey corridor, west wall. it was measured in 2204 and the 2204 figure is a guess.',
    'i am not walking it for you.',
    '',
    'Drive East and park on the landing pad at the end.',
  ].join('\n'),
  facts: [
    {
      label: '`canMove(Dir.East)`',
      value: 'True when the next tile East is clear. Asking is free.',
    },
    { label: 'A blocked move', value: 'Goes nowhere and still costs a tick.' },
    { label: 'The bay', value: '30 tiles end to end. The corridor has never run the whole of it.' },
  ],
  seeds: [1, 4, 7],
  par: { ticks: 24, chars: 60 },
  build(seed: number): World {
    const world = createWorld({ w: 30, h: 3, seed, fill: Terrain.Wall });
    // Drawn per seed: no integer constant survives all three shifts.
    const length = world.rng.int(MIN_LENGTH, MAX_LENGTH);
    for (let x = START.x; x <= length; x++) setTerrain(world, vec(x, 1), Terrain.Floor);
    setTerrain(world, vec(length, 1), Terrain.Pad);
    addBot(world, { at: START, facing: Dir.East, name: 'RIG-01' });
    return world;
  },
  objectives: [parkedOnPad()],
  bonus: [rationedSurvey(7, 5, 'Use canMove at most 7 times and waste at most 5 steps')],
  starter: [
    '// NOTE(4470): counted twenty-two once. counted nineteen the next shift',
    '// NOTE(4470): it is not the same corridor',
    '',
    'move(Dir.East);',
    '',
  ].join('\n'),
  hints: [
    'You cannot know the length before the run starts. What can you find out during it?',
    'A `while` loop repeats for as long as something stays true. That something can be a question about the world.',
    'The pad is the last tile of the corridor. What does canMove(Dir.East) report once the bot is standing on it?',
    'Seven readings, and up to twenty-nine tiles of driving. One reading has to be good for more than one tile.',
  ],
  docs: ['canMove', 'move'],
};
