import type { MoveEvent, Rng, Vec, World } from '../../engine/index.ts';
import { Objectives, Terrain, addBot, createWorld, setTerrain, tileAt } from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { carveTunnel, cellTile, paintCave } from './caves.ts';

const CELLS = 11;
const SIZE = 2 * CELLS + 1;

/** Path length in cells. 16..30 cells is 31..59 floor tiles, the length the curriculum asks for. */
function tunnelCells(rng: Rng): number {
  return rng.int(16, 30);
}

function build(seed: number): World {
  const world = createWorld({ w: SIZE, h: SIZE, seed, fill: Terrain.Rock });
  const rng = world.rng;
  const { grid, path } = carveTunnel(rng, CELLS, CELLS, tunnelCells(rng));
  paintCave(world, grid);

  const head = path[0] ?? { i: 0, j: 0 };
  const tail = path[path.length - 1] ?? head;
  setTerrain(world, cellTile(tail.i, tail.j), Terrain.Pad);
  addBot(world, { at: cellTile(head.i, head.j), name: 'RIG-04' });
  return world;
}

/** Every tile the bot stood on, in order, reconstructed from the trace. DESIGN.md §4.5. */
function standingTiles(start: Vec, events: readonly { kind: string }[]): Vec[] {
  const out: Vec[] = [start];
  for (const event of events) {
    if (event.kind !== 'move') continue;
    const move = event as MoveEvent;
    if (move.ok) out.push(move.to);
  }
  return out;
}

/**
 * A single tunnel with no branches and no cycles, so the only decision on each tile is "which way
 * is not the way I came from". Par is the longest seed's tunnel: the route is forced, the
 * reference walks it once, and there is nothing honest left to shave off.
 */
export const w4_01: LevelDef = {
  id: 'w4-01',
  world: 4,
  index: 1,
  title: 'Headlamp',
  hardware: ['look'],
  brief: [
    '```',
    'MEMO KD-2401',
    'FROM: Dep. Coordinator M. Vance',
    'RE:   Subsurface access',
    '',
    'The tunnels are not lit, not surveyed, and not, in the strict',
    'sense, ours. The Charter grants us surface rights. Legal advise',
    'that "surface" is defined in Appendix C.',
    '```',
    '',
    'There is one tunnel. It bends, it does not fork, and it ends on a marked pad.',
    'Drive the bot onto that pad.',
    '',
    '`look(dir)` casts a beam along a direction and returns the tiles it crosses, nearest',
    'first, stopping at the first thing it cannot see through. It costs nothing. The tunnel is',
    'a different shape every shift.',
    '',
    '### Memory',
    '',
    'Ordinary JavaScript values — objects, arrays, `Map`, `Set`, closures — hold their contents',
    'for the whole run. Nothing is cleared between moves.',
  ].join('\n'),
  seeds: [1, 2, 3],
  par: { ticks: 52, chars: 250 },
  build,
  objectives: [
    Objectives.custom('reach-tunnel-end', 'Park the bot on the pad at the far end', (ctx) => {
      const bot = ctx.world.bots[0];
      if (!bot || !bot.alive) return false;
      return tileAt(ctx.world, bot.at)?.terrain === Terrain.Pad;
    }),
  ],
  bonus: [
    Objectives.custom('single-pass', 'Reach the pad without entering a tile twice', (ctx) => {
      const bot = ctx.initialWorld.bots[0];
      if (!bot) return false;
      const tiles = standingTiles(bot.at, ctx.trace.events);
      return new Set(tiles.map((at) => `${at.x},${at.y}`)).size === tiles.length;
    }),
  ],
  starter: [
    '// look(dir, 1) returns a single tile view; look(dir) returns up to eight.',
    '',
    'const ahead = look(Dir.East, 1)[0];',
    'print(ahead ? ahead.terrain : "off the map");',
    '',
  ].join('\n'),
  hints: [
    'The bot cannot see the tunnel. It can see one tile in each of four directions, for free, as often as it likes.',
    'Standing anywhere in the middle of the tunnel there are exactly two openings, and you arrived through one of them.',
    'So you already know one direction you do not want. Hold on to it across the loop, rather than working it out again.',
    'The pad is the only tile in the tunnel that is not plain floor. Check what is under the bot before you decide to move again.',
  ],
  docs: ['look', 'coordinates'],
};
