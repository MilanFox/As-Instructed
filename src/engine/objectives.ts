import type { PrintEvent, Trace } from './trace.ts';
import { senseTotals } from './trace.ts';
import type { ItemKind, Machine, Tile, Vec, World } from './types.ts';
import { botById, countItemsAt, eq, inventoryCount, machineById, tileAt } from './world.ts';

/** Everything an objective is allowed to look at. Objectives must be pure. */
export interface ObjectiveContext {
  /** The world as the player's program left it. */
  world: World;
  trace: Trace;
  /** The world as `LevelDef.build(seed)` produced it, before a single command ran. */
  initialWorld: World;
  /** Ops the run consumed. `buildVerdict` always supplies it; `withinOps` reads nothing else. */
  ops?: number;
  /**
   * Sensing reads per command name. `buildVerdict` supplies it; when absent, `withinSenses` falls
   * back to counting the trace, which is exact for the same reason `Verdict.stats.senses` is.
   */
  senses?: Record<string, number>;
}

/**
 * The first concrete point at which what an objective wanted and what the run did parted company.
 *
 * `docs/PLAYTEST-BEGINNER.md` §3: a manifest level that grades printed text answered four
 * plausible lines and an empty program with the identical `0 of 5 — 5 short`. A count says an
 * objective was missed; it never says where, so the only move left is to guess, and the level's
 * lesson is lost to brute force. This is the number the count throws away.
 *
 * Three rules hold it to being feedback rather than an answer key:
 *
 *  - **First divergence only.** Not every mismatch, not a full expected/actual dump. One point.
 *  - **`expected` describes that one point**, in the objective's own unit — one line, one cell,
 *    one tick — never the whole target.
 *  - **`received` is the run's own value there**, so what a player reads back is mostly their
 *    own output. An objective with nothing to compare simply does not implement `divergence`.
 */
export interface Divergence {
  /** The objective's own unit for "where": `line 3`, `tick 12`, `(4, 6)`, `sub-5 · tick 74`. */
  where: string;
  /** What that one point should have held. */
  expected: string;
  /** What it held instead. */
  received: string;
}

/** One objective as the verdict reports it. */
export interface ObjectiveReport {
  id: string;
  label: string;
  met: boolean;
  /** `[done, total]` for a "7/12" readout. Absent when the objective is binary. */
  progress?: [number, number];
  /** Only ever present on an unmet objective that opted into reporting one. */
  divergence?: Divergence;
}

export interface Objective {
  /** Stable across edits — it is a save key and a trace event id. */
  id: string;
  /** One short imperative line shown in the objectives panel. */
  label: string;
  evaluate(ctx: ObjectiveContext): boolean;
  /** `[done, total]` for a "7/12" readout. Omit when the objective is binary. */
  progress?(ctx: ObjectiveContext): [number, number];
  /**
   * Opt-in. Asked only after `evaluate` returned false, and free to return `undefined` when this
   * particular failure has no single point to name.
   */
  divergence?(ctx: ObjectiveContext): Divergence | undefined;
}

export interface ObjectiveOptions {
  id?: string;
  label?: string;
}

/** How long a value may run in a divergence before it is cut. Two of these fit one report row. */
export const DIVERGENCE_VALUE_CHARS = 44;

/** Long values are cut rather than wrapped: a diff that reflows is not a diff any more. */
export function clipValue(value: string, max = DIVERGENCE_VALUE_CHARS): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/** What `received` says when the run produced nothing at all at the point that diverged. */
export const NOTHING = '(nothing)';

export type Comparison = '==' | '!=' | '>=' | '<=' | '>' | '<';

export function compare(actual: number, op: Comparison, expected: number): boolean {
  switch (op) {
    case '==':
      return actual === expected;
    case '!=':
      return actual !== expected;
    case '>=':
      return actual >= expected;
    case '<=':
      return actual <= expected;
    case '>':
      return actual > expected;
    case '<':
      return actual < expected;
  }
}

function define(
  fallbackId: string,
  fallbackLabel: string,
  options: ObjectiveOptions | undefined,
  evaluate: (ctx: ObjectiveContext) => boolean,
  progress?: (ctx: ObjectiveContext) => [number, number],
  divergence?: (ctx: ObjectiveContext) => Divergence | undefined,
): Objective {
  const objective: Objective = {
    id: options?.id ?? fallbackId,
    label: options?.label ?? fallbackLabel,
    evaluate,
  };
  if (progress) objective.progress = progress;
  if (divergence) objective.divergence = divergence;
  return objective;
}

const at = (pos: Vec): string => `${pos.x},${pos.y}`;

