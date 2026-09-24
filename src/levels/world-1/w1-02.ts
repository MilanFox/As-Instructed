import type { World } from '../../engine/index.ts';
import { Dir, Terrain, addBot, createWorld, setTerrain, vec } from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { parkedOnPad, rationedSurvey } from './shared.ts';

const START = vec(1, 1);
const MIN_LENGTH = 8;
const MAX_LENGTH = 25;

export const w1_02: LevelDef = {
  id: 'w1-02',
  world: 1,
  index: 2,
  title: 'Length Unknown',
  hardware: ['canMove'],
  brief: [
    'Every canMove() reading costs us money, and so does every bump into the wall. Your salary also costs us money, but we are working on that. — D. Halloran',
    '',
    '**The corridor length changes. Drive East to the landing pad at its end.**',
  ].join('\n'),
  board: {
    redrawn: ['the corridor length'],
  },
  facts: [
    {
      label: 'The run must end on the pad',
      value:
        'The pad is the last floor tile of the corridor. The bot must stand on it when your program ends.',
    },
    {
      label: 'Corridor: 8 to 29 tiles',
      value: 'Straight East. The start tile counts as one of them.',
    },
    { label: 'canMove costs no tick', value: 'Every call still counts toward the bonus.' },
    {
      label: 'Wasted step: a tick past the shortest drive',
      value: 'A move into the wall is one. It costs a tick, and the run goes on.',
    },
  ],
  seeds: [1, 4, 7],
  par: { ticks: 24 },
  graded: false,
  build(seed: number): World {
    const world = createWorld({ w: 30, h: 3, seed, fill: Terrain.Wall });
    const length = world.rng.int(MIN_LENGTH, MAX_LENGTH);
    for (let x = START.x; x <= length; x++) setTerrain(world, vec(x, 1), Terrain.Floor);
    setTerrain(world, vec(length, 1), Terrain.Pad);
    addBot(world, { at: START, facing: Dir.East, name: 'RIG-01' });
    return world;
  },
  objectives: [parkedOnPad()],
  bonus: [rationedSurvey(7, 5, 'Use canMove at most 7 times, with at most 5 wasted steps')],
  starter: ['// NOTE(4470): 22 tiles last shift. 19 this shift.', '', 'move(Dir.East);', ''].join(
    '\n',
  ),
  hints: [
    'On the pad, canMove(Dir.East) is false.',
    'A reading only looks one tile ahead.',
    'You have 7 readings for up to 29 tiles.',
  ],
  docs: ['canMove', 'move'],
};
