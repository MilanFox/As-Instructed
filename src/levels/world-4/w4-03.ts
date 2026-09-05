import type { Dir, Vec, World } from '../../engine/index.ts';
import {
  ALL_DIRS,
  Dir as D,
  Objectives,
  Terrain,
  addBot,
  createWorld,
  setTerrain,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { carvePerfectMaze, paintCave } from './caves.ts';
import { botEndsOn, markCount } from './objectives.ts';

const CELLS = 12;
const SIZE = 2 * CELLS + 1;

/** The boundary tile that opens the outside wall next to a randomly chosen edge cell. */
function boundaryOpening(rng: { int(min: number, max: number): number }, side: Dir): Vec {
  const n = rng.int(0, CELLS - 1);
  switch (side) {
    case D.North:
      return { x: 2 * n + 1, y: 0 };
    case D.South:
      return { x: 2 * n + 1, y: SIZE - 1 };
    case D.West:
      return { x: 0, y: 2 * n + 1 };
    case D.East:
      return { x: SIZE - 1, y: 2 * n + 1 };
  }
}

function build(seed: number): World {
  const world = createWorld({ w: SIZE, h: SIZE, seed, fill: Terrain.Rock });
  const rng = world.rng;
  const grid = carvePerfectMaze(rng, CELLS, CELLS);
  paintCave(world, grid);

  const entranceSide = rng.pick(ALL_DIRS);
  const exitSide = rng.pick(ALL_DIRS.filter((dir) => dir !== entranceSide));
  const entrance = boundaryOpening(rng, entranceSide);
  const exit = boundaryOpening(rng, exitSide);

  setTerrain(world, entrance, Terrain.Floor);
  setTerrain(world, exit, Terrain.Pad);
  addBot(world, { at: entrance, name: 'RIG-04' });
  return world;
}

/**
 * A spanning tree over 12x12 cells, so the floor graph is a tree and every wall in the grid is
 * attached to the outside wall. That is not decoration: it is the precondition that makes keeping
 * one hand on the wall a guarantee rather than a hope, and `world-4.test.ts` asserts it on every
 * shipped seed. Both openings are in the outside wall and the exit moves between the four sides,
 * so even the first turn cannot be assumed.
 */
export const w4_03: LevelDef = {
  id: 'w4-03',
  world: 4,
  index: 3,
  title: 'Left Hand on the Wall',
  hardware: [],
  brief: [
    'The survey grid was cut by machine and never revisited. Facilities list it as the only',
    'fully documented structure on site. A machine did the documenting.',
    '',
    'One way in, one way out, no loops, and every wall in it joins the outside wall somewhere.',
    '',
    'Drive the bot from the entrance to the exit pad. Both are openings in the outside wall, and',
    'the exit is on a different side of the grid every shift.',
    '',
    'Your breadcrumbs would work here. They are not necessary, and they cost a tick each.',
  ].join('\n'),
  seeds: [1, 2, 3, 4],
  par: { ticks: 548, chars: 260 },
  budget: { maxTicks: 1600 },
  build,
  objectives: [
    Objectives.custom('reach-exit', 'Park the bot on the exit pad', (ctx) =>
      botEndsOn(ctx, Terrain.Pad),
    ),
  ],
  bonus: [
    Objectives.custom(
      'no-marks',
      'Get out without placing a single mark',
      (ctx) => markCount(ctx) === 0,
    ),
  ],
  starter: [
    '// One entrance, one exit, both in the outside wall.',
    '',
    'const here = pos();',
    'print(`${here.x},${here.y}`);',
    '',
  ].join('\n'),
  hints: [
    'Nothing in this grid loops. Every wall in it runs back to the outside wall, including the two the bot is standing between right now.',
    'You are not required to remember anywhere the bot has been. There is exactly one thing worth carrying between steps, and it is one number.',
    'The four directions are worth thinking about relative to the bot rather than to the map: the way it is pointing, and the two sides.',
    'If the bot always prefers the same side, the route stops being a decision. It becomes a consequence of the walls.',
  ],
  docs: ['look', 'coordinates'],
};
