import type { CostOverrides, Trace, Verdict } from '../engine/index.ts';
import { Sim, buildVerdict, cloneWorld, evaluateObjectives, senseTotals } from '../engine/index.ts';
import type { LevelDef } from '../levels/index.ts';
import type { LibraryRequest, LibraryUsage, PerSeedResult, RuntimeFailure } from './protocol.ts';
import { buildPlayerScope } from './api-bindings.ts';
import { toRuntimeFailure, toVerdictFailure } from './errors.ts';
import { linkProgram, moduleStack, resolveModuleLocation } from './modules.ts';
import { measureWrapperOffset } from './wrapper.ts';
import { topFrameLine } from './errors.ts';

export interface SeedRunOptions {
  level: LevelDef;
  seed: number;
  js: string;
  source: string;
  lineMap?: readonly number[];
  unlockedHardware: readonly string[];
  library?: LibraryRequest | undefined;
  costOverrides?: CostOverrides;
  maxTicks?: number;
  maxOps?: number;
}

export interface SeedRun {
  result: PerSeedResult;
  trace: Trace;
  verdict: Verdict;
  usage?: LibraryUsage;
}

let cachedOffset: number | undefined;

export function wrapperOffset(): number {
  cachedOffset ??= measureWrapperOffset(topFrameLine);
  return cachedOffset;
}

export function runSeed(options: SeedRunOptions): SeedRun {
  const { level, seed, js, unlockedHardware } = options;

  const world = level.build(seed);
  const initialWorld = cloneWorld(world);
  const maxTicks = options.maxTicks ?? level.budget?.maxTicks;
  const maxOps = options.maxOps ?? level.budget?.maxOps;

  const sim = new Sim(world, {
    costs: options.costOverrides ?? level.costs,
    ...(maxTicks !== undefined ? { maxTicks } : {}),
    ...(maxOps !== undefined ? { maxOps } : {}),
  });
  const botId = world.bots[0]?.id ?? 0;

  let failure: RuntimeFailure | undefined;

  const maps = {
    program: options.lineMap,
    lib: options.library?.lineMap,
  };
  const linked = linkProgram({
    programJs: js,
    libraryJs: options.library?.js,
    scope: buildPlayerScope(sim, botId, unlockedHardware),
    meter: options.library ? { now: () => sim.ticks } : undefined,
  });

  try {
    linked.run();
  } catch (error) {
    failure = toRuntimeFailure(error, {
      wrapperOffset: wrapperOffset(),
      unlocked: unlockedHardware,
      locate: (stack) => resolveModuleLocation(stack, wrapperOffset(), maps),
      describeStack: (stack) =>
        moduleStack(stack, wrapperOffset(), maps, options.library !== undefined),
      ...(options.lineMap !== undefined ? { lineMap: options.lineMap } : {}),
    });
  }

  const trace = sim.finish();
  const senses = senseTotals(trace);
  const verdict = buildVerdict({
    objectives: level.objectives,
    world: sim.world,
    trace,
    initialWorld,
    ops: sim.ops,
    seeds: 1,
    spend: sim.spendTotals(),
    senses,
    ...(failure ? { failure: toVerdictFailure(failure) } : {}),
  });

  const result: PerSeedResult = {
    seed,
    passed: verdict.passed,
    ticks: verdict.stats.ticks,
    ops: verdict.stats.ops,
    objectives: verdict.objectives,
  };
  const bonus = level.bonus ?? [];
  if (bonus.length > 0) {
    result.bonus = evaluateObjectives(bonus, {
      world: sim.world,
      trace,
      initialWorld,
      ops: sim.ops,
      senses,
    });
  }
  if (failure) result.failure = failure;
  if (options.library) result.libraryUsage = linked.usage;

  return options.library
    ? { result, trace, verdict, usage: linked.usage }
    : { result, trace, verdict };
}
