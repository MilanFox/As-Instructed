import type {
  Divergence,
  MoveEvent,
  ObjectiveContext,
  TraceEvent,
  Vec,
  World,
} from '../../engine/index.ts';
import { Terrain, tileAt } from '../../engine/index.ts';

export function localSeed(seed: number): number {
  return seed * 7919 + 13;
}

export function packPos(world: World, x: number, y: number): number {
  return y * world.w + x;
}

export function blockedMoves(events: readonly TraceEvent[]): number {
  return events.filter((event) => event.kind === 'move' && !event.ok).length;
}

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

export function heardFromAnother(events: readonly TraceEvent[], botId: number): boolean {
  return events.some(
    (event) =>
      event.kind === 'recv' && event.botId === botId && event.from !== null && event.from !== botId,
  );
}

export function at(pos: Vec): string {
  return `(${String(pos.x)}, ${String(pos.y)})`;
}

export function reportedLines(events: readonly TraceEvent[], keyword: string): string[] {
  const prefix = `${keyword} `;
  return events
    .filter((event) => event.kind === 'print' && event.text.startsWith(prefix))
    .map((event) => (event.kind === 'print' ? event.text : ''));
}

export function matchingPrefix(actual: readonly string[], expected: readonly string[]): number {
  let i = 0;
  while (i < actual.length && i < expected.length && actual[i] === expected[i]) i++;
  return i;
}

const BLOCKED_BY: Readonly<Record<string, string>> = Object.freeze({
  bot: 'another bot was already there',
  terrain: 'a wall',
  bounds: 'the edge of the site',
  dead: 'a bot that had stopped running',
});

export function firstBump(events: readonly TraceEvent[]): Divergence | undefined {
  const bump = events.find((event): event is MoveEvent => event.kind === 'move' && !event.ok);
  if (bump === undefined) return undefined;
  return {
    where: `bot #${String(bump.botId)} · tick ${String(bump.t)}`,
    expected: `a clear tile at ${at(bump.to)}`,
    received: BLOCKED_BY[bump.reason ?? ''] ?? 'a tile it could not enter',
  };
}
