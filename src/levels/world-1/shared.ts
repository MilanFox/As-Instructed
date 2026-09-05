import type { Objective, ObjectiveContext, Vec, World } from '../../engine/index.ts';
import {
  Objectives,
  Terrain,
  botById,
  manhattan,
  senseTotals,
  terrainProps,
  tileAt,
} from '../../engine/index.ts';

/**
 * Objective helpers for worlds whose layout is drawn per seed.
 *
 * `Objectives.botAt(pad)` bakes a coordinate into the level definition, which only works while the
 * pad never moves. From w1-03 on the pad moves with the seed, so every objective here derives its
 * target from the world it is handed instead.
 */

const key = (at: Vec): string => `${at.x},${at.y}`;

export function walkableTiles(world: World): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i < world.tiles.length; i++) {
    const tile = world.tiles[i];
    if (tile && terrainProps(tile.terrain).walkable) {
      out.push({ x: i % world.w, y: Math.floor(i / world.w) });
    }
  }
  return out;
}

/** Every tile the bot stood on, its start tile included. */
export function visitedTiles(ctx: ObjectiveContext): Set<string> {
  const seen = new Set<string>();
  const start = ctx.initialWorld.bots[0];
  if (start) seen.add(key(start.at));
  for (const event of ctx.trace.events) {
    if (event.kind === 'move' && event.ok) seen.add(key(event.to));
  }
  return seen;
}

export function blockedMoves(ctx: ObjectiveContext): number {
  return ctx.trace.events.filter((event) => event.kind === 'move' && !event.ok).length;
}

/** Bot #0 finished the run parked on the level's landing pad, wherever the seed put it. */
export function parkedOnPad(label = 'Park the bot on the landing pad'): Objective {
  return Objectives.custom('reach-pad', label, (ctx) => {
    const bot = botById(ctx.world, 0);
    if (!bot?.alive) return false;
    return tileAt(ctx.world, bot.at)?.terrain === Terrain.Pad;
  });
}

/** Every walkable tile in the bay was entered at least once. */
export function inspectedEveryTile(label = 'Enter every floor tile in the bay'): Objective {
  const total = (ctx: ObjectiveContext): Vec[] => walkableTiles(ctx.initialWorld);
  const done = (ctx: ObjectiveContext): number => {
    const seen = visitedTiles(ctx);
    return total(ctx).filter((at) => seen.has(key(at))).length;
  };
  return Objectives.custom(
    'inspect-all',
    label,
    (ctx) => done(ctx) === total(ctx).length,
    (ctx) => [done(ctx), total(ctx).length],
  );
}

/** Bonus: nothing was driven into. A blocked move costs a tick (DESIGN.md §4.4). */
export function noBlockedMoves(label = 'Finish without a single blocked move'): Objective {
  return Objectives.custom('no-blocked-moves', label, (ctx) => blockedMoves(ctx) === 0);
}

/** Where the seed put the landing pad, or undefined on a level that has none. */
export function padPosition(world: World): Vec | undefined {
  for (let i = 0; i < world.tiles.length; i++) {
    if (world.tiles[i]?.terrain === Terrain.Pad) {
      return { x: i % world.w, y: Math.floor(i / world.w) };
    }
  }
  return undefined;
}

/** Ticks the run spent on top of the shortest route from the start tile to the pad. */
export function wastedTicks(ctx: ObjectiveContext): number {
  const start = ctx.initialWorld.bots[0];
  const pad = padPosition(ctx.initialWorld);
  if (!start || !pad) return ctx.trace.endTick;
  return ctx.trace.endTick - manhattan(start.at, pad);
}

/**
 * Bonus: the corridor surveyed on a rationed instrument, without the wall collecting the difference.
 *
 * `reads` caps `canMove`; `waste` caps the ticks spent beyond the shortest route, which is measured
 * from the seed's own pad rather than declared. Asking before every tile fills the log on the first
 * eight tiles of any shift; driving blind hands the far wall every tile the corridor turned out not
 * to have. What fits between the two is a stride — one reading, then several steps taken on it.
 *
 * The id is the shape `Objectives.withinSenses` mints, so the objective rail reads the run's real
 * `canMove` total back out of the trace instead of the clamped one.
 */
export function rationedSurvey(reads: number, waste: number, label: string): Objective {
  const used = (ctx: ObjectiveContext): number => senseTotals(ctx.trace)['canMove'] ?? 0;
  return Objectives.custom(
    `within-${String(reads)}-canMove`,
    label,
    (ctx) => used(ctx) <= reads && wastedTicks(ctx) <= waste,
    (ctx) => [Math.min(used(ctx), reads), reads],
  );
}

/** Every move the run issued, the ones that went nowhere included. */
export function movesIssued(ctx: ObjectiveContext): number {
  return ctx.trace.events.filter((event) => event.kind === 'move').length;
}

/**
 * Bonus: the whole bay covered on no more than one move per floor tile.
 *
 * A sweep that enters every tile once spends `tiles - 1` moves, so the budget leaves exactly one
 * move spare: enough for the single re-entry a west half with an even number of rows *and* columns
 * cannot avoid, and nowhere near enough to drive back along a row that was already inspected. A
 * blocked move counts, because it was still filed.
 */
export function oneMovePerFloorTile(label: string): Objective {
  const budget = (ctx: ObjectiveContext): number => walkableTiles(ctx.initialWorld).length;
  return Objectives.custom(
    'one-move-per-tile',
    label,
    (ctx) => movesIssued(ctx) <= budget(ctx),
    (ctx) => [Math.min(movesIssued(ctx), budget(ctx)), budget(ctx)],
  );
}

/** Bonus: the run took exactly the Manhattan distance from start to pad — not one tick more. */
export function shortestRoute(label = 'Arrive in the fewest possible ticks'): Objective {
  return Objectives.custom('shortest-route', label, (ctx) => {
    const start = ctx.initialWorld.bots[0];
    const bot = botById(ctx.world, 0);
    if (!start || !bot?.alive) return false;
    if (tileAt(ctx.world, bot.at)?.terrain !== Terrain.Pad) return false;
    return ctx.trace.endTick === manhattan(start.at, bot.at);
  });
}
