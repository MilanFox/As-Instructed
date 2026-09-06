import type { ObjectiveReport, Verdict } from '../engine/index.ts';
import { FailureCode } from '../engine/index.ts';
import type { RunResponse } from './protocol.ts';
import type { SeedRun } from './run-level.ts';

/**
 * Folding several seed runs into the one answer the UI renders.
 *
 * DESIGN.md §5: every seed must pass. Two rules follow, and both are easy to get wrong:
 *
 *  - The **worst** seed sets the score. Reporting the best would let a player medal on a level
 *    they only solved for one world layout.
 *  - The trace handed back is the **failing** seed's. Returning seed 1's trace after seed 3 failed
 *    shows the player a successful run and leaves them with nothing to debug.
 *
 * The same rule runs per objective rather than per run, which is what makes partial credit
 * honest. Five objectives across three seeds is fifteen results, and collapsing them onto one
 * seed's column reports objectives as met that another seed missed. Each objective is therefore
 * reported from the worst seed *for that objective* — the first that missed it, with that seed's
 * own progress — so a run that closes four of five everywhere can say so, and the one that is
 * still open says which layout it is still open on.
 *
 * Bonus objectives are folded by the identical rule and appended to the same list. A bonus is a
 * level objective that happens not to move `passed`; grading it on one seed made the star the one
 * reward a solution that memorised a single layout could still win.
 */

function maxOf(values: readonly number[]): number {
  return values.reduce((best, value) => (value > best ? value : best), 0);
}

function mergeSpend(runs: readonly SeedRun[]): Record<string, number> {
  const worst: Record<string, number> = {};
  for (const run of runs) {
    for (const [resource, amount] of Object.entries(run.verdict.stats.spend)) {
      worst[resource] = Math.max(worst[resource] ?? 0, amount);
    }
  }
  return worst;
}

function mergeSenses(runs: readonly SeedRun[]): Record<string, number> {
  const worst: Record<string, number> = {};
  for (const run of runs) {
    for (const [command, count] of Object.entries(run.verdict.stats.senses ?? {})) {
      worst[command] = Math.max(worst[command] ?? 0, count);
    }
  }
  return worst;
}

/**
 * One row per objective, taken from the first seed that failed it and from the reported seed when
 * every seed met it. Objective order follows the level's, which is the reported run's order.
 */
function worstPerObjective(
  reported: readonly ObjectiveReport[],
  perSeed: readonly (readonly ObjectiveReport[])[],
): Verdict['objectives'] {
  return reported.map((objective) => {
    for (const seed of perSeed) {
      const missed = seed.find((candidate) => candidate.id === objective.id && !candidate.met);
      if (missed) return missed;
    }
    return objective;
  });
}

function seedPrefix(seed: number, index: number, total: number): string {
  return total > 1 ? `Seed ${index + 1} of ${total} (seed ${seed}) failed. ` : '';
}

export function aggregate(runs: SeedRun[]): RunResponse {
  if (runs.length === 0) {
    return {
      ok: false,
      error: {
        kind: 'runtime',
        code: FailureCode.Crash,
        message: 'This level declares no seeds to run against, so there was nothing to simulate.',
      },
    };
  }

  const failedIndex = runs.findIndex((run) => !run.result.passed);
  const reportedIndex = failedIndex === -1 ? 0 : failedIndex;
  const reported = runs[reportedIndex] as SeedRun;

  const verdict: Verdict = {
    passed: failedIndex === -1,
    objectives: [
      ...worstPerObjective(
        reported.verdict.objectives,
        runs.map((run) => run.verdict.objectives),
      ),
      ...worstPerObjective(
        reported.result.bonus ?? [],
        runs.map((run) => run.result.bonus ?? []),
      ),
    ],
    stats: {
      ticks: maxOf(runs.map((run) => run.verdict.stats.ticks)),
      ops: maxOf(runs.map((run) => run.verdict.stats.ops)),
      seeds: runs.length,
      spend: mergeSpend(runs),
      senses: mergeSenses(runs),
    },
  };

  if (reported.verdict.failure) {
    const prefix =
      failedIndex === -1 ? '' : seedPrefix(reported.result.seed, reportedIndex, runs.length);
    verdict.failure = {
      ...reported.verdict.failure,
      message: `${prefix}${reported.verdict.failure.message}`,
    };
  }

  const response: RunResponse = {
    ok: true,
    results: runs.map((run) => run.result),
    verdict,
    trace: reported.trace,
    traceSeed: reported.result.seed,
  };
  if (failedIndex !== -1) response.failedSeed = reported.result.seed;

  /* Attribution has to come from the seed that set the score, for the same reason the score does:
     the Refactor screen compares library ticks against `stats.ticks`, and taking them from
     different runs would produce a percentage that is quietly wrong. */
  const scoring = runs.reduce((worst, run) =>
    run.verdict.stats.ticks > worst.verdict.stats.ticks ? run : worst,
  );
  if (scoring.usage) response.libraryUsage = scoring.usage;

  return response;
}
