import { useEffect, useRef } from 'react';
import type { Medal } from '../../game/score.ts';
import { countChars, levelPoints, medalFor } from '../../game/score.ts';
import { currentLevel, useGame } from '../../game/store.ts';
import { nextLevel } from '../../levels/index.ts';
import { MedalBadge } from '../components/MedalBadge.tsx';
import {
  BONUS_MET,
  VERDICT_FAIL,
  VERDICT_PASS,
  codeForKind,
  failureLine,
  successLine,
} from '../copy.ts';

const MEDAL_WORD: Record<Medal, string> = {
  gold: 'gold',
  silver: 'silver',
  bronze: 'bronze',
  none: 'no medal',
};

/**
 * The end-of-run report. On a pass it keeps momentum — the next work order is the default action
 * and it is focused, so Enter carries straight on. On a failure it says what failed, on which
 * seed, and offers the jump into the trace at that moment.
 */
export function Results(): React.JSX.Element | null {
  const open = useGame((state) => state.showResults);
  const level = useGame(currentLevel);
  const verdict = useGame((state) => state.verdict);
  const failure = useGame((state) => state.failure);
  const seedResults = useGame((state) => state.seedResults);
  const code = useGame((state) => state.code);
  const dismiss = useGame((state) => state.dismissResults);
  const advance = useGame((state) => state.advanceToNextLevel);
  const jumpToFailure = useGame((state) => state.jumpToFailure);
  const progress = useGame((state) => (level ? state.save.levels[level.id] : undefined));
  const primaryRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (open) primaryRef.current?.focus();
  }, [open]);

  if (!open || !level) return null;

  const passed = verdict?.passed ?? false;
  const ticks = verdict?.stats.ticks ?? 0;
  const chars = countChars(code);
  const medal = medalFor(passed, ticks, level.par.ticks);
  const bonusIds = new Set((level.bonus ?? []).map((objective) => objective.id));
  const stars = (verdict?.objectives ?? []).filter(
    (objective) => objective.met && bonusIds.has(objective.id),
  );
  const failedSeed = seedResults.find((result) => !result.passed);
  const passedSeed = seedResults.find((result) => result.passed);
  const upcoming = nextLevel(level.id);

  // The flavour line goes at the top and the engine's precise reason goes in the box below it,
  // so the same failure never reads as the same sentence twice.
  const headline = passed
    ? successLine(medal, ticks, level.par.ticks)
    : failureLine(codeForKind(failure?.kind) ?? verdict?.failure?.code, ticks);

  return (
    <div className="overlay" role="presentation" onClick={dismiss}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Run report"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal__head">
          <MedalBadge medal={medal} size="lg" />
          <div style={{ minWidth: 0 }}>
            <h2 className={`modal__verdict modal__verdict--${passed ? 'pass' : 'fail'}`}>
              {passed ? VERDICT_PASS : VERDICT_FAIL}
            </h2>
            <p className="modal__line">{headline}</p>
          </div>
        </header>

        <div className="modal__body">
          <div className="score-grid">
            <div className="score-cell">
              <div className="score-cell__label">ticks</div>
              <div className="score-cell__value">{ticks}</div>
              <div className="score-cell__note">
                par {level.par.ticks}
                {progress?.bestTicks !== undefined ? ` · best ${progress.bestTicks}` : ''}
              </div>
            </div>
            <div className="score-cell">
              <div className="score-cell__label">chars</div>
              <div className="score-cell__value">{chars}</div>
              <div className="score-cell__note">
                par {level.par.chars}
                {progress?.bestChars !== undefined ? ` · best ${progress.bestChars}` : ''}
              </div>
            </div>
            <div className="score-cell">
              <div className="score-cell__label">medal</div>
              <div className="score-cell__value" style={{ fontSize: 15, paddingTop: 5 }}>
                {MEDAL_WORD[medal]}
              </div>
              <div className="score-cell__note">
                {levelPoints(medal, stars.length)} pts
                {stars.length > 0 ? ` · ${stars.length} star${stars.length === 1 ? '' : 's'}` : ''}
              </div>
            </div>
          </div>

          {(level.bonus ?? []).length > 0 ? (
            <section style={{ marginBottom: 'var(--space-4)' }}>
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
            <section style={{ marginBottom: 'var(--space-4)' }}>
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
            </div>
          ) : null}
        </div>

        <footer className="modal__foot">
          {!passed ? (
            <button type="button" className="btn" onClick={jumpToFailure}>
              Jump to the failure
            </button>
          ) : null}
          <button type="button" className="btn" onClick={dismiss}>
            Back to the program
          </button>
          {passed ? (
            <button type="button" className="btn btn--run" ref={primaryRef} onClick={advance}>
              {upcoming ? 'Next work order' : 'Site map'}
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
