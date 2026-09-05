import { useEffect, useRef } from 'react';
import type { JSX } from 'react';
import { useGame } from '../../game/store.ts';
import { useLibrary } from '../../meta/store.ts';
import { audio } from '../audio.ts';
import { REVIEW } from '../copy.ts';
import { fillPlaceholders, reportFor, reviewOwed } from './review.ts';
import './review-memo.css';

/**
 * The Performance Review — a memo from Deputy Site Coordinator M. Vance.
 *
 * It used to be a screen behind a top-bar icon, with a medal wall that restated the site map and
 * eight tabs that re-sliced a number nobody had asked for. Neither playtester opened it once. What
 * was worth keeping is the writing, and writing nobody opens is writing that does not exist, so
 * the memo is now delivered rather than hosted — the ceremony pattern `Requisition` established.
 *
 * The five tiers are NARRATIVE.md §7 verbatim and live in `REVIEW_TIERS`; this renders that data
 * and never restates it. The grade's arithmetic lives in `review.ts`.
 *
 * **It is raised on the site map, never on a run report.** Closing a work order already fires a
 * report, a publish offer and a hardware crate, stacked — the veteran named that as the game's
 * worst transition. The site map is the one screen with no ceremony on it, and a memo waiting for
 * you when you get back is what a memo is. `screen: 'levels'` is also where the game starts, so a
 * memo earned at the end of a session is delivered at the start of the next one whatever the
 * player does in between.
 *
 * One per tier, ever. `reviewedRanks` is in the save.
 */
export function ReviewMemo(): JSX.Element | null {
  const save = useGame((state) => state.save);
  const screen = useGame((state) => state.screen);
  const showResults = useGame((state) => state.showResults);
  const requisition = useGame((state) => state.requisition);
  const offer = useLibrary((state) => state.offer);

  const tier = reviewOwed(save);
  if (!tier) return null;
  if (screen !== 'levels' || showResults || requisition || offer) return null;
  return <Memo key={tier.rank} />;
}

function Memo(): JSX.Element | null {
  const save = useGame((state) => state.save);
  const fileReview = useGame((state) => state.fileReview);
  const primaryRef = useRef<HTMLButtonElement | null>(null);

  const tier = reviewOwed(save);
  const report = reportFor(save);

  useEffect(() => {
    audio.ui('panelOpen');
  }, []);

  // `preventScroll` matters: without it the browser scrolls the button into view and takes the
  // grade line off the top of a short window with it.
  useEffect(() => {
    primaryRef.current?.focus({ preventScroll: true });
  }, []);

  if (!tier) return null;

  const footnotes = tier.legal ?? [];
  const paragraphs = tier.body.split('\n\n');

  return (
    <div className="overlay" role="presentation">
      <div
        className="modal modal--requisition modal--memo"
        role="dialog"
        aria-modal="true"
        aria-label="Performance review"
      >
        <header className="requisition__head">
          <p className="requisition__from numeric">{REVIEW.from}</p>
          <h2 className="requisition__title">{REVIEW.title}</h2>
          <p className="memo__grade">
            GRADE: {tier.grade} · {Math.round(report.percent)}%
          </p>
        </header>

        <div className="requisition__body">
          <dl className="memo__meta numeric">
            <div className="screen-stat">
              <dt>FROM</dt>
              <dd>{REVIEW.author}</dd>
            </div>
            <div className="screen-stat">
              <dt>REVIEWED</dt>
              <dd>{report.closed} work orders</dd>
            </div>
          </dl>

          <div className="memo__body">
            {paragraphs.map((paragraph, index) => (
              <p key={index}>
                {fillPlaceholders(paragraph, tier, report)}
                {footnotes[index] !== undefined ? (
                  <sup className="memo__mark">{index + 1}</sup>
                ) : null}
              </p>
            ))}
          </div>

          <aside className="memo__dot">
            <span className="memo__dot-tag">dot:</span>
            <p>{tier.dot}</p>
          </aside>

          {footnotes.length > 0 ? (
            <ol className="memo__legal">
              {footnotes.map((note, index) => (
                <li key={index}>
                  <sup className="memo__mark">{index + 1}</sup>
                  {note}
                </li>
              ))}
            </ol>
          ) : null}
        </div>

        <footer className="modal__foot">
          <span className="modal__foot-spacer" />
          <button
            type="button"
            className="btn btn--run"
            ref={primaryRef}
            onClick={() => fileReview(tier.rank)}
          >
            {REVIEW.dismiss}
          </button>
        </footer>
      </div>
    </div>
  );
}
