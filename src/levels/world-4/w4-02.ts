import type { Divergence, ObjectiveContext, Vec, World } from '../../engine/index.ts';
import {
  ALL_DIRS,
  NOTHING,
  Objectives,
  Terrain,
  addBot,
  clipValue,
  createWorld,
  setTerrain,
  step,
  terrainProps,
  tileAt,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import type { Cell } from './caves.ts';
import {
  addCycles,
  carvePerfectMaze,
  cellTile,
  deadEndCells,
  distancesFrom,
  keyOf,
  paintCave,
} from './caves.ts';
import { at, botEndsOn, endedOn, tilesWithTerrain } from './objectives.ts';

const CELLS = 9;
const SIZE = 20;

/**
 * How many extra connectors get knocked through the spanning tree, and therefore exactly how many
 * loops the cave contains. Zero is in the list on purpose: seed 4 is a plain tree with no loop
 * anywhere in it, so the machinery a player writes for loops is never exercised and they get to
 * find out that breadcrumbs were insurance rather than ceremony.
 */
const CYCLE_CHOICES = [0, 2, 3, 4] as const;

function build(seed: number): World {
  const world = createWorld({ w: SIZE, h: SIZE, seed, fill: Terrain.Rock });
  const rng = world.rng;
  const grid = carvePerfectMaze(rng, CELLS, CELLS);
  addCycles(rng, grid, rng.pick(CYCLE_CHOICES));
  paintCave(world, grid);

  const ends = deadEndCells(grid);
  const startCell: Cell = ends.length > 0 ? rng.pick(ends) : { i: 0, j: 0 };
  const start = cellTile(startCell.i, startCell.j);

  const distances = distancesFrom(world, start);
  const candidates = (ends.length > 1 ? ends : [{ i: CELLS - 1, j: CELLS - 1 }])
    .map((cell) => cellTile(cell.i, cell.j))
    .filter((at) => at.x !== start.x || at.y !== start.y);
  const vein = candidates.reduce<Vec>(
    (best, at) => ((distances.get(keyOf(at)) ?? 0) > (distances.get(keyOf(best)) ?? 0) ? at : best),
    candidates[0] ?? start,
  );

  setTerrain(world, vein, Terrain.Pad);
  addBot(world, { at: start, name: 'RIG-04' });
  return world;
}

/** `"12,7"` split back into the tile it names, or null when the breadcrumb is not one. */
function crumbTarget(text: string | undefined): Vec | null {
  if (text === undefined) return null;
  const parts = text.split(',');
  if (parts.length !== 2) return null;
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  return { x, y };
}

const walkableAt = (world: World, where: Vec): boolean => {
  const tile = tileAt(world, where);
  return tile !== undefined && terrainProps(tile.terrain).walkable;
};

interface TrailWalk {
  ok: boolean;
  /** The tile the trail died on, when it did. */
  stuckAt?: Vec;
  /** What that tile was carrying, so the report shows the run its own breadcrumb. */
  crumb?: string;
}

/**
 * Follows one chain of breadcrumbs back from `from`, and says where it stops leading anywhere.
 *
 * A crumb is legible only if it names an orthogonal neighbour that can be stood on and that has
 * not already been passed through — otherwise a bot reading it is worse off than one reading
 * nothing, which is the failure the report has to be able to name.
 */
function followTrail(world: World, from: Vec, home: Vec): TrailWalk {
  const seen = new Set<string>([keyOf(from)]);
  let here = from;
  for (let guard = 0; guard <= world.tiles.length; guard++) {
    if (here.x === home.x && here.y === home.y) return { ok: true };
    const crumb = tileAt(world, here)?.mark;
    const next = crumbTarget(crumb);
    const legible =
      next !== null &&
      Math.abs(next.x - here.x) + Math.abs(next.y - here.y) === 1 &&
      walkableAt(world, next) &&
      !seen.has(keyOf(next));
    if (!legible) {
      return crumb === undefined
        ? { ok: false, stuckAt: here }
        : { ok: false, stuckAt: here, crumb };
    }
    seen.add(keyOf(next));
    here = next;
  }
  return { ok: false, stuckAt: here };
}

const veinAndStart = (world: World): { vein: Vec; home: Vec } | null => {
  const vein = tilesWithTerrain(world, Terrain.Pad)[0];
  const home = world.bots[0]?.at;
  return vein === undefined || home === undefined ? null : { vein, home };
};

/**
 * Whether a bot standing on the vein could get home on the breadcrumbs alone.
 *
 * It starts from a *neighbour* of the vein rather than from the vein itself: arriving is the
 * required objective's business, and charging the star one more tick for a crumb under the bot's
 * own feet would price the star against the medal on the seed the reference runs at par.
 */
function trailHome(ctx: ObjectiveContext): TrailWalk {
  const ends = veinAndStart(ctx.initialWorld);
  if (ends === null) return { ok: false };
  let best: TrailWalk | null = null;
  for (const dir of ALL_DIRS) {
    const neighbour = step(ends.vein, dir);
    if (!walkableAt(ctx.world, neighbour)) continue;
    if (tileAt(ctx.world, neighbour)?.mark === undefined) continue;
    const walk = followTrail(ctx.world, neighbour, ends.home);
    if (walk.ok) return walk;
    best ??= walk;
  }
  return best ?? { ok: false, stuckAt: ends.vein };
}

/**
 * The point at which the trail stopped being a trail.
 *
 * It gives back the run's own breadcrumb and the tile it was written on — never the tile the bot
 * actually arrived from, which is the whole of what the star is asking the program to keep.
 */
const trailBroke = (ctx: ObjectiveContext): Divergence | undefined => {
  const walk = trailHome(ctx);
  const stuck = walk.stuckAt;
  if (stuck === undefined) return undefined;
  const ends = veinAndStart(ctx.initialWorld);
  if (ends !== null && stuck.x === ends.vein.x && stuck.y === ends.vein.y) {
    return { where: at(stuck), expected: 'a breadcrumb beside it', received: NOTHING };
  }
  return {
    where: at(stuck),
    expected: 'the tile the bot arrived from',
    received: walk.crumb === undefined ? NOTHING : clipValue(walk.crumb),
  };
};

/**
 * The cave loops. The rule that carried w4-01 — never step back the way you came — becomes a
 * closed circuit here, and the replay shows the bot riding it until the shift ends. What breaks
 * the circuit is knowing which tiles have already been stood on.
 */
export const w4_02: LevelDef = {
  id: 'w4-02',
  world: 4,
  index: 2,
  title: 'Breadcrumbs',
  hardware: ['mark', 'readMark'],
  brief: [
    '> dot: survey have a map of this one. it is a photograph of a whiteboard, and',
    '> the whiteboard has since been cleaned.',
    '',
    'Reach the ore vein.',
  ].join('\n'),
  facts: [
    {
      label: 'The cave',
      value:
        'It forks. On most shifts some of the forks rejoin further in, so a passage can hand the bot back to a junction it has already stood at.',
    },
    {
      label: 'The ore vein',
      value: 'The one pad tile in the cave, set into the rock at the vein face.',
    },
    {
      label: '`mark(text)`',
      value: 'Writes a **string** onto the tile under the bot. Costs 1 tick.',
    },
    { label: '`readMark()`', value: 'Returns the string under the bot. Free.' },
    {
      label: 'Neighbours',
      value:
        "A tile's mark also shows up in what `look` returns, so you can check one without stepping on it.",
    },
    {
      label: 'A trail home',
      value:
        'For the star: every breadcrumb names the tile the bot arrived from, as `"x,y"`, so that following them from beside the vein arrives back at the start.',
    },
  ],
  seeds: [1, 2, 3, 4],
  par: { ticks: 391 },
  budget: { maxTicks: 1600 },
  build,
  objectives: [
    Objectives.custom(
      'reach-vein',
      'Park the bot on the ore vein',
      (ctx) => botEndsOn(ctx, Terrain.Pad),
      { divergence: (ctx) => endedOn(ctx, Terrain.Pad) },
    ),
  ],
  bonus: [
    /*
     * The budget this replaced counted breadcrumbs and asked for fewer, which paid a star for
     * leaving the issued hardware in the crate: a program that keeps its visited set in an
     * ordinary `Set` — legitimate, and DESIGN.md §5 says so in as many words — walks the
     * identical route, places zero, and took the star for free.
     *
     * A trail is the half of the mechanic a `Set` cannot stand in for. A closure goes home with
     * the bot; a breadcrumb stays in the cave and can be read by something that did not write it.
     */
    Objectives.custom(
      'breadcrumb-trail',
      'Leave breadcrumbs a bot at the vein could follow home',
      (ctx) => trailHome(ctx).ok,
      { divergence: trailBroke },
    ),
  ],
  starter: [
    '// NOTE(4470): the tunnel joins back onto itself. more than once',
    '// NOTE(4470): the junctions all look the same from inside',
    '',
    '// mark() writes on the tile under the bot. look() reports a neighbour mark.',
    'mark("start");',
    'print(readMark());',
    '',
  ].join('\n'),
  hints: [
    'The bot is not lost because it cannot see. It is lost because two junctions look identical from inside.',
    'Something has to be different about a tile you have already stood on. Either the tile changes, or your program remembers it did.',
    'Once every opening out of a tile leads somewhere already accounted for, the tile is finished and the only useful move is backwards.',
    'Backwards is a specific direction, not a general idea. Keep the ones you would need, in order, and the way out is the reverse of the way in.',
    'A breadcrumb can say more than "somebody was here". If it says where that somebody came from, the crumbs are a route and not just a record.',
  ],
  docs: ['mark', 'look', 'memory'],
};
