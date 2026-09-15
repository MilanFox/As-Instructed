import type { ObjectiveReport } from '../../engine/index.ts';
import type { BudgetSource } from '../../game/budgets.ts';
import { budgetFor, failureCauses } from '../../game/budgets.ts';
import { playbackFor } from '../../game/playback.ts';
import { Medal, isGraded, levelPoints, medalForLevel, medalOf } from '../../game/score.ts';
import type { GameState } from '../../game/store.ts';
import { currentLevel } from '../../game/store.ts';
import { codeForKind, failureLineAt, libraryUsageLine, successLine } from '../copy.ts';
import type { ReportCause, ReportRow, ReportSnapshot } from './papers.ts';

const MEDAL_WORD: Record<Medal, string> = {
  gold: 'gold',
  silver: 'silver',
  bronze: 'bronze',
  none: 'no medal',
};

export function resultWord(medal: Medal | null): string {
  return medal === null ? 'closed' : MEDAL_WORD[medal];
}

export function reportedMedal(
  level: { graded?: boolean; par: { ticks: number } } | null | undefined,
  passed: boolean,
  ticks: number,
): Medal | null {
  if (!passed) return Medal.None;
  return medalForLevel(level ?? { par: { ticks: 1 } }, passed, ticks);
}

export function celebrationFor(medal: Medal | null): 'gold' | 'silver' | 'bronze' | 'pass' {
  return medal === null || medal === 'none' ? 'pass' : medal;
}

export function snapshotReport(state: GameState): ReportSnapshot | null {
  const level = currentLevel(state);
  if (!level) return null;

  const verdict = state.verdict;
  const passed = verdict?.passed ?? false;
  const ticks = verdict?.stats.ticks ?? 0;
  const medal = reportedMedal(level, passed, ticks);
  const graded = isGraded(level);
  const progress = state.save.levels[level.id];

  const bonusIds = new Set((level.bonus ?? []).map((objective) => objective.id));
  const reported = new Map((verdict?.objectives ?? []).map((entry) => [entry.id, entry]));

  const playback = playbackFor(level, state.trace);
  const sourceFor = (id: string): BudgetSource => {
    const history = playback?.tracks.find((track) => track.id === id)?.progress;
    return {
      trace: state.trace,
      ...(verdict ? { stats: verdict.stats } : {}),
      ...(history ? { history } : {}),
    };
  };

  const multiSeed = state.seedResults.length > 1;
  const seedMarks = (id: string): { seed: number; met: boolean }[] =>
    state.seedResults.map((result) => ({
      seed: result.seed,
      met: result.objectives.some((entry) => entry.id === id && entry.met),
    }));

  const rowFor = (objective: { id: string; label: string; unit?: string }): ReportRow => {
    const reading = reported.get(objective.id) ?? {
      id: objective.id,
      label: objective.label,
      met: false,
    };
    const budget = budgetFor(reading, sourceFor(objective.id));
    const bonus = bonusIds.has(objective.id);
    const row: ReportRow = {
      id: objective.id,
      label: reading.label,
      met: reading.met,
      bonus,
    };
    if (reading.progress) row.progress = reading.progress;
    if (budget) row.budget = budget;
    const unit = reading.unit ?? objective.unit;
    if (unit) row.unit = unit;
    if (multiSeed && !bonus) row.seeds = seedMarks(objective.id);
    return row;
  };

  const objectives = [...level.objectives, ...(level.bonus ?? [])].map(rowFor);
  const stars = objectives.filter((row) => row.bonus && row.met).length;

  const causes: ReportCause[] = passed
    ? []
    : failureCauses(
        (verdict?.objectives ?? []).filter((entry) => !bonusIds.has(entry.id)),
        { trace: state.trace, ...(verdict ? { stats: verdict.stats } : {}) },
        sourceFor,
      ).map((cause) => ({
        id: cause.id,
        label: cause.label,
        detail: cause.detail,
        budget: cause.budget,
        divergence: cause.divergence
          ? {
              where: cause.divergence.where,
              want: cause.divergence.expected,
              got: cause.divergence.received,
            }
          : null,
      }));

  const failedSeed = state.seedResults.find((result) => !result.passed);
  const passedSeed = state.seedResults.find((result) => result.passed);

  const namesBonusSeed = passed && multiSeed;
  const bonusSeed = namesBonusSeed
    ? (state.seedResults.find((result) => (result.bonus ?? []).some((entry) => !entry.met))?.seed ??
      null)
    : null;
  const seedNote = (entry: ObjectiveReport): string =>
    entry.progress
      ? `${entry.label} (${String(entry.progress[0])}/${String(entry.progress[1])})`
      : entry.label;

  const reportedSeed =
    state.seedResults.find((result) => result.seed === state.traceSeed) ?? state.seedResults[0];
  const usage = reportedSeed?.libraryUsage;
  const routines = usage ? Object.values(usage.calls).filter((entry) => entry.calls > 0).length : 0;

  return {
    levelId: level.id,
    title: level.title,
    passed,
    graded,
    medal,
    headline: passed
      ? successLine(medal, ticks, level.par.ticks)
      : failureLineAt(
          codeForKind(state.failure?.kind) ?? verdict?.failure?.code,
          state.failureCursor,
        ),
    ticks: verdict ? ticks : null,
    par: graded ? level.par.ticks : null,
    limit: level.budget?.maxTicks ?? null,
    bestTicks: progress?.bestTicks ?? null,
    seeds:
      state.seedResults.length > 0 ? state.seedResults.map((result) => result.seed) : level.seeds,
    seedLines: state.seedResults.map((result) => ({
      seed: result.seed,
      passed: result.passed,
      note: [
        ...result.objectives.filter((entry) => !entry.met && !bonusIds.has(entry.id)),
        ...(namesBonusSeed ? (result.bonus ?? []).filter((entry) => !entry.met) : []),
      ]
        .map(seedNote)
        .join(' · '),
    })),
    objectives,
    causes,
    cause: causes.find((cause) => cause.divergence)?.divergence ?? null,
    failure: state.failure?.message ?? verdict?.failure?.message ?? null,
    failureCode: verdict?.failure?.code ?? state.failure?.kind ?? null,
    failureSeed: failedSeed?.seed ?? null,
    failureLine: state.failure?.line ?? null,
    passedSeed: passedSeed && failedSeed ? passedSeed.seed : null,
    bonusSeed,
    commendations: [...state.freshCommendations],
    personalBest: state.personalBest,
    points: passed ? levelPoints(medal, stars) : null,
    stars,
    onRecord: passed
      ? null
      : progress?.completed
        ? { word: resultWord(medalOf(level, progress)), note: 'this run changed nothing' }
        : { word: 'still open', note: 'nothing to lose' },
    libraryLine: usage && routines > 0 ? libraryUsageLine(routines, usage.ticks) : null,
    at: Date.now(),
  };
}
