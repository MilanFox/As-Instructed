import { useCallback, useEffect, useRef } from 'react';
import type { JSX } from 'react';
import { getAchievement } from '../../game/achievements.ts';
import type { Budget, BudgetSource, ObjectiveReading } from '../../game/budgets.ts';
import { budgetFor, budgetReadout, failureCauses } from '../../game/budgets.ts';
import { playbackFor } from '../../game/playback.ts';
import { Medal, levelPoints, medalForLevel, medalOf } from '../../game/score.ts';
import { currentLevel, useGame } from '../../game/store.ts';
import { nextLevel } from '../../levels/index.ts';
// Deep imports on purpose: `src/meta/ui/index.ts` re-exports `LibraryPanel`, which pulls Monaco
// into whatever chunk reaches it, and the report is rendered from the entry chunk.
import { PUBLISH } from '../../meta/copy.ts';
import { useLibrary } from '../../meta/store.ts';
import { MEDAL_BEAT } from '../../audio/index.ts';
import { audio } from '../audio.ts';
import { BudgetBar } from '../components/BudgetBar.tsx';
import { MedalBadge } from '../components/MedalBadge.tsx';
import { useReveal } from '../hooks/useReveal.ts';
import {
  BONUS_MET,
  NO_PENALTY,
  VERDICT_FAIL,
  VERDICT_PASS,
  codeForKind,
  failureLineAt,
  libraryUsageLine,
  personalBestLine,
  successLine,
} from '../copy.ts';

/**
 * The reveal's tempo, in milliseconds.
 *
 * `MEDAL_BEAT` is the interval between the notes of the medal figure, and the renderer mirrors it
 * for the rings (`src/render/renderer.ts`). Staging the whole report on the same grid is what
 * makes the objectives, the medal and the commendations read as one phrase rather than three
 * things that happen to overlap.
 */
const REVEAL_BEAT_MS = Math.round(MEDAL_BEAT * 1000);

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
 *
 * `level` is optional because every hook in the report runs before the screen can bail out on a
 * missing one; the par of 1 is the fallback the report has always used there.
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

/**
 * The end-of-run report.
 *
 * Remounted for every result (`key={resultId}`) so the escalation always starts from nothing — a
 * hook that reset itself on a dependency change would be one `steps`-collision away from a report
 * that arrives already finished.
 */
export function Results(): JSX.Element | null {
  const open = useGame((state) => state.showResults);
  const resultId = useGame((state) => state.resultId);
  if (!open) return null;
  return <ResultsReport key={resultId} />;
}

