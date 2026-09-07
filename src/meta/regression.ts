import { Medal, medalFor } from '../engine/index.ts';
import type { LibraryUsage } from '../runtime/index.ts';
import { importedLibraryNames } from '../runtime/index.ts';
import { REGRESSION } from './copy.ts';
import { hashText, runKey } from './hash.ts';
import { MAX_CACHE_ENTRIES } from './save.ts';
import type {
  CachedRun,
  LevelProfile,
  LibrarySave,
  RegressionEntry,
  RegressionRun,
} from './types.ts';

/**
 * Re-running every closed work order that reads the Repository, after the Repository changed.
 *
 * Three constraints shape all of this and none of them is negotiable:
 *
 *  1. **Nothing is silently downgraded.** A worse result is *reported*; the recorded medal moves
 *     only when the player presses accept. Losing a gold to an edit they were told nothing about
 *     is the fastest way to make someone stop touching the library, which kills the feature.
 *  2. **Nothing blocks a frame.** Each work order is one `await` on the worker, and the loop hands
 *     control back between them. A suite over forty work orders is slow; it is never janky.
 *  3. **Unchanged is free.** The cache is keyed on the work order, its source, and — only when
 *     that work order actually imports from `'lib'` — the library. Most of the campaign never
 *     touches the Repository, so most of the suite answers instantly on every edit.
 *
 * No worker, no Monaco: the caller supplies a `MetaRunner`, which the host implements over
 * `src/runtime`'s `Runner` and `src/meta/adapters.ts` fakes for tests.
 */

export interface MetaRunRequest {
  levelId: string;
  /** The player's source for that work order, exactly as saved. */
  code: string;
  seeds: number[];
  /** Absent when the work order imports nothing. */
  library?: { source: string; hash: string };
}

export interface MetaRunOutcome {
  passed: boolean;
  ticks: number;
  /** Present whenever a library was linked. */
  usage?: LibraryUsage;
  failure?: { message: string; file?: 'program' | 'lib'; line?: number };
}

export interface MetaRunner {
  run(request: MetaRunRequest): Promise<MetaRunOutcome>;
}

/** One closed work order, as the suite needs it. */
export interface RegressionTarget {
  levelId: string;
  code: string;
  seeds: number[];
  parTicks: number;
  /** The medal on record. Never written by the suite. */
  medal: Medal;
  /** Whether this work order carries a medal at all. Defaults to `true`. DESIGN.md §7. */
  graded?: boolean;
  /** The ticks on record, when there are any. */
  ticks?: number;
}

/**
 * The medal a re-run would land on, or `Medal.None` where the level has no ladder.
 *
 * An ungraded work order can still break, still degrade and still improve — the suite reports all
 * three from the ticks — but it cannot change medal, because it has never had one to change.
 */
function medalAfter(target: RegressionTarget, passed: boolean, ticks: number): Medal {
  if (target.graded === false) return Medal.None;
  return medalFor(passed, ticks, target.parTicks);
}

export interface RegressionSummary {
  total: number;
  broken: number;
  degraded: number;
  improved: number;
  nominal: number;
  cached: number;
}

const EMPTY_USAGE: LibraryUsage = { ticks: 0, calls: {} };

