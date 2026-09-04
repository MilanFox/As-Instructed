import type { ObjectiveContext, TraceEvent, World } from '../../engine/index.ts';
import { Terrain, tileAt } from '../../engine/index.ts';

/** Local generator seed. World 7 never consumes `world.rng`, so replays stay byte-identical. */
export function localSeed(seed: number): number {
  return seed * 7919 + 13;
}

/** Position packed into one number, the encoding every World 7 brief states in plain text. */
export function packPos(world: World, x: number, y: number): number {
  return y * world.w + x;
}

/** Every move the run attempted and lost a tick to. The World 7 bonus objectives count these. */
export function blockedMoves(events: readonly TraceEvent[]): number {
  return events.filter((event) => event.kind === 'move' && !event.ok).length;
}

/** Ticks a bot spent doing nothing: `wait` and `sync` both report their idle span as `dt`. */
export function idleTicks(events: readonly TraceEvent[], botIds: ReadonlySet<number>): number {
  let idle = 0;
  for (const event of events) {
    if (event.kind !== 'wait' && event.kind !== 'sync') continue;
    if (botIds.has(event.botId)) idle += event.dt;
  }
  return idle;
}

export function botsOnPads(ctx: ObjectiveContext): number {
  return ctx.world.bots.filter(
    (bot) => bot.alive && tileAt(ctx.world, bot.at)?.terrain === Terrain.Pad,
  ).length;
}

/** True when `botId` popped at least one message that another bot actually sent it. */
export function heardFromAnother(events: readonly TraceEvent[], botId: number): boolean {
  return events.some(
    (event) =>
      event.kind === 'recv' && event.botId === botId && event.from !== null && event.from !== botId,
  );
}
