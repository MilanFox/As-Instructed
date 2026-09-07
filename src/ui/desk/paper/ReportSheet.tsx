/**
 * The certificate of closure, and the HALT notice.
 *
 * These are the same document twice: what a run left behind. The one difference that matters is
 * that a certificate has an empty box on it and the grade is not in it yet — the stamp block is
 * the thing that closes a work order, and until it has been pressed the sheet is unfinished
 * business lying on your desk. A HALT notice arrives already filed by site systems, because
 * nothing was asked of you.
 *
 * **It is a snapshot and never a live read.** The most information-dense card in the game used to
 * be one stray click from gone. `ReportSnapshot` freezes it at the moment the run finished, so
 * running again issues a second sheet rather than rewriting the first.
 *
 * The objective rows are rendered from the same four claims the rail makes — gauge, over, limit,
 * readout — because a budget that read as a gauge while the run played and as a tick-box on the
 * certificate is two different claims about one number.
 */
import { useCallback, useEffect, useRef } from 'react';

import { getAchievement } from '../../../game/achievements.ts';
import { budgetReadout } from '../../../game/budgets.ts';
import { useGame } from '../../../game/store.ts';
import { MEDAL_BEAT } from '../../../audio/index.ts';
import { audio } from '../../audio.ts';
import { BudgetBar } from '../../components/BudgetBar.tsx';
import { MedalBadge } from '../../components/MedalBadge.tsx';
import { NO_PENALTY, VERDICT_FAIL, VERDICT_PASS, personalBestLine } from '../../copy.ts';
import { useReveal } from '../../hooks/useReveal.ts';
import type { ReportRow, ReportSnapshot } from './papers.ts';
import { celebrationFor, resultWord, stampWordFor } from './report.ts';

/**
 * The reveal's tempo, in milliseconds.
 *
 * `MEDAL_BEAT` is the interval between the notes of the medal figure, and the renderer mirrors it
 * for the rings (`src/render/renderer.ts`). Staging the whole report on the same grid is what
 * makes the objectives, the medal and the commendations read as one phrase rather than three
 * things that happen to overlap.
 */
const REVEAL_BEAT_MS = Math.round(MEDAL_BEAT * 1000);

/** What each die says under its word. The stamp block presses one of these on; we print it. */
const STAMP_SUB: Record<string, string> = {
  gold: 'AT PAR OR UNDER',
  silver: 'UP TO A QUARTER OVER',
  bronze: 'A PASS',
  closed: 'NO NOTES',
};

