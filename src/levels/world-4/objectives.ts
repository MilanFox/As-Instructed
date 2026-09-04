import type { ObjectiveContext, Terrain, TraceEvent, Vec, World } from '../../engine/index.ts';
import { FUEL_BURNING, tileAt } from '../../engine/index.ts';
import { keyOf } from './caves.ts';

/**
 * Objective helpers shared by World 4. Every level here randomizes the position of its goal, so
 * `Objectives.botAt(fixedVec)` cannot be used: the objectives locate their targets by terrain in
 * `ctx.initialWorld` instead, which is the same thing expressed once per seed.
 */

/** Tiles with the given terrain in a world, in row-major order. */
export function tilesWithTerrain(world: World, terrain: Terrain): Vec[] {
  const out: Vec[] = [];
  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      if (tileAt(world, { x, y })?.terrain === terrain) out.push({ x, y });
    }
  }
  return out;
}

/** Every tile the bot stood on, in visit order, reconstructed from the trace. DESIGN.md §4.5. */
export function standingTiles(ctx: ObjectiveContext, botId = 0): Vec[] {
  const bot = ctx.initialWorld.bots.find((b) => b.id === botId);
  const out: Vec[] = bot ? [{ x: bot.at.x, y: bot.at.y }] : [];
  for (const event of ctx.trace.events) {
    if (event.kind !== 'move' || event.botId !== botId || !event.ok) continue;
    out.push(event.to);
  }
  return out;
}

export function standingKeys(ctx: ObjectiveContext, botId = 0): Set<string> {
  return new Set(standingTiles(ctx, botId).map(keyOf));
}

/** The tick at which the bot first stood on `at`, or Infinity if it never did. */
export function firstVisitOrder(ctx: ObjectiveContext, targets: readonly Vec[]): Vec[] {
  const wanted = new Map(targets.map((at) => [keyOf(at), at]));
  const order: Vec[] = [];
  for (const at of standingTiles(ctx)) {
    const hit = wanted.get(keyOf(at));
    if (hit === undefined) continue;
    wanted.delete(keyOf(at));
    order.push(hit);
  }
  return order;
}

export function markCount(ctx: ObjectiveContext, botId = 0): number {
  return ctx.trace.events.filter(
    (event: TraceEvent) => event.kind === 'mark' && event.botId === botId,
  ).length;
}

/** Total fuel burned across the run. Mirrors the ledger `Sim.charge` keeps. DESIGN.md §11 A1. */
export function fuelBurned(ctx: ObjectiveContext, botId = 0): number {
  let burned = 0;
  for (const event of ctx.trace.events) {
    if (!FUEL_BURNING.has(event.kind)) continue;
    if ('botId' in event && event.botId === botId && 'dt' in event) burned += event.dt;
  }
  return burned;
}

export function botEndsOn(ctx: ObjectiveContext, terrain: Terrain, botId = 0): boolean {
  const bot = ctx.world.bots.find((b) => b.id === botId);
  if (!bot || !bot.alive) return false;
  return tileAt(ctx.world, bot.at)?.terrain === terrain;
}
