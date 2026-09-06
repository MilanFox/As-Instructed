import type { Medal } from '../engine/index.ts';
import { SILVER_FACTOR, medalFor } from '../engine/index.ts';
import { REFACTOR } from './copy.ts';
import type { LevelFacts, LibrarySave, PublishedFunction } from './types.ts';

/**
 * The Refactor screen's arithmetic.
 *
 * The one rule: **every number here comes from a run that happened.** A `LevelProfile` is written
 * only by `regression.ts` after a real simulation, and a profile whose cache key no longer matches
 * the current library is not quietly reused — it is reported as stale, and the screen offers to
 * re-measure rather than showing a figure it cannot stand behind.
 *
 * What is projected rather than measured is exactly one step: *if this subroutine cost `delta`
 * fewer ticks per call, these work orders would each save `delta × calls`.* The call counts are
 * measured; the subtraction is not a model of anything. That is the honest ceiling — a faster
 * `pathTo` that still walks the same number of tiles is not a thing the simulator can be asked to
 * imagine, so the alternative to this subtraction is not a better estimate, it is no number at all.
 *
 * Pure. Takes facts, returns rows.
 */

export interface CallerFact {
  levelId: string;
  title: string;
  /** Calls to this subroutine measured in the scoring run. */
  calls: number;
  /** Ticks charged inside those calls. */
  ticks: number;
  /** The work order's total ticks in that run. */
  totalTicks: number;
  parTicks: number;
  medal: Medal;
  /**
   * Whether this work order carries a medal. Defaults to `true`. DESIGN.md §11 A7.
   *
   * The ticks are still real and still worth showing — this is the screen that tells the player
   * where their time goes. What is not real on an ungraded work order is the bracket: there is no
   * silver to clear and no gold to reach, so it is excluded from `upgrades` and from the
   * thresholds `bestProjection` picks a target out of.
   */
  graded?: boolean;
}

export interface FunctionReport {
  name: string;
  /** Where it came from, when the Repository recorded a publish. */
  origin?: PublishedFunction;
  callers: CallerFact[];
  /** Total calls across every closed work order that uses it. */
  calls: number;
  /** Total ticks attributable to it. */
  ticks: number;
  /** Mean ticks per call, rounded. Zero when it has never been called. */
  perCall: number;
  /** Work orders whose recorded numbers predate the current library. */
  stale: string[];
  /** Work orders that import it but have never been measured. */
  unmeasured: string[];
}

/**
 * The threshold a work order's ticks must not exceed to hold each medal.
 *
 * The `par + 1` floor is `medalFor`'s and it is not decoration: ticks are integers, so a par under
 * four has an empty silver band without it — `floor(3 * 1.25)` is 3, the same number as gold. This
 * used to drop the floor and its own copy of `SILVER_FACTOR` with it, which projected a silver rung
 * on `w6-01` (par 1) and `w5-02` (par 2) that the engine does not award. A screen that promises a
 * rung the simulator will not give is worse than a screen with no projection on it.
 */
export function medalThresholds(parTicks: number): { gold: number; silver: number } {
  return {
    gold: parTicks,
    silver: Math.floor(Math.max(parTicks + 1, parTicks * SILVER_FACTOR)),
  };
}

/**
 * Per-subroutine rows for the Refactor screen.
 *
 * `freshKeys` is the set of cache keys measured against the *current* library, supplied by the
 * caller because only it knows what the player's source hashes are right now. Anything outside it
 * is listed as stale rather than counted.
 */