export function ReportSheet({
  report,
  mark,
  fresh = false,
}: {
  report: ReportSnapshot;
  mark?: string | null;
  fresh?: boolean;
}): React.JSX.Element {
  const celebrations = useGame((state) => state.save.settings.celebrations);
  const renderer = useGame((state) => state.renderer);

  const required = report.objectives.filter((row) => !row.bonus);
  const bonus = report.objectives.filter((row) => row.bonus);
  const commendations = report.commendations
    .map((id) => getAchievement(id))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined);

  // Failure is instant. A report that makes you wait to be told it did not work is a punishment,
  // and nothing in this game is allowed to be one.
  const medalStep = required.length + 1;
  const scoreStep = medalStep + 1;
  const commendStep = scoreStep + 1;
  const steps = commendStep + commendations.length;
  const escalate = fresh && report.passed && celebrations;
  const { stage, done, skip } = useReveal(steps, escalate, REVEAL_BEAT_MS);

  const finish = useCallback(() => {
    renderer().skipCelebration();
    skip();
  }, [renderer, skip]);

  /*
   * One beat per stage, audio and viewport together — but only on the sheet as it arrives. A
   * certificate re-read a week later is paper, and paper does not play a fanfare.
   */
  const cued = useRef(0);
  useEffect(() => {
    if (!fresh || !report.passed) return;
    const from = cued.current;
    if (stage <= from) return;
    cued.current = stage;
    const collapsed = stage - from > 1;

    if (collapsed) {
      if (stage >= medalStep && from < medalStep) {
        audio.medal(report.medal ?? undefined);
        renderer().celebrate(celebrationFor(report.medal));
      }
      return;
    }

    for (let step = from + 1; step <= stage; step++) {
      if (step <= required.length) {
        audio.cue('objective', step);
        renderer().pulse();
      } else if (step === medalStep) {
        audio.medal(report.medal ?? undefined);
        renderer().celebrate(celebrationFor(report.medal));
      } else if (step >= commendStep) {
        audio.commend(step - commendStep);
        renderer().pulse('commend');
      }
    }
  }, [stage, fresh, report.passed, report.medal, required.length, medalStep, commendStep, renderer]);

  const showMedal = !report.passed || stage >= medalStep;
  const showScores = !report.passed || stage >= scoreStep;

  return (
    <div
      className="report"
      onClickCapture={() => {
        if (!done) finish();
      }}
    >
      <h1>
        <b>{report.passed ? 'CERTIFICATE OF CLOSURE' : 'HALT NOTICE'}</b>
        <span>{report.levelId.toUpperCase()}</span>
      </h1>

      <header className="report__head">
        <span className={showMedal ? 'medal-land medal-land--in' : 'medal-land'}>
          <MedalBadge medal={report.medal} size="lg" />
        </span>
        <div className="report__verdict">
          <h2>{report.passed ? VERDICT_PASS : VERDICT_FAIL}</h2>
          {/* Grade is text before it is colour: the word survives
              hue removal and it survives the Signal direction. */}
          {report.passed ? <span className="report__die">{stampWordFor(report.medal)}</span> : null}
          <p className="quiet">{report.headline}</p>
        </div>
      </header>

      {/*
       * The report leads with the cause, not with the flavour. A red row in a list of five is a
       * puzzle in itself; a player who overran a budget has to be told which budget and by how
       * much before they are told anything else. Ranked worst-first when several went wrong.
       */}
      {report.causes.length > 0 ? (
        <section className="cause" aria-label="Why this run failed">
          <div className="cause__head">
            {report.causes.length === 1
              ? 'this is why'
              : `${String(report.causes.length)} things went wrong`}
          </div>
          {report.causes.map((cause) => (
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
                    {cause.divergence.want}
                  </span>
                  <span className="cause__diff-tag">got</span>
                  <span className="cause__diff-value cause__diff-value--got">
                    {cause.divergence.got}
                  </span>
                </div>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      {required.length > 0 ? (
        <section className="report__section">
          <div className="report__label">objectives</div>
          {required.map((row, index) => (
            <ReportObjective key={row.id} row={row} shown={!report.passed || stage > index} />
          ))}
        </section>
      ) : null}

      {report.personalBest && showScores ? (
        <div className="record">
          <span className="record__tag">RECORD</span>
          <span className="record__numbers numeric">
            {report.personalBest.now}{' '}
            <span className="record__was">was {report.personalBest.previous}</span>
          </span>
          <span className="record__line">
            {personalBestLine(report.personalBest.previous, report.personalBest.now)}
          </span>
        </div>
      ) : null}

      <div className={showScores ? 'facts facts--in' : 'facts facts--out'}>
        <div>
          <b>ticks</b>
          <span className="numeric">
            {report.ticks ?? '—'}
            {report.par !== null ? <span className="quiet"> par {report.par}</span> : null}
            {/* The slot par would have stood in, saying why it does not. Printing nothing here
                is a fact the player can only read once they have seen a certificate that does
                print one, and the first two work orders on the site are both ungraded. */}
            {report.graded ? null : <span className="quiet"> not graded</span>}
            {report.bestTicks !== null ? (
              <span className="quiet"> · best {report.bestTicks}</span>
            ) : null}
          </span>
        </div>
        {report.passed ? (
          <div>
            {/* An ungraded work order has no medal cell to fill, so the cell is not headed
                `medal` — it reports the result, and the result is that it is closed. */}
            <b>{report.medal === null ? 'result' : 'medal'}</b>
            <span>
              {resultWord(report.medal)}
              <span className="quiet">
                {' '}
                · {report.points ?? 0} pts
                {report.stars > 0
                  ? ` · ${String(report.stars)} star${report.stars === 1 ? '' : 's'}`
                  : ''}
              </span>
            </span>
          </div>
        ) : report.onRecord ? (
          <div>
            <b>on record</b>
            <span>
              {report.onRecord.word}
              <span className="quiet"> · {report.onRecord.note}</span>
            </span>
          </div>
        ) : null}
        <div>
          <b>seeds</b>
          <span className="numeric">
            <SeedSummary report={report} />
          </span>
        </div>
      </div>

      {report.libraryLine ? <p className="quiet">{report.libraryLine}</p> : null}

      {commendations.length > 0 ? (
        <section className="report__section">
          <div className="report__label">commendations</div>
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

      {bonus.length > 0 ? (
        <section className="report__section">
          <div className="report__label">bonus — worth a star</div>
          {bonus.map((row) => (
            <ReportObjective key={row.id} row={row} shown />
          ))}
        </section>
      ) : null}

      {/*
       * The code and the seed, once. The objective's name used to be printed in
       * the cause row, again in the objectives list and again here. The causes above already say
       * which objective and by how much, so the engine's own sentence is only printed where there
       * is no cause to have said it.
       */}
      {!report.passed ? (
        <div className="failure-box">
          <div className="failure-box__code numeric">
            {report.failureCode ?? 'unknown'}
            {report.failureSeed !== null ? ` · seed ${String(report.failureSeed)}` : ''}
            {report.failureLine !== null ? ` · line ${String(report.failureLine)}` : ''}
          </div>
          {report.causes.length === 0 && report.failure ? (
            <p className="failure-box__message">{report.failure}</p>
          ) : null}
          {report.passedSeed !== null ? (
            <p className="failure-box__message quiet">
              It passed on seed {report.passedSeed}. The field is not always the same field.
            </p>
          ) : null}
          <p className="failure-box__note">{NO_PENALTY}</p>
        </div>
      ) : null}

      {report.passed ? (
        <div className={mark ? 'stampbox filled' : 'stampbox'} data-stampbox>
          {mark ? (
            <div className={`inked ${mark.toLowerCase()}`}>
              {mark.toUpperCase()}
              <small>{STAMP_SUB[mark.toLowerCase()] ?? 'ENTERED ON THE RECORD'}</small>
            </div>
          ) : (
            /*
             * The box says what to do, on the face of the document. Three of the four dies in the
             * block are the company's and inert — you do not grade yourself — so `AFFIX GRADE`
             * named a thing the player cannot do. This is the move that closed F4: the control's
             * instruction belongs where the player's eye already is, not in a tooltip and not in a
             * tutorial.
             */
            <span className="stampbox__ask">
              <b>AFFIX CLOSURE</b>
              Press the {stampWordFor(null)} die from the block onto this box. Until it is stamped,
              the work order stays open on the record.
            </span>
          )}
        </div>
      ) : (
        <div className="stampbox filled stampbox--auto">
          <div className="inked halt">
            FILED
            <small>NO ACTION REQUIRED</small>
          </div>
        </div>
      )}

      <div className="foot">
        {report.passed
          ? 'Closure of a work order does not constitute acceptance of the work.'
          : 'Attempts are not recorded against you. This notice is issued for completeness.'}
      </div>
      <div className="ref">
        KD-{report.levelId.toUpperCase()} · {report.passed ? 'CLOSURE' : 'HALT'}
      </div>
    </div>
  );
}

/**
 * The per-seed breakdown, costing space in proportion to what it reveals.
 *
 * Five rows, character-for-character identical, is the *common* case. Identical outcomes
 * collapse to one line; disagreement expands to the list, which is
 * exactly the case the list exists to reveal.
 */
function SeedSummary({ report }: { report: ReportSnapshot }): React.JSX.Element {
  const lines = report.seedLines;
  if (lines.length === 0) {
    return <>{report.seeds.length} layouts run</>;
  }
  const shapes = new Set(lines.map((line) => `${String(line.passed)}|${line.note}`));
  if (shapes.size === 1) {
    const one = lines[0] as (typeof lines)[number];
    return (
      <>
        {lines.length} / {lines.length}
        <span className="quiet">
          {' '}
          {one.passed
            ? 'closed on every seed'
            : `failed on every seed — ${one.note || 'the objective is still open'}`}
        </span>
      </>
    );
  }
  return (
    <>
      {lines.filter((line) => line.passed).length} / {lines.length}
      {lines.map((line) => (
        <span key={line.seed} className="seed-row">
          <span className="tag">seed {line.seed}</span>
          <span className={line.passed ? 'seed-row--ok' : 'seed-row--bad'}>
            {line.passed ? 'passed' : 'failed'}
          </span>
          {line.note ? <span className="seed-row__outstanding">{line.note}</span> : null}
        </span>
      ))}
    </>
  );
}

/**
 * One objective, as a tick-box or as a gauge — the same shapes the rail draws, from the same four
 * claims. `src/ui/__tests__/rail-report-agreement.test.ts` compares them row for row.
 */
function ReportObjective({ row, shown }: { row: ReportRow; shown: boolean }): React.JSX.Element {
  const budget = row.budget;
  const over = budget !== undefined && budget.over > 0;
  return (
    <div
      className={[
        'objective',
        'objective--report',
        row.bonus ? 'objective--bonus' : '',
        row.met ? 'objective--met' : 'objective--pending',
        shown ? 'objective--landed' : 'objective--waiting',
        budget ? 'objective--budget' : '',
        over ? 'objective--over' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="objective__mark" aria-hidden="true">
        {!shown ? '' : over ? '!' : row.met && !budget ? '✓' : ''}
      </span>
      <span className="objective__label">{row.label}</span>
      {/*
        The same word the rail uses, for the same reason: par is a medal, a limit is a failure.
        Never on a bonus — a bonus threshold costs a star and ends nothing.
      */}
      {!row.bonus && budget?.meter?.kind === 'ticks' ? (
        <span className="objective__gate">limit</span>
      ) : null}
      {budget ? (
        <span className={`objective__progress${over ? ' objective__progress--over' : ''}`}>
          {budgetReadout(budget)}
        </span>
      ) : row.progress ? (
        <span className="objective__progress">
          {row.progress[0]}/{row.progress[1]}
        </span>
      ) : null}
      {row.seeds ? <SeedStrip seeds={row.seeds} /> : null}
      {budget ? <BudgetBar budget={budget} /> : null}
    </div>
  );
}

/**
 * One chip per seed, green where this objective held and red where it did not. The smallest thing
 * that answers "which layout is it still open on".
 */
function SeedStrip({
  seeds,
}: {
  seeds: readonly { seed: number; met: boolean }[];
}): React.JSX.Element {
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
