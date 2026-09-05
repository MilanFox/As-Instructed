import { useEffect, useRef } from 'react';
import type { JSX } from 'react';
import { getAchievement } from '../../game/achievements.ts';
import type { Medal } from '../../game/score.ts';
import { levelPoints, medalFor } from '../../game/score.ts';
import { currentLevel, useGame } from '../../game/store.ts';
import { nextLevel } from '../../levels/index.ts';
import { audio } from '../audio.ts';
import { MedalBadge } from '../components/MedalBadge.tsx';
import { useReveal } from '../hooks/useReveal.ts';
import {
  BONUS_MET,
  NO_PENALTY,
  VERDICT_FAIL,
  VERDICT_PASS,
  codeForKind,
  failureLineAt,
  personalBestLine,
  successLine,
} from '../copy.ts';

const MEDAL_WORD: Record<Medal, string> = {
  gold: 'gold',
  silver: 'silver',
  bronze: 'bronze',
  none: 'no medal',
};

const MEDAL_SOUND: Record<Medal, 'medalGold' | 'medalSilver' | 'medalBronze' | null> = {
  gold: 'medalGold',
  silver: 'medalSilver',
  bronze: 'medalBronze',
  none: null,
};

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
  const streak = useGame((state) => state.save.stats.streak);
  const celebrations = useGame((state) => state.save.settings.celebrations);
  const setCelebrations = useGame((state) => state.setCelebrations);
  const dismiss = useGame((state) => state.dismissResults);
  const advance = useGame((state) => state.advanceToNextLevel);
  const jumpToFailure = useGame((state) => state.jumpToFailure);
  const progress = useGame((state) => (level ? state.save.levels[level.id] : undefined));
  const primaryRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const passed = verdict?.passed ?? false;
  const ticks = verdict?.stats.ticks ?? 0;
  const medal = medalFor(passed, ticks, level?.par.ticks ?? 1);
  const bonusIds = new Set((level?.bonus ?? []).map((objective) => objective.id));
  const required = (verdict?.objectives ?? []).filter((objective) => !bonusIds.has(objective.id));
  const stars = (verdict?.objectives ?? []).filter(
    (objective) => objective.met && bonusIds.has(objective.id),
  );
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
  const { stage, done, skip } = useReveal(steps, passed && celebrations);

  // The dialog takes focus the moment it opens, so a screen reader announces the verdict rather
  // than leaving focus on the Run button behind the overlay while the reveal plays.
  useEffect(() => {
    dialogRef.current?.focus({ preventScroll: true });
  }, []);

  // `preventScroll` matters: without it the browser scrolls the footer button into view and takes
  // the medal, the streak and the record callout off the top of a short window with it.
  useEffect(() => {
    if (done) primaryRef.current?.focus({ preventScroll: true });
  }, [done]);

  // A failure is announced the instant the report opens. Only the pass escalates.
  useEffect(() => {
    if (passed) return;
    if (failure?.kind === 'compile') audio.ui('compileError');
    else audio.outcome({ passed: false });
  }, [passed, failure?.kind]);

  const cued = useRef(0);
  useEffect(() => {
    if (!passed) return;
    for (let step = cued.current + 1; step <= stage; step++) {
      if (step <= required.length) audio.cue('objective', step);
      else if (step === medalStep) {
        audio.outcome({ passed: true, medal });
        const sound = MEDAL_SOUND[medal];
        if (sound) audio.cue(sound);
      } else if (step >= commendStep) audio.cue('objective', step * 7);
    }
    cued.current = Math.max(cued.current, stage);
  }, [stage, passed, required.length, medalStep, commendStep, medal]);

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
    <div className="overlay" role="presentation" onClick={dismiss}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={`modal modal--report${passed ? ' modal--pass' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Run report"
        onClick={(event) => {
          event.stopPropagation();
          if (!done) skip();
        }}
        onKeyDownCapture={() => {
          if (!done) skip();
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
          {passed && streak >= 2 ? (
            <span className="streak" title="Consecutive closes with no failed run">
              <span className="streak__count numeric">{streak}</span>
              <span className="streak__label">in a row</span>
            </span>
          ) : null}
        </header>

        <div className="modal__body">
          {required.length > 0 ? (
            <section className="report-section">
              <div className="rail__label">objectives</div>
              {required.map((objective, index) => {
                const shown = !passed || stage > index;
                return (
                  <div
                    key={objective.id}
                    className={[
                      'objective',
                      'objective--report',
                      objective.met ? 'objective--met' : 'objective--pending',
                      shown ? 'objective--landed' : 'objective--waiting',
                    ].join(' ')}
                  >
                    <span className="objective__mark" aria-hidden="true">
                      {shown && objective.met ? '✓' : ''}
                    </span>
                    <span className="objective__label">{objective.label}</span>
                    {objective.progress ? (
                      <span className="objective__progress">
                        {objective.progress[0]}/{objective.progress[1]}
                      </span>
                    ) : null}
                  </div>
                );
              })}
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
                <div className="score-cell__label">medal</div>
                <div className="score-cell__value score-cell__value--word">{MEDAL_WORD[medal]}</div>
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
                  {progress?.completed ? MEDAL_WORD[progress.medal] : 'still open'}
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
                const met = stars.some((star) => star.id === objective.id);
                return (
                  <div
                    key={objective.id}
                    className={`objective objective--bonus ${met ? 'objective--met' : 'objective--pending'}`}
                  >
                    <span className="objective__mark" aria-hidden="true" />
                    <span className="objective__label">{objective.label}</span>
                  </div>
                );
              })}
              {stars.length > 0 ? <p className="modal__line">{BONUS_MET}</p> : null}
            </section>
          ) : null}

          {seedResults.length > 1 ? (
            <section className="report-section">
              <div className="rail__label">seeds</div>
              {seedResults.map((result) => (
                <div className="seed-row" key={result.seed}>
                  <span className="tag">seed {result.seed}</span>
                  <span style={{ color: result.passed ? 'var(--ok)' : 'var(--danger)' }}>
                    {result.passed ? 'passed' : 'failed'}
                  </span>
                  <span style={{ color: 'var(--ink-dim)' }}>{result.ticks} ticks</span>
                </div>
              ))}
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
