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
import { noBlockedMoves, parkedOnPad } from './shared.ts';

const START = vec(1, 1);
const CORNER = vec(21, 1);
const TURN = vec(21, 10);
export const PAD = vec(5, 10);

/** The three legs, in order: 20 East, 9 South, 16 West. 45 moves, and there is no shortcut. */
const PAR_TICKS = 45;

/**
 * The bay is booked for sixty ticks, which is the route plus a third of it again.
 *
 * Nothing in a trace can tell a `for` loop apart from forty-five typed-out `move` calls — they
 * emit the same events — so the gate here is not the shape of the program, it is the shape of the
 * *route*. Forty-five is more than anyone writes by hand, and the one answer that avoids counting
 * without thinking — fire moves at a wall until they stop working — overruns the booking.
 */
const BOOKED_TICKS = 60;

function carveRoute(world: World): void {
  for (let x = START.x; x <= CORNER.x; x++) setTerrain(world, vec(x, START.y), Terrain.Floor);
  for (let y = CORNER.y; y <= TURN.y; y++) setTerrain(world, vec(CORNER.x, y), Terrain.Floor);
  for (let x = PAD.x; x <= TURN.x; x++) setTerrain(world, vec(x, TURN.y), Terrain.Floor);
  setTerrain(world, PAD, Terrain.Pad);
}

export const w1_02: LevelDef = {
  id: 'w1-02',
  world: 1,
  index: 2,
  title: 'Forty-Five Metres of Corridor',
  hardware: ['print'],
  brief: [
    '**FROM:** Dep. Coordinator M. Vance',
    '**RE:** Route 2, Bay 2',
    '',
    'Facilities have described the route to the far pad as "a corridor". It is three',
    'corridors, and the last one doubles back.',
    '',
    'Drive the bot to the landing pad. The route is **20 tiles East, then 9 tiles South,',
    'then 16 tiles West.** No obstacles, no branches.',
    '',
    '**Bay 2 is booked to you for 60 ticks.** The route is 45 of them. One move is one tick',
    'whether or not it goes anywhere, so a move into a wall is a tick spent on nothing.',
    '',
    '> WELCOME, NEW HIRE! TIP TWO OF THREE: REPETITION IS THE FOUNDATION OF ALL SAFE—',
    '> `[EVALUATION LICENCE — 0 SEATS REMAINING — CONTACT YOUR ADMINISTRATOR]`',
  ].join('\n'),
  seeds: [1],
  par: { ticks: PAR_TICKS, chars: 160 },
  build(seed: number): World {
    const world = createWorld({ w: 23, h: 12, seed, fill: Terrain.Wall });
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
  bonus: [noBlockedMoves('Reach the pad without one blocked move')],
  starter: [
    '// Route 2: 20 East, then 9 South, then 16 West.',
    '',
    'for (let i = 0; i < 20; i++) {',
    '  move(Dir.East);',
    '}',
    '',
  ].join('\n'),
  hints: [
    'The three legs differ in two ways: how far, and which way. Everything else about them is identical.',
    'The number 20 only needs to appear once in your program. So does 9, and so does 16.',
    'Driving until the wall stops you does reach the corner, but every attempt that fails still costs a tick, and the bay is only booked for sixty.',
    'If a leg does not end where you expected, print the position after it and compare with the route above.',
  ],
  docs: ['move', 'print'],
};
