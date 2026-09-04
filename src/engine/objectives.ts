import type { PrintEvent, Trace } from './trace.ts';
import type { ItemKind, Machine, Tile, Vec, World } from './types.ts';
import { botById, countItemsAt, eq, inventoryCount, machineById, tileAt } from './world.ts';

/** Everything an objective is allowed to look at. Objectives must be pure. */
export interface ObjectiveContext {
  /** The world as the player's program left it. */
  world: World;
  trace: Trace;
  /** The world as `LevelDef.build(seed)` produced it, before a single command ran. */
  initialWorld: World;
}

export interface Objective {
  /** Stable across edits — it is a save key and a trace event id. */
  id: string;
  /** One short imperative line shown in the objectives panel. */
  label: string;
  evaluate(ctx: ObjectiveContext): boolean;
  /** `[done, total]` for a "7/12" readout. Omit when the objective is binary. */
  progress?(ctx: ObjectiveContext): [number, number];
}

export interface ObjectiveOptions {
  id?: string;
  label?: string;
}

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
): Objective {
  const objective: Objective = {
    id: options?.id ?? fallbackId,
    label: options?.label ?? fallbackLabel,
    evaluate,
  };
  if (progress) objective.progress = progress;
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

/** The program's `print` output equals `expected`, in order, with nothing extra. */
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

/** Escape hatch. Prefer a named builder when one fits — the UI reads `label`, not the code. */
export function custom(
  id: string,
  label: string,
  fn: (ctx: ObjectiveContext) => boolean,
  progress?: (ctx: ObjectiveContext) => [number, number],
): Objective {
  return define(id, label, { id, label }, fn, progress);
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

/** Evaluates a list of objectives into the shape `Verdict` wants. */
export function evaluateObjectives(
  objectives: readonly Objective[],
  ctx: ObjectiveContext,
): { id: string; label: string; met: boolean; progress?: [number, number] }[] {
  return objectives.map((objective) => {
    const met = objective.evaluate(ctx);
    const progress = objective.progress?.(ctx);
    return progress
      ? { id: objective.id, label: objective.label, met, progress }
      : {
          id: objective.id,
          label: objective.label,
          met,
        };
  });
}

/** Re-exported so objective authors do not have to reach into world.ts for the common case. */
export { tileAt };