export function buildReports(options: {
  save: LibrarySave;
  exports: readonly string[];
  facts: ReadonlyMap<string, LevelFacts>;
  /** Cache keys that are current. A profile with any other key is stale. */
  freshKeys: ReadonlySet<string>;
}): FunctionReport[] {
  const origins = new Map(options.save.published.map((each) => [each.name, each]));
  const reports: FunctionReport[] = [];

  for (const name of options.exports) {
    const callers: CallerFact[] = [];
    const stale: string[] = [];
    const unmeasured: string[] = [];

    for (const profile of Object.values(options.save.profiles)) {
      if (!profile.imports.includes(name) && profile.usage.calls[name] === undefined) continue;
      const facts = options.facts.get(profile.levelId);
      if (!options.freshKeys.has(profile.key)) {
        stale.push(profile.levelId);
        continue;
      }
      const call = profile.usage.calls[name];
      if (!call || call.calls === 0) {
        unmeasured.push(profile.levelId);
        continue;
      }
      callers.push({
        levelId: profile.levelId,
        title: facts?.title ?? profile.levelId,
        calls: call.calls,
        ticks: call.ticks,
        totalTicks: profile.ticks,
        parTicks: profile.parTicks || (facts?.parTicks ?? 0),
        medal: profile.medal,
        graded: facts?.graded !== false,
      });
    }

    callers.sort((a, b) => b.ticks - a.ticks || a.levelId.localeCompare(b.levelId));
    const calls = callers.reduce((sum, each) => sum + each.calls, 0);
    const ticks = callers.reduce((sum, each) => sum + each.ticks, 0);
    const origin = origins.get(name);

    reports.push({
      name,
      ...(origin ? { origin } : {}),
      callers,
      calls,
      ticks,
      perCall: calls === 0 ? 0 : Math.round(ticks / calls),
      stale: stale.sort(),
      unmeasured: unmeasured.sort(),
    });
  }

  return reports.sort((a, b) => b.ticks - a.ticks || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

export interface MedalUpgrade {
  levelId: string;
  from: Medal;
  to: Medal;
}

export interface Projection {
  /** Ticks saved per call. */
  delta: number;
  /** Work orders whose total ticks would fall. */
  improves: string[];
  upgrades: MedalUpgrade[];
  /** The line the screen shows. Already in voice. */
  headline: string;
}

/** Ticks a work order would end at if `name` cost `delta` fewer ticks per call. */
export function projectedTicks(caller: CallerFact, delta: number): number {
  return Math.max(0, caller.totalTicks - delta * caller.calls);
}

/** What saving `delta` ticks per call would do, measured call counts times a subtraction. */
export function projectSavings(report: FunctionReport, delta: number): Projection {
  const improves: string[] = [];
  const upgrades: MedalUpgrade[] = [];

  for (const caller of report.callers) {
    const after = projectedTicks(caller, delta);
    if (after >= caller.totalTicks) continue;
    improves.push(caller.levelId);
    if (caller.graded === false) continue;
    const to = medalFor(true, after, caller.parTicks);
    if (to !== caller.medal && caller.medal !== 'gold') {
      upgrades.push({ levelId: caller.levelId, from: caller.medal, to });
    }
  }

  return {
    delta,
    improves,
    upgrades,
    headline: REFACTOR.projection(delta, report.name, improves.length, upgrades.length),
  };
}

/**
 * The cheapest saving that moves at least one work order into a better bracket.
 *
 * This is the number the screen leads with, because "make it two ticks cheaper and three work
 * orders go silver to gold" is the sentence that turns a list of costs into a plan. When no saving
 * ever changes a bracket the screen says so plainly instead of inventing a target.
 */
export function bestProjection(report: FunctionReport): Projection | undefined {
  const candidates = new Set<number>();

  for (const caller of report.callers) {
    if (caller.calls === 0 || caller.graded === false) continue;
    const { gold, silver } = medalThresholds(caller.parTicks);
    for (const threshold of [gold, silver]) {
      if (caller.totalTicks <= threshold) continue;
      const needed = Math.ceil((caller.totalTicks - threshold) / caller.calls);
      /* A saving larger than the subroutine's own measured cost per call is not a refactor, it is
         deleting the call. Anything above that is not offered as a target. */
      if (needed > 0 && needed <= Math.ceil(caller.ticks / caller.calls)) candidates.add(needed);
    }
  }

  if (candidates.size === 0) return undefined;
  const delta = Math.min(...candidates);
  return projectSavings(report, delta);
}

/** Groups a projection's upgrades into the "2 of them silver to gold" clause. */
export function upgradeSummary(projection: Projection): string[] {
  const buckets = new Map<string, number>();
  for (const upgrade of projection.upgrades) {
    const key = `${upgrade.from} ${upgrade.to}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([key, count]) => {
    const [from, to] = key.split(' ') as [Medal, Medal];
    return REFACTOR.projectionMedals(from, to, count);
  });
}
