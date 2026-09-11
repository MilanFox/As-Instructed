import type { PrintEvent, Trace } from './trace.ts';
import { senseTotals } from './trace.ts';
import type { ItemKind, Machine, Tile, Vec, World } from './types.ts';
import { botById, countItemsAt, eq, inventoryCount, machineById, tileAt } from './world.ts';

export interface ObjectiveContext {
  world: World;
  trace: Trace;
  initialWorld: World;
  ops?: number;
  senses?: Record<string, number>;
}

export interface Divergence {
  where: string;
  expected: string;
  received: string;
}

export type BudgetMeter =
  | { kind: 'ticks' }
  | { kind: 'ops' }
  | { kind: 'sense'; name: string }
  | { kind: 'spend'; resource: string }
  | { kind: 'events'; event: string };

export interface ObjectiveReport {
  id: string;
  label: string;
  met: boolean;
  progress?: [number, number];
  divergence?: Divergence;
  meter?: BudgetMeter;
  unit?: string;
}

export interface Objective {
  id: string;
  label: string;
  evaluate(ctx: ObjectiveContext): boolean;
  progress?(ctx: ObjectiveContext): [number, number];
  divergence?(ctx: ObjectiveContext): Divergence | undefined;
  binary?: true;
  meter?: BudgetMeter;
  unit?: string;
}

export interface ObjectiveOptions {
  id?: string;
  label?: string;
  meter?: BudgetMeter;
  unit?: string;
}

export const DIVERGENCE_VALUE_CHARS = 44;

export function clipValue(value: string, max = DIVERGENCE_VALUE_CHARS): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

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

export interface CustomReport {
  progress?(ctx: ObjectiveContext): [number, number];
  divergence(ctx: ObjectiveContext): Divergence | undefined;
  meter?: BudgetMeter;
  unit?: string;
}

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

export function checkbox(
  id: string,
  label: string,
  fn: (ctx: ObjectiveContext) => boolean,
): Objective {
  return { id, label, evaluate: fn, binary: true };
}

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

export { tileAt };
