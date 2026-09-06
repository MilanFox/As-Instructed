import type {
  Divergence,
  MoveEvent,
  ObjectiveContext,
  TraceEvent,
  Vec,
  World,
} from '../../engine/index.ts';
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

/** A coordinate, written the way the briefs and the fact tables write one. */
export function at(pos: Vec): string {
  return `(${String(pos.x)}, ${String(pos.y)})`;
}

/**
 * The lines the run filed under one report keyword, in the order it printed them.
 *
 * A fleet knows things the required objective never asks it to say — which bot was the long pole,
 * how much of the shift it stood still for. `print` is the channel for those, and a keyword is
 * what keeps a report separable from a player's own debugging output.
 */
export function reportedLines(events: readonly TraceEvent[], keyword: string): string[] {
  const prefix = `${keyword} `;
  return events
    .filter((event) => event.kind === 'print' && event.text.startsWith(prefix))
    .map((event) => (event.kind === 'print' ? event.text : ''));
}

/** How many leading entries of `actual` match `expected`. Every report's progress bar wants this. */
export function matchingPrefix(actual: readonly string[], expected: readonly string[]): number {
  let i = 0;
  while (i < actual.length && i < expected.length && actual[i] === expected[i]) i++;
  return i;
}

/** What the engine's own `reason` on a refused move means, in the words the briefs use. */
const BLOCKED_BY: Readonly<Record<string, string>> = Object.freeze({
  bot: 'another bot was already there',
  terrain: 'a wall',
  bounds: 'the edge of the site',
  dead: 'a bot that had stopped running',
});

/**
 * The bot, tick and tile of the first move the fleet lost to something already standing there.
 *
 * Two levels grade "no blocked moves" and neither of them has one bit to report: the trace holds
 * the tick, the tile and the engine's own reason, which is the difference between a fleet that
 * walked into a wall and a fleet that walked into itself.
 */
export function firstBump(events: readonly TraceEvent[]): Divergence | undefined {
  const bump = events.find((event): event is MoveEvent => event.kind === 'move' && !event.ok);
  if (bump === undefined) return undefined;
  return {
    where: `bot #${String(bump.botId)} · tick ${String(bump.t)}`,
    expected: `a clear tile at ${at(bump.to)}`,
    received: BLOCKED_BY[bump.reason ?? ''] ?? 'a tile it could not enter',
  };
}
