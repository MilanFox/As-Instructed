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
 * A manifest level that grades printed text once answered four plausible lines and an empty
 * program with the identical `0 of 5 — 5 short`. A count says an
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

/**
 * What a budget objective is denominated in, and where the run's spend against it is counted.
 *
 * `src/game/budgets.ts` recovers the unclamped spend behind a `[done, total]` progress pair, and
 * until now it worked out which of the run's totals to count by **reading the objective's English
 * label** — matching `/\btick(s)?\b/`, then sense and resource names word by word, then a trailing
 * `…, in ticks`. A label is player-facing prose. Rewording one silently changed which meter a
 * budget was read against, or stopped it being read as a budget at all: no error, no failing test,
 * a number that quietly stops scoring. Every objective label in the campaign was rewritten in one
 * week, so this is not hypothetical.
 *
 * An objective that says what it counts is never guessed at. The parsing stays as the fallback for
 * the ones that have not said.
 */
export type BudgetMeter =
  | { kind: 'ticks' }
  | { kind: 'ops' }
  | { kind: 'sense'; name: string }
  | { kind: 'spend'; resource: string }
  /** Anything a level counts by walking the trace itself — marks placed, moves made. */
  | { kind: 'events'; event: string };

/** One objective as the verdict reports it. */
export interface ObjectiveReport {
  id: string;
  label: string;
  met: boolean;
  /** `[done, total]` for a "7/12" readout. Absent when the objective is binary. */
  progress?: [number, number];
  /** Only ever present on an unmet objective that opted into reporting one. */
  divergence?: Divergence;
  /** Declared by the objective; carried through so the shell never has to read the label. */
  meter?: BudgetMeter;
  /** The plural noun both numbers are shown in, where the level wants one of its own. */
  unit?: string;
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
   * Asked only after `evaluate` returned false, and free to return `undefined` when this
   * particular failure has no single point to name.
   *
   * Every objective in the campaign either implements this or declares itself `binary`. That is
   * an invariant, held by `src/levels/__tests__/legibility.test.ts`, not a convention.
   */
  divergence?(ctx: ObjectiveContext): Divergence | undefined;
  /**
   * A positive statement that there is nothing here to diverge on: the objective asks a question
   * whose only two answers are yes and no, and its label already says which one the run gave.
   *
   * Only `checkbox` sets it. It exists so that "this objective reports one bit" has to be written
   * down by the author and can be counted by a reviewer, rather than being what happens when
   * nobody supplied a `divergence`. Silence by default once cost real information: 31 of 34 work
   * orders could only ever say `not met`.
   */
  binary?: true;
  /**
   * What this objective's `progress` counts, for a level that is spending against a limit.
   *
   * Set it and the readout is exact whatever the label says. Leave it off and `budgetFor` falls
   * back to reading the words, which is right often enough to be worth keeping and wrong silently
   * when the words change. `withinTicks`, `withinOps` and `withinSenses` set it for themselves.
   */
  meter?: BudgetMeter;
  /** Overrides the noun the readout uses. Omit unless the meter's own name reads badly. */
  unit?: string;
}

export interface ObjectiveOptions {
  id?: string;
  label?: string;
  /** Declares the budget rather than leaving `budgetFor` to infer it from `label`. */
  meter?: BudgetMeter;
  unit?: string;
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
  meter?: BudgetMeter,
): Objective {
  const objective: Objective = {
    id: options?.id ?? fallbackId,
    label: options?.label ?? fallbackLabel,
    evaluate,
  };
  if (progress) objective.progress = progress;
  if (divergence) objective.divergence = divergence;
  const denomination = options?.meter ?? meter;
  if (denomination) objective.meter = denomination;
  if (options?.unit) objective.unit = options.unit;
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
  const firstMiss = (world: World): Vec | undefined => {
    for (let i = 0; i < world.tiles.length; i++) {
      const at = { x: i % world.w, y: Math.floor(i / world.w) };
      if (!pred(world.tiles[i] as Tile, at)) return at;
    }
    return undefined;
  };
  return define(
    'all-tiles-are',
    'Bring every tile to spec',
    options,
    (ctx) => count(ctx.world) === ctx.world.tiles.length,
    (ctx) => [count(ctx.world), ctx.world.tiles.length],
    (ctx) => {
      const miss = firstMiss(ctx.world);
      if (miss === undefined) return undefined;
      return {
        where: `(${String(miss.x)}, ${String(miss.y)})`,
        expected: 'to spec',
        received: tileAt(ctx.world, miss)?.terrain ?? NOTHING,
      };
    },
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
    (ctx) => ({
      where: 'across the site',
      expected: `${op} ${String(n)} tiles`,
      received: `${String(count(ctx.world))} tiles`,
    }),
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
    (ctx) => ({
      where: `bot #${String(botId)} at the end of the run`,
      expected: `${String(n)} ${kind}`,
      received: `${String(held(ctx.world))} ${kind}`,
    }),
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
    (ctx) => ({
      where: `(${String(where.x)}, ${String(where.y)})`,
      expected: `${String(n)} ${kind}`,
      received: `${String(delivered(ctx.world))} ${kind}`,
    }),
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
    (ctx) => ({
      where: 'the whole run',
      expected: `${String(n)} ticks`,
      received: `${String(ctx.trace.endTick)} ticks`,
    }),
    { kind: 'ticks' },
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
    (ctx) => ({
      where: `${name}()`,
      expected: `${String(n)} calls`,
      received: `${String(used(ctx))} calls`,
    }),
    { kind: 'sense', name },
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
    (ctx) => ({
      where: 'the whole run',
      expected: `${String(n)} operations`,
      received: `${String(used(ctx))} operations`,
    }),
    { kind: 'ops' },
  );
}