/** The named bot (default #0) finished standing on `pos`. */
export function botAt(pos: Vec, options?: ObjectiveOptions & { botId?: number }): Objective {
  const botId = options?.botId ?? 0;
  return define(
    `bot-at-${at(pos)}`,
    `Park bot #${botId} on (${pos.x}, ${pos.y})`,
    options,
    (ctx) => {
      const bot = botById(ctx.world, botId);
      return bot !== undefined && bot.alive && eq(bot.at, pos);
    },
    undefined,
    (ctx) => {
      const bot = botById(ctx.world, botId);
      if (bot === undefined) return undefined;
      return {
        where: 'end of run',
        expected: `(${pos.x}, ${pos.y})`,
        received: bot.alive ? `(${bot.at.x}, ${bot.at.y})` : `dead at (${bot.at.x}, ${bot.at.y})`,
      };
    },
  );
}

/** Every tile in the world satisfies `pred`. Progress counts how many already do. */
export function allTilesAre(
  pred: (tile: Tile, pos: Vec) => boolean,
  options?: ObjectiveOptions,
): Objective {
  const count = (world: World): number => {
    let done = 0;
    for (let i = 0; i < world.tiles.length; i++) {
      const tile = world.tiles[i] as Tile;
      if (pred(tile, { x: i % world.w, y: Math.floor(i / world.w) })) done++;
    }
    return done;
  };
  return define(
    'all-tiles-are',
    'Bring every tile to spec',
    options,
    (ctx) => count(ctx.world) === ctx.world.tiles.length,
    (ctx) => [count(ctx.world), ctx.world.tiles.length],
  );
}

/** The number of tiles matching `pred` compares as specified against `n`. */
export function tileCount(
  pred: (tile: Tile, pos: Vec) => boolean,
  op: Comparison,
  n: number,
  options?: ObjectiveOptions,
): Objective {
  const count = (world: World): number => {
    let hits = 0;
    for (let i = 0; i < world.tiles.length; i++) {
      const tile = world.tiles[i] as Tile;
      if (pred(tile, { x: i % world.w, y: Math.floor(i / world.w) })) hits++;
    }
    return hits;
  };
  return define(
    `tile-count-${op}-${n}`,
    `Tiles matching the spec ${op} ${n}`,
    options,
    (ctx) => compare(count(ctx.world), op, n),
    (ctx) => [Math.min(count(ctx.world), n), n],
  );
}

/** A bot ends the run holding at least `n` of `kind`. */
export function inventoryAtLeast(
  kind: ItemKind,
  n: number,
  options?: ObjectiveOptions & { botId?: number },
): Objective {
  const botId = options?.botId ?? 0;
  const held = (world: World): number => {
    const bot = botById(world, botId);
    return bot ? inventoryCount(bot, kind) : 0;
  };
  return define(
    `inventory-${kind}-${n}`,
    `Carry ${n} ${kind}`,
    options,
    (ctx) => held(ctx.world) >= n,
    (ctx) => [Math.min(held(ctx.world), n), n],
  );
}

export function machineState(id: string, state: string, options?: ObjectiveOptions): Objective {
  return define(
    `machine-${id}-${state}`,
    `Leave ${id} ${state}`,
    options,
    (ctx) => machineById(ctx.world, id)?.state === state,
    undefined,
    (ctx) => {
      const machine = machineById(ctx.world, id);
      return {
        where: id,
        expected: state,
        received: machine ? machine.state : NOTHING,
      };
    },
  );
}

/** At least `n` items of `kind` are sitting on the ground at `at`. */
export function itemsDelivered(
  kind: ItemKind,
  n: number,
  where: Vec,
  options?: ObjectiveOptions,
): Objective {
  const delivered = (world: World): number => countItemsAt(world, where, kind);
  return define(
    `delivered-${kind}-${at(where)}`,
    `Deliver ${n} ${kind} to (${where.x}, ${where.y})`,
    options,
    (ctx) => delivered(ctx.world) >= n,
    (ctx) => [Math.min(delivered(ctx.world), n), n],
  );
}

/**
 * The program's `print` output equals `expected`, in order, with nothing extra.
 *
 * The `divergence` is a real one-line diff, and it is the whole reason this builder is worth
 * having over a hand-rolled `custom`: a run that printed four plausible lines and a run that
 * printed nothing used to be told the same thing. It names the first line that differs and shows
 * both halves of it — never the lines after, so the level is still the level.
 */
