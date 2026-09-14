import { Medal, medalFor } from '../engine/index.ts';
import type { LibraryUsage } from '../runtime/index.ts';
import { importedLibraryNames, importsLibrary } from '../runtime/index.ts';
import { REGRESSION } from './copy.ts';
import { hashText, runKey } from './hash.ts';
import { MAX_CACHE_ENTRIES } from './save.ts';
import type {
  CachedRun,
  LevelFacts,
  LevelProfile,
  LibrarySave,
  RegressionEntry,
  RegressionRun,
} from './types.ts';

export interface MetaRunRequest {
  levelId: string;
  code: string;
  seeds: number[];
  library?: { source: string; hash: string };
}

export interface MetaRunOutcome {
  passed: boolean;
  ticks: number;
  usage?: LibraryUsage;
  failure?: { message: string; file?: 'program' | 'lib'; line?: number };
}

export interface MetaRunner {
  run(request: MetaRunRequest): Promise<MetaRunOutcome>;
}

export interface RegressionTarget {
  levelId: string;
  code: string;
  seeds: number[];
  parTicks: number;
  medal: Medal;
  graded?: boolean;
  ticks?: number;
}

function medalAfter(
  target: Pick<RegressionTarget, 'parTicks' | 'graded'>,
  passed: boolean,
  ticks: number,
): Medal {
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

function yieldToHost(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

export function keyFor(
  target: Pick<RegressionTarget, 'levelId' | 'code' | 'seeds'>,
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

export function cachedRun(save: LibrarySave, key: string): CachedRun | undefined {
  return save.cache[key];
}

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
  librarySource: string;
  libraryHash: string;
  revisionId: string;
  dependsOnLibrary(target: RegressionTarget): boolean;
  onProgress?(run: RegressionRun): void;
  cancelled?(): boolean;
}

export interface SuiteResult {
  run: RegressionRun;
  summary: RegressionSummary;
  cache: CachedRun[];
  profiles: LevelProfile[];
}

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

export interface CompletedWorkOrder {
  levelId: string;
  code: string;
  ticks: number;
  runs: readonly { seed: number; ticks: number; libraryUsage?: LibraryUsage }[];
}

export function completionProfile(
  order: CompletedWorkOrder,
  facts: LevelFacts | undefined,
  libraryHash: string,
): LevelProfile | null {
  if (!importsLibrary(order.code)) return null;

  const parTicks = facts?.parTicks ?? 0;
  const scoring = order.runs.reduce<CompletedWorkOrder['runs'][number] | undefined>(
    (worst, run) => (worst && worst.ticks >= run.ticks ? worst : run),
    undefined,
  );

  return {
    levelId: order.levelId,
    key: keyFor(
      { levelId: order.levelId, code: order.code, seeds: order.runs.map((run) => run.seed) },
      libraryHash,
      true,
    ),
    passed: true,
    ticks: order.ticks,
    medal: medalAfter({ parTicks, graded: facts?.graded }, true, order.ticks),
    parTicks,
    usage: scoring?.libraryUsage ?? EMPTY_USAGE,
    imports: importedLibraryNames(order.code),
    at: Date.now(),
  };
}

export interface LevelInHand {
  levelId: string;
  code: string;
}

export interface LibraryReaders {
  closed: string[];
  inHand?: string;
}

export function libraryReaders(
  targets: readonly RegressionTarget[],
  inHand?: LevelInHand | null,
): LibraryReaders {
  const closed = targets
    .filter((target) => importsLibrary(target.code))
    .map((target) => target.levelId);
  const readers: LibraryReaders = { closed };
  if (inHand && !closed.includes(inHand.levelId) && importsLibrary(inHand.code)) {
    readers.inHand = inHand.levelId;
  }
  return readers;
}

export function readershipLines(readers: LibraryReaders): string[] {
  if (readers.closed.length === 0 && readers.inHand === undefined) {
    return [REGRESSION.readsNothing];
  }
  const lines: string[] = [];
  if (readers.closed.length > 0) lines.push(REGRESSION.readsClosed(readers.closed.length));
  if (readers.inHand !== undefined) lines.push(REGRESSION.readsInHand(readers.inHand));
  return lines;
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

export function needsAttention(summary: RegressionSummary): boolean {
  return summary.broken > 0 || summary.degraded > 0;
}

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