/** Yields to the host between work orders so a long suite cannot hold a frame. */
function yieldToHost(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * The cache key for one work order under one library.
 *
 * `importsLibrary` is decided by the caller, because deciding it here would mean re-scanning every
 * saved source on every edit. When it is false the library hash is left out of the key entirely,
 * which is what makes an independent work order permanently cached.
 */
export function keyFor(
  target: RegressionTarget,
  libraryHash: string | undefined,
  dependsOnLibrary: boolean,
): string {
  return runKey({
    levelId: target.levelId,
    sourceHash: hashText(target.code),
    seeds: target.seeds,
    libraryHash,
    dependsOnLibrary,
  });
}

/** Reads a stored verdict, or `undefined` when the answer has to be measured. */
export function cachedRun(save: LibrarySave, key: string): CachedRun | undefined {
  return save.cache[key];
}

/** Writes a verdict into the cache, dropping the oldest entries once the cap is reached. */
export function withCachedRun(save: LibrarySave, run: CachedRun): LibrarySave {
  const cache = { ...save.cache, [run.key]: run };
  const keys = Object.keys(cache);
  if (keys.length > MAX_CACHE_ENTRIES) {
    const ordered = keys
      .map((key) => cache[key] as CachedRun)
      .sort((a, b) => a.at - b.at)
      .slice(0, keys.length - MAX_CACHE_ENTRIES);
    for (const stale of ordered) delete cache[stale.key];
  }
  return { ...save, cache };
}

function classify(
  target: RegressionTarget,
  outcome: MetaRunOutcome,
  before: number | undefined,
): RegressionEntry {
  const afterMedal = medalAfter(target, outcome.passed, outcome.ticks);
  const base: RegressionEntry = {
    levelId: target.levelId,
    state: 'nominal',
    afterTicks: outcome.ticks,
    afterMedal,
    beforeMedal: target.medal,
    seeds: [...target.seeds],
  };
  if (before !== undefined) base.beforeTicks = before;

  if (!outcome.passed) {
    base.state = 'broken';
    base.note = REGRESSION.broken(target.levelId);
    if (outcome.failure) base.failure = outcome.failure;
    return base;
  }
  if (before === undefined || outcome.ticks === before) {
    base.note = REGRESSION.nominal(target.levelId);
    return base;
  }
  if (outcome.ticks < before) {
    base.state = 'improved';
    base.note = REGRESSION.improved(target.levelId, before - outcome.ticks);
    return base;
  }
  base.state = 'degraded';
  base.note = REGRESSION.degraded(target.levelId);
  return base;
}

export interface SuiteOptions {
  runner: MetaRunner;
  /** `lib.ts` as it stands now. */
  librarySource: string;
  /** Identity of that source. Usually the revision id. */
  libraryHash: string;
  revisionId: string;
  /** True for work orders whose source imports from `'lib'`. */
  dependsOnLibrary(target: RegressionTarget): boolean;
  /** Called after every work order so the panel can redraw. */
  onProgress?(run: RegressionRun): void;
  /** Returns true to abandon the suite. Checked between work orders. */
  cancelled?(): boolean;
}

export interface SuiteResult {
  run: RegressionRun;
  summary: RegressionSummary;
  /** Cache entries to fold into the save, whether the player accepts the results or not. */
  cache: CachedRun[];
  /** Fresh measurements, for the Refactor screen. Written regardless of the medal decision. */
  profiles: LevelProfile[];
}

/**
 * Runs the suite, one work order at a time.
 *
 * `profiles` come back even when nothing changed, because the Refactor screen's honesty depends on
 * having a measurement against *this* library for every work order it counts. `cache` comes back
 * separately so the caller can persist the cheap part without persisting a medal decision.
 */
export async function runSuite(
  targets: readonly RegressionTarget[],
  save: LibrarySave,
  options: SuiteOptions,
): Promise<SuiteResult> {
  const run: RegressionRun = {
    revisionId: options.revisionId,
    startedAt: Date.now(),
    entries: targets.map((target) => ({ levelId: target.levelId, state: 'pending' as const })),
  };
  const cache: CachedRun[] = [];
  const profiles: LevelProfile[] = [];

  for (let index = 0; index < targets.length; index++) {
    if (options.cancelled?.()) {
      run.cancelled = true;
      for (const entry of run.entries) {
        if (entry.state === 'pending' || entry.state === 'running') entry.state = 'skipped';
      }
      break;
    }

    const target = targets[index] as RegressionTarget;
    const depends = options.dependsOnLibrary(target);
    const key = keyFor(target, options.libraryHash, depends);
    const previous = cachedRun(save, key);

    run.entries[index] = { levelId: target.levelId, state: 'running' };
    options.onProgress?.(run);

    let outcome: MetaRunOutcome;
    if (previous) {
      outcome = {
        passed: previous.passed,
        ticks: previous.ticks,
        usage: previous.usage,
        ...(previous.failure ? { failure: previous.failure } : {}),
      };
    } else {
      outcome = await options.runner.run({
        levelId: target.levelId,
        code: target.code,
        seeds: target.seeds,
        ...(depends
          ? { library: { source: options.librarySource, hash: options.libraryHash } }
          : {}),
      });
      cache.push({
        key,
        levelId: target.levelId,
        passed: outcome.passed,
        ticks: outcome.ticks,
        medal: medalAfter(target, outcome.passed, outcome.ticks),
        usage: outcome.usage ?? EMPTY_USAGE,
        at: Date.now(),
        ...(outcome.failure ? { failure: outcome.failure } : {}),
      });
    }

    const entry = classify(target, outcome, target.ticks);
    if (previous) {
      entry.cached = true;
      if (entry.state === 'nominal') entry.note = REGRESSION.cachedNote;
    }
    run.entries[index] = entry;

    profiles.push({
      levelId: target.levelId,
      key,
      passed: outcome.passed,
      ticks: outcome.ticks,
      medal: medalAfter(target, outcome.passed, outcome.ticks),
      parTicks: target.parTicks,
      usage: outcome.usage ?? EMPTY_USAGE,
      imports: importedLibraryNames(target.code),
      at: Date.now(),
    });

    options.onProgress?.(run);
    if (!previous || index % 8 === 7) await yieldToHost();
  }

  run.finishedAt = Date.now();
  return { run, summary: summarise(run), cache, profiles };
}

export function summarise(run: RegressionRun): RegressionSummary {
  const summary: RegressionSummary = {
    total: run.entries.length,
    broken: 0,
    degraded: 0,
    improved: 0,
    nominal: 0,
    cached: 0,
  };
  for (const entry of run.entries) {
    if (entry.cached) summary.cached += 1;
    if (entry.state === 'broken') summary.broken += 1;
    else if (entry.state === 'degraded') summary.degraded += 1;
    else if (entry.state === 'improved') summary.improved += 1;
    else if (entry.state === 'nominal') summary.nominal += 1;
  }
  return summary;
}

/** True when the suite found something the player would want the revert button for. */
export function needsAttention(summary: RegressionSummary): boolean {
  return summary.broken > 0 || summary.degraded > 0;
}

/** The line above the report. */
export function summaryLine(summary: RegressionSummary): string {
  if (summary.total === 0) return REGRESSION.nothingToCheck;
  if (!needsAttention(summary)) return REGRESSION.clean;
  const parts: string[] = [];
  if (summary.broken > 0) {
    parts.push(`${summary.broken} no longer ${summary.broken === 1 ? 'closes' : 'close'}`);
  }
  if (summary.degraded > 0) parts.push(`${summary.degraded} degraded`);
  return `${parts.join(', ')}. ${REGRESSION.medalKept}`;
}

/**
 * Folds a finished suite into the save.
 *
 * `acceptMedals` is the player's decision and defaults to false, which is the whole safety
 * property: profiles and cache are written either way, medals only on request. `lastKnownGood`
 * advances only when the suite found nothing — a revision that broke something must never become
 * the thing revert restores.
 */
export function applySuite(
  save: LibrarySave,
  result: SuiteResult,
  options: { acceptMedals?: boolean; revisionId: string },
): { save: LibrarySave; medals: { levelId: string; medal: Medal; ticks: number }[] } {
  let next = save;
  for (const run of result.cache) next = withCachedRun(next, run);

  const profiles = { ...next.profiles };
  for (const profile of result.profiles) profiles[profile.levelId] = profile;

  const clean = !needsAttention(result.summary) && !result.run.cancelled;
  next = {
    ...next,
    profiles,
    ...(clean ? { lastKnownGood: options.revisionId } : {}),
    updatedAt: Date.now(),
  };

  if (options.acceptMedals !== true) return { save: next, medals: [] };

  const medals = result.run.entries
    .filter((entry) => entry.afterMedal !== undefined && entry.afterTicks !== undefined)
    .map((entry) => ({
      levelId: entry.levelId,
      medal: entry.afterMedal as Medal,
      ticks: entry.afterTicks as number,
    }));
  return { save: next, medals };
}
