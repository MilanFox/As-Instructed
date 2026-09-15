import type { World } from '../../engine/index.ts';
import {
  Dir,
  Objectives,
  Terrain,
  addBot,
  createWorld,
  setTerrain,
  vec,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { parkedOnPad } from './shared.ts';

const START = vec(1, 2);
const BYPASS_END = vec(4, 2);
const EAST_END = vec(23, 2);
const MID_ROW = 7;
const PAD_ROW = 12;
export const PAD = vec(23, 12);

const PAR_TICKS = 78;

const BOOKED_TICKS = 90;

function carveRoute(world: World): void {
  for (let x = START.x; x <= EAST_END.x; x++) setTerrain(world, vec(x, START.y), Terrain.Floor);
  setTerrain(world, vec(3, START.y), Terrain.Wall);
  for (let x = 2; x <= BYPASS_END.x; x++) setTerrain(world, vec(x, 1), Terrain.Floor);
  for (let y = START.y; y <= MID_ROW; y++) setTerrain(world, vec(EAST_END.x, y), Terrain.Floor);
  for (let x = START.x; x <= EAST_END.x; x++) setTerrain(world, vec(x, MID_ROW), Terrain.Floor);
  for (let y = MID_ROW; y <= PAD_ROW; y++) setTerrain(world, vec(START.x, y), Terrain.Floor);
  for (let x = START.x; x <= EAST_END.x; x++) setTerrain(world, vec(x, PAD_ROW), Terrain.Floor);
  setTerrain(world, PAD, Terrain.Pad);
}

export const w1_01: LevelDef = {
  id: 'w1-01',
  world: 1,
  index: 1,
  title: 'Cold Start',
  hardware: ['move', 'pos', 'print', 'wait'],
  brief: [
    '**FROM:** Onboarding, Kessler & Daughters\\',
    '**TO:** Contractor #4471',
    '',
    'Welcome aboard. Your bot sits at the west end of Test Hangar 3 and the landing pad is at',
    'the far end of the service route. A support pillar is in the way: Facilities insist it is',
    'load-bearing, Legal insist it was always there.',
    '',
    'Drive the bot to the pad.',
    '',
    '> WELCOME, NEW HIRE! TIP ONE OF THREE: REPETITION IS THE FOUNDATION OF ALL SAFE—',
    '> `[EVALUATION LICENCE — 0 SEATS REMAINING]`',
  ].join('\n'),
  board: {
    fixed: [
      'Test Hangar 3 is solid wall apart from the service route',
      'the route is one tile wide, with no branches and no dead ends',
      'the pillar is two tiles East, and the gap above it is the only way round',
      'the pad is the far tile of the last leg',
      'RIG-01 starts at the west end of the route, facing East',
    ],
    redrawn: ['nothing — this order runs on one seed, and the hangar is the same on every attempt'],
  },
  facts: [
    { label: 'The pillar', value: 'Two tiles East. The gap above it is the only way round.' },
    { label: 'Route after it', value: '**19 East, 5 South, 22 West, 5 South, 22 East.**' },
    { label: 'Directions', value: '`x` grows East, `y` grows South. North is `y - 1`.' },
    { label: 'One move', value: 'One tick — even a move into a wall.' },
  ],
  seeds: [1],
  par: { ticks: PAR_TICKS },
  graded: false,
  build(seed: number): World {
    const world = createWorld({ w: 25, h: 14, seed, fill: Terrain.Wall });
    carveRoute(world);
    addBot(world, { at: START, facing: Dir.East, name: 'RIG-01' });
    return world;
  },
  objectives: [
    parkedOnPad(),
    Objectives.withinTicks(BOOKED_TICKS, {
      id: 'bay-booking',
      label: `Clear the bay within ${String(BOOKED_TICKS)} ticks`,
    }),
  ],
  starter: ['// x grows East, y grows South. Dir.North is y - 1.', '', 'move(Dir.East);', ''].join(
    '\n',
  ),
  hints: [
    'The gap is above the pillar. North is y - 1.',
    'move() gives back false when something blocks it. The tick is spent either way.',
    'Five legs. Only two things change between them: how far, and which way.',
    'Write 19 once. Write 22 once. Write 5 once. That should be enough.',
    'Driving until a wall stops you does reach the corner, but every blocked move costs a tick, and the bay is only booked for ninety.',
  ],
  docs: ['coordinates', 'move', 'print'],
};
