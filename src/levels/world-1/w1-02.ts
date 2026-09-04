import type { World } from '../../engine/index.ts';
import { Dir, Terrain, addBot, createWorld, setTerrain, vec } from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { parkedOnPad } from './shared.ts';

const START = vec(1, 1);
const CORNER = vec(13, 1);
const TURN = vec(13, 7);
export const PAD = vec(22, 7);

/** The three legs, in order: 12 East, 6 South, 9 East. 27 moves, and there is no shortcut. */
function carveRoute(world: World): void {
  for (let x = START.x; x <= CORNER.x; x++) setTerrain(world, vec(x, START.y), Terrain.Floor);
  for (let y = CORNER.y; y <= TURN.y; y++) setTerrain(world, vec(CORNER.x, y), Terrain.Floor);
  for (let x = TURN.x; x <= PAD.x; x++) setTerrain(world, vec(x, TURN.y), Terrain.Floor);
  setTerrain(world, PAD, Terrain.Pad);
}

export const w1_02: LevelDef = {
  id: 'w1-02',
  world: 1,
  index: 2,
  title: 'Twenty Metres of Corridor',
  hardware: ['print'],
  brief: [
    '**FROM:** Dep. Coordinator M. Vance',
    '**RE:** Route 2, Bay 2',
    '',
    'Facilities have described the route to the far pad as "a corridor". It is three',
    'corridors. The turns were surveyed in 2204 and the survey is attached, in a format',
    'nobody here can open.',
    '',
    'Drive the bot to the landing pad. The route is **12 tiles East, then 6 tiles South,',
    'then 9 tiles East.** There are no obstacles and no branches.',
    '',
    'Twenty-seven separate `move()` calls will get you there. So will three loops, and the',
    'character count in the corner is part of your score.',
    '',
    '> WELCOME, NEW HIRE! TIP TWO OF THREE: REPETITION IS THE FOUNDATION OF ALL SAFE—',
    '> `[EVALUATION LICENCE — 0 SEATS REMAINING — CONTACT YOUR ADMINISTRATOR]`',
  ].join('\n'),
  seeds: [1],
  par: { ticks: 27, chars: 160 },
  build(seed: number): World {
    const world = createWorld({ w: 24, h: 9, seed, fill: Terrain.Wall });
    carveRoute(world);
    addBot(world, { at: START, facing: Dir.East, name: 'RIG-01' });
    return world;
  },
  objectives: [parkedOnPad()],
  starter: [
    '// Route 2: 12 East, then 6 South, then 9 East.',
    '// A counted loop runs the same block a fixed number of times:',
    '//   for (let i = 0; i < 12; i++) { ... }',
    '',
    'for (let i = 0; i < 12; i++) {',
    '  move(Dir.East);',
    '}',
    '',
  ].join('\n'),
  hints: [
    'The three legs differ in two ways: how far, and which way. Everything else about them is identical.',
    'The number 12 only needs to appear once in your program. So does 6, and so does 9.',
    'If a leg does not end where you expected, print the position after it and compare with the route above.',
  ],
  docs: ['move', 'print'],
};
