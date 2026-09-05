import type { CostOverrides, Trace, Verdict } from '../engine/index.ts';
import { Sim, buildVerdict, cloneWorld } from '../engine/index.ts';
import type { LevelDef } from '../levels/index.ts';
import type { LibraryRequest, LibraryUsage, PerSeedResult, RuntimeFailure } from './protocol.ts';
import { buildPlayerScope } from './api-bindings.ts';
import { toRuntimeFailure, toVerdictFailure } from './errors.ts';
import { linkProgram, moduleStack, resolveModuleLocation } from './modules.ts';
import { measureWrapperOffset } from './wrapper.ts';
import { topFrameLine } from './errors.ts';

/**
 * One seed, start to finish: build the world, bind the API, run the player's program to
 * completion, and turn whatever happened into a `PerSeedResult`.
 *
 * Deliberately free of worker plumbing so it can be driven straight from a test. It must produce
 * byte-identical results to `src/levels/harness.ts` (`runLevel`); where they disagree, the harness
 * is right (docs/ENGINE.md §2).
 */

export interface SeedRunOptions {
  level: LevelDef;
  seed: number;
  /** Emitted JavaScript, not TypeScript. */
  js: string;
  /** The original source, as the player typed it. Carried for diagnostics; never executed. */
  source: string;
  /** Emitted-line to source-line map from `compile.ts`. See `sourcemap.ts`. */
  lineMap?: readonly number[];
  unlockedHardware: readonly string[];
  /** The player's shared library, already emitted. Linked in front of `js` when present. */
  library?: LibraryRequest | undefined;
  costOverrides?: CostOverrides;
  maxTicks?: number;
  maxOps?: number;
}

export interface SeedRun {
  result: PerSeedResult;
  trace: Trace;
  verdict: Verdict;
  /** Present whenever a library was linked. Feeds the Refactor screen's tick attribution. */
  usage?: LibraryUsage;
}

let cachedOffset: number | undefined;

/** The `new Function` line offset, measured once per worker. */
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

  /* Both files go through the linker, library or not. With no imports and no library the emitted
     body is the same program it always was; what the linker adds is the `//# sourceURL` that lets
     a failure say which file it came from. Line arithmetic is unchanged either way. */
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
  const verdict = buildVerdict({
    objectives: level.objectives,
    world: sim.world,
    trace,
    initialWorld,
    ops: sim.ops,
    seeds: 1,
    spend: sim.spendTotals(),
    ...(failure ? { failure: toVerdictFailure(failure) } : {}),
  });

  const result: PerSeedResult = {
    seed,
    passed: verdict.passed,
    ticks: verdict.stats.ticks,
    ops: verdict.stats.ops,
    objectives: verdict.objectives,
  };
  if (failure) result.failure = failure;
  if (options.library) result.libraryUsage = linked.usage;

  return options.library
    ? { result, trace, verdict, usage: linked.usage }
    : { result, trace, verdict };
}
