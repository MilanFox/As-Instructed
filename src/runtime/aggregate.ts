import type { ObjectiveReport, Verdict } from '../engine/index.ts';
import { FailureCode } from '../engine/index.ts';
import type { RunResponse } from './protocol.ts';
import type { SeedRun } from './run-level.ts';

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

function seedPrefix(seed: number, total: number): string {
  return total > 1 ? `Board ${seed} failed. ` : '';
}

export function aggregate(runs: SeedRun[]): RunResponse {
  if (runs.length === 0) {
    return {
      ok: false,
      error: {
        kind: 'runtime',
        code: FailureCode.Crash,
        message: 'This level has no boards, so nothing ran.',
      },
    };
  }

  const failedIndex = runs.findIndex((run) => !run.result.passed);
  const missedBonusIndex = runs.findIndex((run) =>
    (run.result.bonus ?? []).some((objective) => !objective.met),
  );
  const divergedIndex = failedIndex === -1 ? missedBonusIndex : failedIndex;
  const reportedIndex = divergedIndex === -1 ? 0 : divergedIndex;
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
    const prefix = failedIndex === -1 ? '' : seedPrefix(reported.result.seed, runs.length);
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

  const scoring = runs.reduce((worst, run) =>
    run.verdict.stats.ticks > worst.verdict.stats.ticks ? run : worst,
  );
  if (scoring.usage) response.libraryUsage = scoring.usage;

  return response;
}
