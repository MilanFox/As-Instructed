import type { JSX } from 'react';
import { ACHIEVEMENTS } from '../../game/achievements.ts';

const SHELF_ID = 'commendations';

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

export function earnedOn(at: number): string {
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return 'earned';
  return `earned ${when.getDate()} ${MONTHS[when.getMonth()] ?? ''}`.trimEnd();
}

export function CommendationShelf({
  achievements,
}: {
  achievements: Record<string, number>;
}): JSX.Element {
  const shown = ACHIEVEMENTS.filter(
    (achievement) => !achievement.hidden || achievements[achievement.id] !== undefined,
  );

  return (
    <section className="shelf" id={SHELF_ID} aria-label="Commendations" tabIndex={-1}>
      <header className="shelf__head">
        <h2 className="shelf__title">COMMENDATIONS</h2>
        <p className="shelf__aside">
          For information only. Nothing on this site is gated behind any of them.
        </p>
      </header>

      <ul className="shelf__list">
        {shown.map((achievement) => {
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
