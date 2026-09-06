import type { JSX } from 'react';
import { ACHIEVEMENTS } from '../../game/achievements.ts';

/** The anchor the header's count points at (docs/AUDIT-UI.md F14). */
export const SHELF_ID = 'commendations';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sept',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * When it was noticed.
 *
 * `save.achievements[id]` has held the epoch ms each commendation was earned since the day it was
 * written, and nothing has ever printed it, so one earned in the first hour and one earned last
 * week read identically. The date is the whole difference between a list of five things and a
 * record of what you did.
 */
export function earnedOn(at: number): string {
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return 'earned';
  return `earned ${when.getDate()} ${MONTHS[when.getMonth()] ?? ''}`.trimEnd();
}

/**
 * Every commendation, earned and unearned, in one place.
 *
 * Unearned ones show their requirement rather than being hidden behind a question mark: a
 * commendation is only tempting if you know what it wants, and nothing in the game is gated on
 * one, so there is nothing to spoil.
 *
 * No fraction. The head used to read `2/5` against a list that has been fifteen and is now five
 * (DESIGN.md §11 A9), and a denominator that moves is a completion bar the player cannot act on —
 * at fifteen it was unreachable, and at five `1/5` reads as failing at something nothing in the
 * game asks of them. The list is the readout; five rows say five without counting them.
 */
export function CommendationShelf({
  achievements,
}: {
  achievements: Record<string, number>;
}): JSX.Element {
  return (
    <section className="shelf" id={SHELF_ID} aria-label="Commendations" tabIndex={-1}>
      <header className="shelf__head">
        <h2 className="shelf__title">COMMENDATIONS</h2>
        <p className="shelf__aside">
          For information only. Nothing on this site is gated behind any of them.
        </p>
      </header>

      <ul className="shelf__list">
        {ACHIEVEMENTS.map((achievement) => {
          const at = achievements[achievement.id];
          const has = at !== undefined;
          return (
            <li
              key={achievement.id}
              className={has ? 'commend commend--earned' : 'commend commend--locked'}
            >
              <span className="commend__seal" aria-hidden="true">
                {has ? '★' : '☆'}
              </span>
              <div className="commend__text">
                <p className="commend__title">{achievement.title}</p>
                <p className="commend__note">{has ? achievement.note : achievement.requirement}</p>
                {has ? <p className="commend__when numeric">{earnedOn(at)}</p> : null}
              </div>
              <span className="sr-only">{has ? 'earned' : 'not yet earned'}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
