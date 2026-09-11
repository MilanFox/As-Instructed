import type {
  DieEvent,
  Divergence,
  ObjectiveContext,
  Terrain,
  Vec,
  World,
} from '../../engine/index.ts';
import { NOTHING, tileAt } from '../../engine/index.ts';
import { keyOf } from './caves.ts';

export function tilesWithTerrain(world: World, terrain: Terrain): Vec[] {
  const out: Vec[] = [];
  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      if (tileAt(world, { x, y })?.terrain === terrain) out.push({ x, y });
    }
  }
  return out;
}

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

export function botEndsOn(ctx: ObjectiveContext, terrain: Terrain, botId = 0): boolean {
  const bot = ctx.world.bots.find((b) => b.id === botId);
  if (!bot || !bot.alive) return false;
  return tileAt(ctx.world, bot.at)?.terrain === terrain;
}

export function at(pos: Vec): string {
  return `(${String(pos.x)}, ${String(pos.y)})`;
}

export function endedOn(
  ctx: ObjectiveContext,
  terrain: Terrain,
  botId = 0,
): Divergence | undefined {
  const target = tilesWithTerrain(ctx.initialWorld, terrain)[0];
  if (target === undefined) return undefined;
  const bot = ctx.world.bots.find((b) => b.id === botId);
  if (bot === undefined) return { where: 'end of run', expected: at(target), received: NOTHING };
  return {
    where: 'end of run',
    expected: at(target),
    received: bot.alive ? at(bot.at) : `${at(bot.at)}, and not running`,
  };
}

export function died(ctx: ObjectiveContext, botId = 0): Divergence | undefined {
  const death = ctx.trace.events.find(
    (event): event is DieEvent => event.kind === 'die' && event.botId === botId,
  );
  if (death === undefined) return undefined;
  return {
    where: `tick ${String(death.t)} · ${at(death.at)}`,
    expected: 'the bot still running',
    received: death.reason,
  };
}
