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

/**
 * Five moves round the pillar, then legs of 19, 5, 22, 5 and 22. Seventy-eight tiles, and the
 * only way past the pillar rejoins the run on exactly one tile, so the legs the brief quotes are
 * the legs the player walks.
 */
const PAR_TICKS = 78;

/**
 * The bay is booked for ninety ticks, which is the route plus a sixth of it again.
 *
 * Nothing in a trace can tell a `for` loop apart from seventy-eight typed-out `move` calls — they
 * emit the same events — so the gate here is not the shape of the program, it is the shape of the
 * route. Seventy-eight is far more than anyone writes by hand, and the one answer that avoids
 * counting without thinking — fire moves at a wall until they stop working — overruns the booking.
 */
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
    '**FROM:** Onboarding, Kessler & Daughters Terraforming Ltd.',
    '**TO:** Contractor #4471',
    '',
    'Welcome aboard. Your bot is at the west end of Test Hangar 3 and the landing pad is at',
    'the far end of the service route. There is a support pillar two tiles East of the bot.',
    'Facilities insist it is load-bearing. Legal insist it was always there.',
    '',
    'There is a gap in the wall above the pillar, and exactly one way round it.',
    '',
    'Once you are past the pillar and back on the main run, Facilities give the route as',
    '**19 tiles East, then 5 South, then 22 West, then 5 South, then 22 East.** No branches,',
    'no obstacles, and nothing to decide.',
    '',
    '`move(Dir.East)` steps one tile East. `x` grows East, `y` grows **South**, so North is',
    '`y - 1`.',
    '',
    '**Bay 3 is booked to you for 90 ticks.** The route is 78 of them. One move is one tick',
    'whether or not it goes anywhere, so a move into a wall is a tick spent on nothing.',
    '',
    'Also fitted this shift: `print(text)`, which writes a line to the console, and `wait(n)`,',
    'which burns n ticks doing nothing. Procurement supply the starter package as a bundle.',
    '',
    '> WELCOME, NEW HIRE! TIP ONE OF THREE: REPETITION IS THE FOUNDATION OF ALL SAFE—',
    '> `[EVALUATION LICENCE — 0 SEATS REMAINING — CONTACT YOUR ADMINISTRATOR]`',
  ].join('\n'),
  seeds: [1],
  par: { ticks: PAR_TICKS, chars: 400 },
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
  starter: [
    '// x grows East, y grows South. Dir.North is y - 1.',
    '',
    'move(Dir.East);',
    '',
  ].join('\n'),
  hints: [
    'The pillar is two tiles East of the bot and the gap in the wall is above it. North is y - 1.',
    'move() returns false when something is in the way, and it still costs you the tick.',
    'Five legs, and only two things change between them: how far, and which way.',
    'The number 19 needs to appear in your program once. So does 22, and so does 5.',
    'Driving until the wall stops you does reach a corner, but every attempt that fails still costs a tick, and the bay is only booked for ninety.',
  ],
  docs: ['coordinates', 'move', 'print'],
};