function ResultsReport(): JSX.Element | null {
  const level = useGame(currentLevel);
  const verdict = useGame((state) => state.verdict);
  const failure = useGame((state) => state.failure);
  const seedResults = useGame((state) => state.seedResults);
  const failureCursor = useGame((state) => state.failureCursor);
  const freshCommendations = useGame((state) => state.freshCommendations);
  const personalBest = useGame((state) => state.personalBest);
  const celebrations = useGame((state) => state.save.settings.celebrations);
  const setCelebrations = useGame((state) => state.setCelebrations);
  const dismiss = useGame((state) => state.dismissResults);
  const advance = useGame((state) => state.advanceToNextLevel);
  const jumpToFailure = useGame((state) => state.jumpToFailure);
  const trace = useGame((state) => state.trace);
  const progress = useGame((state) => (level ? state.save.levels[level.id] : undefined));
  const traceSeed = useGame((state) => state.traceSeed);
  const notice = useLibrary((state) => state.notice);
  const muteNotice = useLibrary((state) => state.muteNotice);
  const primaryRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const passed = verdict?.passed ?? false;
  const ticks = verdict?.stats.ticks ?? 0;
  const medal = reportedMedal(level, passed, ticks);
  const bonusIds = new Set((level?.bonus ?? []).map((objective) => objective.id));
  const required = (verdict?.objectives ?? []).filter((objective) => !bonusIds.has(objective.id));
  const reportedBonus = (verdict?.objectives ?? []).filter((objective) =>
    bonusIds.has(objective.id),
  );
  const stars = reportedBonus.filter((objective) => objective.met);
  /*
   * Budgets are read against the trace the verdict describes — the failing seed's, when a seed
   * failed — so "21 / 16 beams" is the run in front of the player and not a per-seed maximum.
   * The playback is the same memoized walk the rail already paid for, and it carries the progress
   * history that lets a budget whose label names no unit still be attributed to one.
   */
  const playback = playbackFor(level, trace);
  const historyFor = (id: string): readonly { t: number; done: number }[] | undefined =>
    playback?.tracks.find((track) => track.id === id)?.progress;
  const sourceFor = (id: string): BudgetSource => ({
    trace,
    ...(verdict ? { stats: verdict.stats } : {}),
    ...(historyFor(id) ? { history: historyFor(id) } : {}),
  });
  /*
   * Per objective, per seed — the fifteen results a five-objective, three-seed level actually
   * produces. The aggregate verdict already reports each objective from its worst seed; this is
   * what turns that into something a player can read, so a change that trades one layout for
   * another is a chip going red rather than the same sentence twice.
   */
  const multiSeed = seedResults.length > 1;
  const seedMarks = (id: string): { seed: number; met: boolean }[] =>
    seedResults.map((result) => ({
      seed: result.seed,
      met: result.objectives.some((entry) => entry.id === id && entry.met),
    }));
  const closedEverywhere = required.filter((objective) =>
    seedMarks(objective.id).every((mark) => mark.met),
  ).length;
  /*
   * The Repository's own line, read off the seed the report is describing.
   *
   * `libraryUsage` rides on every seed that linked `lib.ts`, so this is measurement, not an
   * estimate — and a run that linked the library and never called it says nothing rather than
   * "0 routines", because a zero is a scoreline and this is not one.
   */
  const reportedSeed = seedResults.find((result) => result.seed === traceSeed) ?? seedResults[0];
  const usage = reportedSeed?.libraryUsage;
  const routinesUsed = usage
    ? Object.values(usage.calls).filter((entry) => entry.calls > 0).length
    : 0;
  const causes = passed
    ? []
    : failureCauses(required, { trace, ...(verdict ? { stats: verdict.stats } : {}) }, sourceFor);
  const commendations = freshCommendations
    .map((id) => getAchievement(id))
    .filter(
      (achievement): achievement is NonNullable<typeof achievement> => achievement !== undefined,
    );

  // Failure is instant. A report that makes you wait to be told it did not work is a punishment,
  // and nothing in this game is allowed to be one.
  const medalStep = required.length + 1;
  const scoreStep = medalStep + 1;
  const commendStep = scoreStep + 1;
  const steps = commendStep + commendations.length;
  const { stage, done, skip } = useReveal(steps, passed && celebrations, REVEAL_BEAT_MS);

  // The viewport is the other half of this sequence: the rings land on the notes, so both are
  // placed from here rather than each firing at t=0 on its own clock (docs/AUDIO.md §8).
  const renderer = useGame((state) => state.renderer);
  const finish = useCallback(() => {
    renderer().skipCelebration();
    skip();
  }, [renderer, skip]);

  // The dialog takes focus the moment it opens, so a screen reader announces the verdict rather
  // than leaving focus on the Run button behind the overlay while the reveal plays.
  useEffect(() => {
    dialogRef.current?.focus({ preventScroll: true });
  }, []);

  // `preventScroll` matters: without it the browser scrolls the footer button into view and takes
  // the medal and the record callout off the top of a short window with it.
  useEffect(() => {
    if (done) primaryRef.current?.focus({ preventScroll: true });
  }, [done]);

  // A failure is announced the instant the report opens. Only the pass escalates.
  useEffect(() => {
    if (passed) return;
    if (failure?.kind === 'compile') audio.ui('compileError');
    else audio.outcome({ passed: false });
  }, [passed, failure?.kind]);

  // The verdict tone opens the panel, ahead of anything the reveal does with the rows.
  useEffect(() => {
    if (passed) audio.verdict(true);
  }, [passed]);

  /*
   * One beat per stage, audio and viewport together.
   *
   * A skip — or reduced motion, or the ceremony switched off — arrives here as a jump of more
   * than one stage. That collapses to the medal alone: fifteen commendation rings fired into the
   * same frame is not a celebration, it is a burst, and the rate limiter would eat most of it
   * anyway (docs/AUDIO.md §5).
   */
  const cued = useRef(0);
  useEffect(() => {
    if (!passed) return;
    const from = cued.current;
    if (stage <= from) return;
    cued.current = stage;
    const collapsed = stage - from > 1;

    if (collapsed) {
      if (stage >= medalStep && from < medalStep) {
        audio.medal(medal ?? undefined);
        renderer().celebrate(celebrationFor(medal));
      }
      return;
    }

    for (let step = from + 1; step <= stage; step++) {
      if (step <= required.length) {
        audio.cue('objective', step);
        renderer().pulse();
      } else if (step === medalStep) {
        audio.medal(medal ?? undefined);
        renderer().celebrate(celebrationFor(medal));
      } else if (step >= commendStep) {
        audio.commend(step - commendStep);
        renderer().pulse('commend');
      }
    }
  }, [stage, passed, required.length, medalStep, commendStep, medal, renderer]);

  if (!level) return null;

  const failedSeed = seedResults.find((result) => !result.passed);
  const passedSeed = seedResults.find((result) => result.passed);
  const upcoming = nextLevel(level.id);

  // The flavour line goes at the top and the engine's precise reason goes in the box below it,
  // so the same failure never reads as the same sentence twice.
  const headline = passed
    ? successLine(medal, ticks, level.par.ticks)
    : failureLineAt(codeForKind(failure?.kind) ?? verdict?.failure?.code, failureCursor);

  const showMedal = !passed || stage >= medalStep;
  const showScores = !passed || stage >= scoreStep;

  return (
    <div
      className={`overlay${passed ? ' overlay--celebrate' : ''}`}
      role="presentation"
      onClick={dismiss}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={`modal modal--report${passed ? ' modal--pass' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Run report"
        onClick={(event) => {
          event.stopPropagation();
          if (!done) finish();
        }}
        onKeyDownCapture={() => {
          if (!done) finish();
        }}
      >
        <header className="modal__head">
          <span className={showMedal ? 'medal-land medal-land--in' : 'medal-land'}>
            <MedalBadge medal={medal} size="lg" />
          </span>
          <div style={{ minWidth: 0 }}>
            <h2 className={`modal__verdict modal__verdict--${passed ? 'pass' : 'fail'}`}>
              {passed ? VERDICT_PASS : VERDICT_FAIL}
            </h2>
            <p className="modal__line">{headline}</p>
          </div>
        </header>

        <div className="modal__body">
          {/*
           * The report leads with the cause, not with the flavour.
           *
           * A red row in a list of five is a puzzle in itself; a player who overran a budget has
           * to be told which budget and by how much before they are told anything else, or the
           * next thing they do is guess. Ranked worst-first when several went wrong, because the
           * biggest miss is the one worth opening the editor for.
           */}
          {causes.length > 0 ? (
            <section className="cause" aria-label="Why this run failed">
              <div className="cause__head">
                {causes.length === 1 ? 'this is why' : `${causes.length} things went wrong`}
              </div>
              {causes.map((cause) => (
                <div
                  key={cause.id}
                  className={`cause__row${cause.budget && cause.budget.over > 0 ? ' cause__row--over' : ''}`}
                >
                  <span className="cause__label">{cause.label}</span>
                  <span className="cause__detail numeric">{cause.detail}</span>
                  {cause.budget ? (
                    <>
                      <span className="cause__readout numeric">{budgetReadout(cause.budget)}</span>
                      <BudgetBar budget={cause.budget} />
                    </>
                  ) : null}
                  {/*
                   * The diff, when the objective could name one point. `0 of 5 — 5 short` is the
                   * count; this is the line, cell or tick it went wrong on, and it is deliberately
                   * two values and three words rather than a sentence explaining them.
                   */}
                  {cause.divergence ? (
                    <div className="cause__diff numeric">
                      <span className="cause__diff-where">{cause.divergence.where}</span>
                      <span className="cause__diff-tag">want</span>
                      <span className="cause__diff-value cause__diff-value--want">
                        {cause.divergence.expected}
                      </span>
                      <span className="cause__diff-tag">got</span>
                      <span className="cause__diff-value cause__diff-value--got">
                        {cause.divergence.received}
                      </span>
                    </div>
                  ) : null}
                </div>
              ))}
            </section>
          ) : null}

          {required.length > 0 ? (
            <section className="report-section">
              <div className="rail__label">
                objectives
                {multiSeed ? (
                  <span className="rail__label-note numeric">
                    {closedEverywhere}/{required.length} closed on every seed
                  </span>
                ) : null}
              </div>
              {required.map((objective, index) => (
                <ReportObjective
                  key={objective.id}
                  objective={objective}
                  source={sourceFor(objective.id)}
                  shown={!passed || stage > index}
                  {...(multiSeed ? { seeds: seedMarks(objective.id) } : {})}
                />
              ))}
            </section>
          ) : null}

          {personalBest && showScores ? (
            <div className="record">
              <span className="record__tag">RECORD</span>
              <span className="record__numbers numeric">
                {personalBest.now} <span className="record__was">was {personalBest.previous}</span>
              </span>
              <span className="record__line">
                {personalBestLine(personalBest.previous, personalBest.now)}
              </span>
            </div>
          ) : null}

          <div className={showScores ? 'score-grid score-grid--in' : 'score-grid score-grid--out'}>
            <div className="score-cell">
              <div className="score-cell__label">ticks</div>
              <div className="score-cell__value">{ticks}</div>
              <div className="score-cell__note">
                par {level.par.ticks}
                {progress?.bestTicks !== undefined ? ` · best ${progress.bestTicks}` : ''}
              </div>
            </div>
            {/*
             * On a failure this cell reports what is *on the record*, not a zero.
             * "no medal · 0 pts" is a scoreline for a run that was never scored, and printing it
             * next to a medal the player already holds reads as taking it away.
             */}
            {passed ? (
              <div className="score-cell">
                {/* An ungraded work order has no medal cell to fill, so the cell is not headed
                    `medal` — it reports the result, and the result is that it is closed. */}
                <div className="score-cell__label">{medal === null ? 'result' : 'medal'}</div>
                <div className="score-cell__value score-cell__value--word">{resultWord(medal)}</div>
                <div className="score-cell__note">
                  {levelPoints(medal, stars.length)} pts
                  {stars.length > 0
                    ? ` · ${stars.length} star${stars.length === 1 ? '' : 's'}`
                    : ''}
                </div>
              </div>
            ) : (
              <div className="score-cell">
                <div className="score-cell__label">on record</div>
                <div className="score-cell__value score-cell__value--word">
                  {progress?.completed ? resultWord(medalOf(level, progress)) : 'still open'}
                </div>
                <div className="score-cell__note">
                  {progress?.completed ? 'this run changed nothing' : 'nothing to lose'}
                </div>
              </div>
            )}
            <div className="score-cell">
              <div className="score-cell__label">seeds</div>
              <div className="score-cell__value">{seedResults.length || level.seeds.length}</div>
              <div className="score-cell__note">
                {seedResults.length > 0 && seedResults.every((result) => result.passed)
                  ? 'all layouts'
                  : 'layouts run'}
              </div>
            </div>
          </div>

          {usage && routinesUsed > 0 ? (
            <p className="modal__line modal__line--quiet">
              {libraryUsageLine(routinesUsed, usage.ticks)}
            </p>
          ) : null}

          {commendations.length > 0 ? (
            <section className="report-section">
              <div className="rail__label">commendations</div>
              {commendations.map((achievement, index) => (
                <div
                  key={achievement.id}
                  className={
                    stage >= commendStep + index ? 'commend commend--in' : 'commend commend--out'
                  }
                >
                  <span className="commend__seal" aria-hidden="true">
                    ★
                  </span>
                  <div className="commend__text">
                    <p className="commend__title">{achievement.title}</p>
                    <p className="commend__note">{achievement.note}</p>
                  </div>
                </div>
              ))}
            </section>
          ) : null}

          {(level.bonus ?? []).length > 0 ? (
            <section className="report-section">
              <div className="rail__label">bonus objectives</div>
              {(level.bonus ?? []).map((objective) => {
                // The verdict's copy carries the progress; the level's definition does not. A bonus
                // missed by two ticks and one missed by two hundred are not the same near-miss.
                const reading = reportedBonus.find((entry) => entry.id === objective.id) ?? {
                  id: objective.id,
                  label: objective.label,
                  met: false,
                };
                return (
                  <ReportObjective
                    key={objective.id}
                    objective={reading}
                    source={sourceFor(objective.id)}
                    shown
                    bonus
                  />
                );
              })}
              {/* No star is recorded for a failed run, so saying one was earned would be a lie. */}
              {passed && stars.length > 0 ? <p className="modal__line">{BONUS_MET}</p> : null}
            </section>
          ) : null}

          {multiSeed ? (
            <section className="report-section">
              <div className="rail__label">seeds</div>
              {seedResults.map((result) => {
                const outstanding = result.objectives.filter(
                  (entry) => !entry.met && !bonusIds.has(entry.id),
                );
                return (
                  <div className="seed-row" key={result.seed}>
                    <span className="tag">seed {result.seed}</span>
                    <span style={{ color: result.passed ? 'var(--ok)' : 'var(--danger)' }}>
                      {result.passed ? 'passed' : 'failed'}
                    </span>
                    <span style={{ color: 'var(--ink-dim)' }}>{result.ticks} ticks</span>
                    {/* Naming the objective is the whole point: "seed 4 failed" and "seed 4 failed
                        the quota, eleven of fifteen" are not the same bug report. */}
                    {outstanding.length > 0 ? (
                      <span className="seed-row__outstanding">
                        {outstanding
                          .map((entry) =>
                            entry.progress
                              ? `${entry.label} (${String(entry.progress[0])}/${String(entry.progress[1])})`
                              : entry.label,
                          )
                          .join(' · ')}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </section>
          ) : null}

          {/* The Repository's half of a closed work order. It asks for nothing, so it is a line on
              the report rather than the fourth modal on the same transition. */}
          {passed && notice ? (
            <section className="report-section">
              <div className="rail__label">{PUBLISH.noticeLabel}</div>
              <p className="modal__line">
                {notice.nested.length > 0
                  ? PUBLISH.noticeNested(notice.nested)
                  : PUBLISH.noticeNothing}
              </p>
              <button
                type="button"
                className="modal__quiet"
                onClick={(event) => {
                  event.stopPropagation();
                  muteNotice();
                }}
                title="Stop the Repository asking"
              >
                stop offering
              </button>
            </section>
          ) : null}

          {!passed ? (
            <div className="failure-box">
              <div className="failure-box__code">
                {verdict?.failure?.code ?? failure?.kind ?? 'unknown'}
                {failedSeed ? ` · seed ${failedSeed.seed}` : ''}
                {failure?.line !== undefined ? ` · line ${failure.line}` : ''}
              </div>
              <p className="failure-box__message">
                {failure?.message ?? verdict?.failure?.message ?? headline}
              </p>
              {passedSeed && failedSeed ? (
                <p className="failure-box__message" style={{ color: 'var(--ink-dim)' }}>
                  It passed on seed {passedSeed.seed}. The field is not always the same field.
                </p>
              ) : null}
              <p className="failure-box__note">{NO_PENALTY}</p>
            </div>
          ) : null}
        </div>

        <footer className="modal__foot">
          {passed && celebrations ? (
            <button
              type="button"
              className="modal__quiet"
              onClick={(event) => {
                event.stopPropagation();
                setCelebrations(false);
              }}
              title="Show future reports all at once"
            >
              skip the ceremony
            </button>
          ) : null}
          {passed && !celebrations ? (
            <button
              type="button"
              className="modal__quiet"
              onClick={(event) => {
                event.stopPropagation();
                setCelebrations(true);
              }}
              title="Let future reports arrive one line at a time"
            >
              ceremony off
            </button>
          ) : null}
          <span className="modal__foot-spacer" />
          {!passed ? (
            <button type="button" className="btn" onClick={jumpToFailure}>
              Jump to the failure
            </button>
          ) : null}
          <button type="button" className="btn" onClick={dismiss}>
            Back to the program
          </button>
          {passed ? (
            <button
              type="button"
              className="btn btn--run btn--next"
              ref={primaryRef}
              onClick={advance}
            >
              {upcoming ? (
                <>
                  <span className="btn__next-label">Next work order</span>
                  <span className="btn__next-id numeric">
                    {upcoming.id} · {upcoming.title}
                  </span>
                </>
              ) : (
                'Site map'
              )}
            </button>
          ) : (
            <button type="button" className="btn btn--run" ref={primaryRef} onClick={dismiss}>
              Try again
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

/**
 * One objective in the report, in whichever shape it is.
 *
 * The rail and the report have to agree — a budget that read as a gauge while the run played and
 * as a tick-box in the report is two different claims about the same number.
 */
function ReportObjective({
  objective,
  source,
  shown,
  bonus = false,
  seeds,
}: {
  objective: ObjectiveReading;
  source: BudgetSource;
  shown: boolean;
  bonus?: boolean;
  seeds?: { seed: number; met: boolean }[];
}): JSX.Element {
  const budget: Budget | null = budgetFor(objective, source);
  const over = budget !== null && budget.over > 0;
  return (
    <div
      className={[
        'objective',
        'objective--report',
        bonus ? 'objective--bonus' : '',
        objective.met ? 'objective--met' : 'objective--pending',
        shown ? 'objective--landed' : 'objective--waiting',
        budget ? 'objective--budget' : '',
        over ? 'objective--over' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="objective__mark" aria-hidden="true">
        {!shown ? '' : over ? '!' : objective.met && !budget ? '✓' : ''}
      </span>
      <span className="objective__label">{objective.label}</span>
      {/*
        The same word the rail uses, for the same reason: par is a medal, a limit is a failure.
        Never on a bonus — a bonus threshold costs a star and ends nothing, so calling it a limit
        would be the confusion this word exists to undo, pointed the other way.
      */}
      {!bonus && budget?.meter?.kind === 'ticks' ? (
        <span className="objective__gate">limit</span>
      ) : null}
      {budget ? (
        <span className={`objective__progress${over ? ' objective__progress--over' : ''}`}>
          {budgetReadout(budget)}
        </span>
      ) : objective.progress ? (
        <span className="objective__progress">
          {objective.progress[0]}/{objective.progress[1]}
        </span>
      ) : null}
      {seeds ? <SeedStrip seeds={seeds} /> : null}
      {budget ? <BudgetBar budget={budget} /> : null}
    </div>
  );
}

/**
 * One chip per seed, green where this objective held and red where it did not.
 *
 * The smallest thing that answers "which layout is it still open on", which is the question a
 * player asks after a three-line change moves the failure from one seed to another.
 */
function SeedStrip({ seeds }: { seeds: { seed: number; met: boolean }[] }): JSX.Element {
  const missed = seeds.filter((entry) => !entry.met).map((entry) => entry.seed);
  return (
    <span className="objective__seeds">
      {seeds.map((entry) => (
        <span
          key={entry.seed}
          className={`seed-chip${entry.met ? ' seed-chip--met' : ' seed-chip--missed'}`}
          aria-hidden="true"
        >
          {entry.seed}
        </span>
      ))}
      <span className="sr-only">
        {missed.length === 0
          ? 'held on every seed'
          : `still open on ${missed.length === 1 ? 'seed' : 'seeds'} ${missed.join(', ')}`}
      </span>
    </span>
  );
}
