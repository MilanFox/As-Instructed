import type { World } from '../../engine/index.ts';
import {
  Dir,
  Objectives,
  Terrain,
  addBot,
  createWorld,
  paintAscii,
  setTile,
  vec,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';

const HANGAR = ['#######', '#.....#', '#..#..#', '#.....#', '#######'];

const LEGEND = {
  '#': Terrain.Wall,
  '.': Terrain.Floor,
};

const START = vec(1, 2);
export const PAD = vec(5, 2);

/**
 * The wall at (3, 2) sits directly between start and pad, so the shortest route is 6 moves:
 * four East and a two-tile detour. Par is the optimum — this is the tutorial, and the detour
 * is the whole lesson.
 */
export const w1_01: LevelDef = {
  id: 'w1-01',
  world: 1,
  index: 1,
  title: 'Hello, Regolith',
  hardware: ['move', 'pos'],
  brief: [
    '**FROM:** Onboarding, Kessler & Daughters Terraforming Ltd.',
    '**TO:** Contractor #4471',
    '',
    'Welcome aboard. Your bot is sitting in Test Hangar 3 and the landing pad is at the far',
    'end of it. Between the two there is a support pillar that Facilities insists is',
    'load-bearing and Legal insists was always there.',
    '',
    'Drive the bot onto the landing pad. The pillar is not negotiable; go around it.',
    '',
    'Call `move(Dir.East)` to step one tile East. `x` grows East, `y` grows **South**, so',
    '`Dir.North` decreases `y`. This trips up roughly everyone once.',
  ].join('\n'),
  seeds: [1],
  par: { ticks: 6, chars: 120 },
  build(seed: number): World {
    const world = createWorld({ w: 7, h: 5, seed, fill: Terrain.Floor });
    paintAscii(world, HANGAR, LEGEND);
    setTile(world, PAD, { terrain: Terrain.Pad });
    addBot(world, { at: START, facing: Dir.East, name: 'RIG-01' });
    return world;
  },
  objectives: [
    Objectives.botAt(PAD, { id: 'reach-pad', label: 'Park the bot on the landing pad' }),
  ],
  bonus: [Objectives.withinTicks(6, { id: 'optimal-route', label: 'Do it in 6 ticks or fewer' })],
  starter: [
    '// Drive the bot onto the landing pad at the far end of the hangar.',
    '// x grows East, y grows South. Dir.North is y - 1.',
    '',
    'move(Dir.East);',
    '',
  ].join('\n'),
  hints: [
    'The pad is four tiles East of where you start. Try moving East and see how far you get.',
    'move() returns false when something is in the way, and it still costs you the tick.',
    'You cannot pass through the pillar. What is directly North of it?',
  ],
  docs: ['coordinates', 'move'],
};
