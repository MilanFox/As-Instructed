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
  /**
   * DESIGN.md §11.10. The floor of eight tiles is on this sheet on purpose.
   *
   * `MIN_LENGTH` is the only number in `build` a player can act on, and the star cannot be earned
   * without it. Seven readings against twenty-nine tiles of bay means a reading has to be good for
   * several tiles, which means striding blind before the first one — and a stride is a gamble
   * unless the shortest corridor the site ever draws is known. The facts table already draws the
   * far edge ("30 tiles end to end, and the corridor has never run the whole of it"); it drew no
   * near edge, so the honest version of the bonus was indistinguishable from a guess that happens
   * to hold on three seeds. Naming the floor turns it into arithmetic. It gives nothing away about
   * *this* corridor: the graded fact is where the pad is, and eight-to-twenty-six still leaves
   * nineteen answers.
   *
   * `build`'s own comment says no integer constant survives all three shifts. That is the sentence
   * `redrawn` exists to say to the player rather than only to the next author.
   */
  board: {
    fixed: [
      'one corridor, one tile deep, running East from the west wall',
      'no branches and no side openings — the only way on is East',
      'never shorter than eight tiles, and never long enough to reach the east wall',
      'the pad is the last floor tile of the corridor',
      'RIG-01 starts on the westmost tile, facing East',
    ],
    redrawn: [
      'the corridor length — no one number covers every shift',
      'the tile the pad sits on, since it is always the last of them',
    ],
  },
  facts: [
    {
      label: '`canMove(Dir.East)`',
      value: 'True when the next tile East is clear. Asking is free.',
    },
    { label: 'A blocked move', value: 'Goes nowhere and still costs a tick.' },
    { label: 'The bay', value: '30 tiles end to end. The corridor has never run the whole of it.' },
  ],
  seeds: [1, 4, 7],
  par: { ticks: 24 },
  graded: false,
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