/**
 * What a `custom` objective says when it is missed. `divergence` is required, `progress` is not.
 *
 * The asymmetry is the point. A count answers "how far off"; only a divergence answers "off
 * where", and a level that computed the comparison already holds the answer to the second.
 * `divergence` may still return `undefined` at runtime for a failure with no single point —
 * what it may not do is not exist.
 */
export interface CustomReport {
  progress?(ctx: ObjectiveContext): [number, number];
  divergence(ctx: ObjectiveContext): Divergence | undefined;
  /** What `progress` counts, where it counts against a limit. DESIGN.md §5. */
  meter?: BudgetMeter;
  unit?: string;
}

/**
 * Escape hatch. Prefer a named builder when one fits — the UI reads `label`, not the code.
 *
 * `report` is required, and so is its `divergence`. There is no shorter call: an objective that
 * has nothing to diverge on is a `checkbox`, and saying so is a sentence the author has to write.
 */
export function custom(
  id: string,
  label: string,
  fn: (ctx: ObjectiveContext) => boolean,
  report: CustomReport,
): Objective {
  const options: ObjectiveOptions = { id, label };
  if (report.meter) options.meter = report.meter;
  if (report.unit) options.unit = report.unit;
  return define(id, label, options, fn, report.progress?.bind(report), (ctx) =>
    report.divergence(ctx),
  );
}

/**
 * An objective with nothing to diverge on: the label states a condition, the run either met it or
 * did not, and there is no coordinate, count or expected value that would tell the player anything
 * their own program does not already say.
 *
 * Rare on purpose. Reach for it only after asking what the level knows that the player does not —
 * on most misses the answer is "quite a lot", and then the objective wants `custom` with a
 * `divergence`. `src/levels/__tests__/legibility.test.ts` holds the whole campaign's list of these
 * in one place so that it stays short enough to read.
 */
export function checkbox(
  id: string,
  label: string,
  fn: (ctx: ObjectiveContext) => boolean,
): Objective {
  return { id, label, evaluate: fn, binary: true };
}

/** Convenience for `allTilesAre` / `tileCount` predicates. */
export function hasTerrain(terrain: Tile['terrain']): (tile: Tile) => boolean {
  return (tile) => tile.terrain === terrain;
}

export function machinesAllIn(state: string, options?: ObjectiveOptions): Objective {
  const done = (world: World): number =>
    world.machines.filter((m: Machine) => m.state === state).length;
  const straggler = (world: World): Machine | undefined =>
    world.machines.find((m: Machine) => m.state !== state);
  return define(
    `machines-all-${state}`,
    `Leave every machine ${state}`,
    options,
    (ctx) => ctx.world.machines.length > 0 && done(ctx.world) === ctx.world.machines.length,
    (ctx) => [done(ctx.world), ctx.world.machines.length],
    (ctx) => {
      const left = straggler(ctx.world);
      if (left === undefined) return undefined;
      return { where: left.id, expected: state, received: left.state };
    },
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
    if (objective.meter) report.meter = objective.meter;
    if (objective.unit) report.unit = objective.unit;
    return report;
  });
}

/** Re-exported so objective authors do not have to reach into world.ts for the common case. */
export { tileAt };
