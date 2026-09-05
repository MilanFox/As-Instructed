import type { ObjectiveContext, Vec, World } from '../../engine/index.ts';
import {
  Dir,
  Objectives,
  Terrain,
  addBot,
  addGroundItems,
  countItemsAt,
  createWorld,
  setTile,
  vec,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { frame, warm } from './yard.ts';

const PAR_TICKS = 157;

const WEST_SIDING: readonly Vec[] = [
  vec(1, 1),
  vec(1, 2),
  vec(1, 3),
  vec(2, 1),
  vec(2, 2),
  vec(2, 3),
];

const EAST_PADS: readonly Vec[] = [
  vec(11, 1),
  vec(11, 2),
  vec(11, 3),
  vec(12, 1),
  vec(12, 2),
  vec(12, 3),
];

const pads = (world: World): Vec[] => {
  const out: Vec[] = [];
  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      if (world.tiles[y * world.w + x]?.terrain === Terrain.Pad) out.push(vec(x, y));
    }
  }
  return out;
};

const loadedPads = (ctx: ObjectiveContext): number =>
  pads(ctx.initialWorld).filter((at) => countItemsAt(ctx.world, at, 'crate') > 0).length;

const failedPickups = (ctx: ObjectiveContext): number =>
  ctx.trace.events.filter((event) => event.kind === 'pickup' && !event.ok).length;

/**
 * The whole level is one clamp and two sidings. Capacity is 1, so the obvious "load everything,
 * then unload everything" shape burns a tick per crate on a pickup that takes nothing — which is
 * visible in the trace as a run of failed pickups, and is the only thing this level teaches.
 */
export const w3_01: LevelDef = {
  id: 'w3-01',
  world: 3,
  index: 1,
  title: 'Pick and Place',
  hardware: ['pickup', 'drop'],
  brief: [
    '**FROM:** Field Engineer D. Halloran',
    '',
    'the arm on RIG-04 has one clamp. the log still shows you tried for a second.',
    '',
    'Every pad on the east side of the shed must end the shift holding at least one crate.',
    'There are exactly as many pads as there are crates, and both move between shifts.',
    '`pickup()` takes what is lying on the tile the bot is standing on. `drop()` puts it back',
    'down on the tile the bot is standing on. A `pickup()` on a full bot takes nothing and',
    'still costs a tick.',
  ].join('\n'),
  seeds: [1, 2, 3],
  par: { ticks: PAR_TICKS, chars: 1100 },
  build(seed: number): World {
    const world = createWorld({ w: 14, h: 5, seed, fill: Terrain.Floor });
    frame(world);
    const rng = world.rng;
    warm(rng);
    const count = rng.int(3, 6);
    for (const at of rng.shuffle(WEST_SIDING).slice(0, count)) {
      addGroundItems(world, at, 'crate', 1);
    }
    for (const at of rng.shuffle(EAST_PADS).slice(0, count)) {
      setTile(world, at, { terrain: Terrain.Pad });
    }
    addBot(world, { at: vec(6, rng.int(1, 3)), facing: Dir.East, name: 'RIG-04', capacity: 1 });
    return world;
  },
  objectives: [
    Objectives.custom(
      'pads-loaded',
      'Leave a crate on every pad',
      (ctx) => loadedPads(ctx) === pads(ctx.initialWorld).length,
      (ctx) => [loadedPads(ctx), pads(ctx.initialWorld).length],
    ),
  ],
  bonus: [
    Objectives.custom(
      'clean-run',
      'Finish within par with no failed pickup',
      (ctx) => ctx.trace.endTick <= PAR_TICKS && failedPickups(ctx) === 0,
      (ctx) => [failedPickups(ctx) === 0 ? 1 : 0, 1],
    ),
  ],
  budget: { maxTicks: 2500 },
  starter: [
    '// The crates are on the west siding. The pads are on the east side.',
    '',
    'while (canMove(Dir.West)) move(Dir.West);',
    '',
  ].join('\n'),
  hints: [
    'The bot has one clamp. Work out what it is holding before you ask it to hold something else.',
    'A pickup that takes nothing still costs a tick, and it shows up in the trace as a failure.',
    'How many crates can one trip across the shed actually move?',
    'The crate rows and the pad rows are not the same rows, and they change between shifts.',
  ],
  docs: ['pickup', 'drop'],
};
