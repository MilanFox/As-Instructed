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
    'Welcome, Contractor #4471! We booked the pad for a short slot, and nobody knows who built the pillar, so please do not ask. — Kessler & Daughters',
    '',
    '**Drive your bot, RIG-01, along the fixed route to the landing pad.**',
  ].join('\n'),
  board: {
    redrawn: ['nothing — the board is the same every time'],
  },
  facts: [
    {
      label: 'The run must end on the pad',
      value:
        'The pad is the last tile of the route. The bot must stand on it when your program ends.',
    },
    {
      label: 'The route: a pillar, then 5 straight parts',
      value:
        'Everything else is wall. A pillar stands 2 tiles East of the start. The way round it: 1 East, 1 North, 2 East, 1 South. Then **19 East, 5 South, 22 West, 5 South, 22 East.**',
    },
    { label: 'One move is one tick', value: 'A blocked move costs a tick too.' },
    { label: 'x grows East, y grows South', value: 'North is `y - 1`. West is `x - 1`.' },
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
      label: `Finish within ${String(BOOKED_TICKS)} ticks`,
    }),
  ],
  starter: ['move(Dir.East);', ''].join('\n'),
  hints: [
    'Dir has North, East, South and West.',
    'move() returns false when blocked. The bot stays where it was.',
    'A loop per part keeps the program short.',
  ],
  docs: ['coordinates', 'move', 'print'],
};