export function printedSequence(
  expected: readonly string[],
  options?: ObjectiveOptions,
): Objective {
  const printed = (trace: Trace): string[] =>
    trace.events.filter((e): e is PrintEvent => e.kind === 'print').map((e) => e.text);
  const matching = (trace: Trace): number => {
    const actual = printed(trace);
    let i = 0;
    while (i < expected.length && i < actual.length && actual[i] === expected[i]) i++;
    return i;
  };
  return define(
    'printed-sequence',
    `Report ${expected.length} lines, in order`,
    options,
    (ctx) => {
      const actual = printed(ctx.trace);
      return actual.length === expected.length && matching(ctx.trace) === expected.length;
    },
    (ctx) => [matching(ctx.trace), expected.length],
    (ctx) => {
      const actual = printed(ctx.trace);
      const i = matching(ctx.trace);
      if (i >= expected.length && i >= actual.length) return undefined;
      const want = expected[i];
      const got = actual[i];
      return {
        where: `line ${String(i + 1)}`,
        expected: want === undefined ? NOTHING : clipValue(want),
        received: got === undefined ? NOTHING : clipValue(got),
      };
    },
  );
}

/** The whole run finished within `n` ticks (makespan). Usually used as a bonus objective. */
export function withinTicks(n: number, options?: ObjectiveOptions): Objective {
  return define(
    `within-${n}-ticks`,
    `Finish within ${n} ticks`,
    options,
    (ctx) => ctx.trace.endTick <= n,
    (ctx) => [Math.min(ctx.trace.endTick, n), n],
  );
}

/**
 * The run called `name` (a sensing command: 'probe', 'scan', 'look', …) at most `n` times.
 *
 * The information budget, and the third scoring axis after ticks and characters. Sensing is still
 * free in ticks — this only makes it *countable*, so a level can ask for the answer in ten probes
 * rather than a hundred. `progress()` reports "7 / 10" so the cost is visible while playing.
 */
export function withinSenses(name: string, n: number, options?: ObjectiveOptions): Objective {
  const used = (ctx: ObjectiveContext): number =>
    ctx.senses?.[name] ?? senseTotals(ctx.trace)[name] ?? 0;
  return define(
    `within-${n}-${name}`,
    `Use ${name} at most ${n} times`,
    options,
    (ctx) => used(ctx) <= n,
    (ctx) => [Math.min(used(ctx), n), n],
  );
}

/** The whole run finished within `n` operations — every command, sensing included. */
export function withinOps(n: number, options?: ObjectiveOptions): Objective {
  const used = (ctx: ObjectiveContext): number => ctx.ops ?? 0;
  return define(
    `within-${n}-ops`,
    `Finish within ${n} operations`,
    options,
    (ctx) => used(ctx) <= n,
    (ctx) => [Math.min(used(ctx), n), n],
  );
}

/** Escape hatch. Prefer a named builder when one fits — the UI reads `label`, not the code. */
export function custom(
  id: string,
  label: string,
  fn: (ctx: ObjectiveContext) => boolean,
  progress?: (ctx: ObjectiveContext) => [number, number],
  divergence?: (ctx: ObjectiveContext) => Divergence | undefined,
): Objective {
  return define(id, label, { id, label }, fn, progress, divergence);
}

/** Convenience for `allTilesAre` / `tileCount` predicates. */
export function hasTerrain(terrain: Tile['terrain']): (tile: Tile) => boolean {
  return (tile) => tile.terrain === terrain;
}

export function machinesAllIn(state: string, options?: ObjectiveOptions): Objective {
  const done = (world: World): number =>
    world.machines.filter((m: Machine) => m.state === state).length;
  return define(
    `machines-all-${state}`,
    `Leave every machine ${state}`,
    options,
    (ctx) => ctx.world.machines.length > 0 && done(ctx.world) === ctx.world.machines.length,
    (ctx) => [done(ctx.world), ctx.world.machines.length],
  );
}

/**
 * Evaluates a list of objectives into the shape `Verdict` wants.
 *
 * `divergence` is asked for only when the objective was missed. A met objective has no point of
 * divergence by definition, and an objective's own `divergence` is free to assume that.
 */
export function evaluateObjectives(
  objectives: readonly Objective[],
  ctx: ObjectiveContext,
): ObjectiveReport[] {
  return objectives.map((objective) => {
    const met = objective.evaluate(ctx);
    const progress = objective.progress?.(ctx);
    const divergence = met ? undefined : objective.divergence?.(ctx);
    const report: ObjectiveReport = { id: objective.id, label: objective.label, met };
    if (progress) report.progress = progress;
    if (divergence) report.divergence = divergence;
    return report;
  });
}

/** Re-exported so objective authors do not have to reach into world.ts for the common case. */
export { tileAt };
