/**
 * The run report, frozen into paper.
 *
 * `docs/AUDIT-UI.md` §6.6 is the reason this file exists: `showResults` was set true by a run and
 * by nothing else, so one stray click on the backdrop destroyed the medal, the cause, the
 * divergence, the objectives, the record and the seeds, and the only route back was to run the
 * program again. On the desk the report is a certificate of closure or a HALT notice lying on the
 * desk until it is filed, and that only works if it is a *snapshot*: the store's `verdict`,
 * `failureCursor` and `personalBest` are all overwritten by the next run, and a certificate that
 * changes when you run again is not paper.
 *
 * Everything the report prints is read once, here, at the moment the run finishes.
 */
import type { BudgetSource } from '../../../game/budgets.ts';
import { budgetFor, failureCauses } from '../../../game/budgets.ts';
import { playbackFor } from '../../../game/playback.ts';
import { Medal, isGraded, levelPoints, medalForLevel, medalOf } from '../../../game/score.ts';
import type { GameState } from '../../../game/store.ts';
import { currentLevel } from '../../../game/store.ts';
import { codeForKind, failureLineAt, libraryUsageLine, successLine } from '../../copy.ts';
import type { ReportCause, ReportRow, ReportSnapshot } from './papers.ts';

const MEDAL_WORD: Record<Medal, string> = {
  gold: 'gold',
  silver: 'silver',
  bronze: 'bronze',
  none: 'no medal',
};

/**
 * What the report calls the result. `null` is an ungraded work order (DESIGN.md §11 A7): there was
 * never a medal to award, so the word for it is the state — closed — and never a medal's absence.
 */
export function resultWord(medal: Medal | null): string {
  return medal === null ? 'closed' : MEDAL_WORD[medal];
}

/**
 * What this run earned, as the report says it.
 *
 * A failed run earned nothing on any level, which is `none` — a medal not held rather than a level
 * that awards none. `medalForLevel` answers the second question, and on an ungraded work order it
 * answers `null` whether the run passed or not, which would stamp a failed report CLOSED.
 */
export function reportedMedal(
  level: { graded?: boolean; par: { ticks: number } } | null | undefined,
  passed: boolean,
  ticks: number,
): Medal | null {
  if (!passed) return Medal.None;
  return medalForLevel(level ?? { par: { ticks: 1 } }, passed, ticks);
}

/**
 * The ring the viewport throws. An ungraded close takes the same `pass` arc `none` does: the
 * ceremony is the reward for the work, and A7 removes the grade rather than the reward.
 */
export function celebrationFor(medal: Medal | null): 'gold' | 'silver' | 'bronze' | 'pass' {
  return medal === null || medal === 'none' ? 'pass' : medal;
}

/** The die the stamp block presses onto a certificate. Text before colour, `DESK-CONCEPT.md` §6. */
export function stampWordFor(medal: Medal | null): string {
  return medal === null ? 'CLOSED' : MEDAL_WORD[medal].toUpperCase();
}

/**
 * The whole report, read off the store once.
 *
 * The objective rows are the rail's rows rather than rendered strings, so the certificate and the
 * rail can be compared claim for claim — `src/ui/__tests__/rail-report-agreement.test.ts` is the
 * guard, and a snapshot that flattened them to text would have quietly defeated it.
 */
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

  /*
   * Every objective the level declares, required then bonus, in the order the rail draws them.
   * The verdict's copy carries the progress and the level's definition does not, so a bonus missed
   * by two ticks and one missed by two hundred are not the same near-miss.
   */
  const rowFor = (objective: { id: string; label: string }): ReportRow => {
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

  /*
   * The Repository's own line, read off the seed the report is describing. A run that linked the
   * library and never called it says nothing rather than "0 routines", because a zero is a
   * scoreline and this is not one.
   */
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
    seeds: state.seedResults.length > 0 ? state.seedResults.map((result) => result.seed) : level.seeds,
    seedLines: state.seedResults.map((result) => ({
      seed: result.seed,
      passed: result.passed,
      note: result.objectives
        .filter((entry) => !entry.met && !bonusIds.has(entry.id))
        .map((entry) =>
          entry.progress
            ? `${entry.label} (${String(entry.progress[0])}/${String(entry.progress[1])})`
            : entry.label,
        )
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
    commendations: [...state.freshCommendations],
    personalBest: state.personalBest,
    /*
     * On a failure this reports what is *on the record*, not a zero. "no medal · 0 pts" is a
     * scoreline for a run that was never scored, and printing it next to a medal the player
     * already holds reads as taking it away.
     */
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
