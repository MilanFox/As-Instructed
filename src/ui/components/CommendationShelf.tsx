import type { JSX } from 'react';
import { ACHIEVEMENTS } from '../../game/achievements.ts';

/**
 * Every commendation, earned and unearned, in one place.
 *
 * Unearned ones show their requirement rather than being hidden behind a question mark: a
 * commendation is only tempting if you know what it wants, and nothing in the game is gated on
 * one, so there is nothing to spoil.
 */
export function CommendationShelf({
  achievements,
}: {
  achievements: Record<string, number>;
}): JSX.Element {
  const earned = ACHIEVEMENTS.filter((achievement) => achievements[achievement.id] !== undefined);

  return (
    <section className="shelf" aria-label="Commendations">
      <header className="shelf__head">
        <h2 className="shelf__title">COMMENDATIONS</h2>
        <p className="shelf__count numeric">
          {earned.length}/{ACHIEVEMENTS.length}
        </p>
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
              </div>
              <span className="sr-only">{has ? 'earned' : 'not yet earned'}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
