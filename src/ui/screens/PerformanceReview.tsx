/**
 * The Performance Review — a memo from Deputy Site Coordinator M. Vance.
 *
 * The five tiers are NARRATIVE.md §7 verbatim and live in `REVIEW_TIERS`; this screen renders that
 * data and never restates it. The arithmetic behind the grade lives in `review.ts`, which also
 * records why the scope is what it is.
 */
import { useMemo, useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import { Medal, REVIEW_TIERS, reviewTier, starsFor } from '../../game/score.ts';
import { useGame } from '../../game/store.ts';
import { WORLDS } from '../../levels/index.ts';
import { fillPlaceholders, reachedByWorld, reportFor } from './review.ts';
import type { Scope, ScopeRow } from './review.ts';

type StyleVars = CSSProperties & Record<`--${string}`, string>;

function scopeName(scope: Scope): string {
  if (scope === 'all') return 'ALL WORK ORDERS';
  const world = WORLDS.find((candidate) => candidate.id === scope);
  return world ? `WORLD ${world.id} — ${world.name.toUpperCase()}` : `WORLD ${scope}`;
}

function ticksLine(row: ScopeRow): string {
  const best = row.progress.bestTicks;
  return best === undefined ? '—' : `${best} / ${row.level.par.ticks}`;
}

export function PerformanceReview(): JSX.Element {
  const save = useGame((state) => state.save);
  const goto = useGame((state) => state.goto);
  const openLevel = useGame((state) => state.openLevel);

  const reached = useMemo(() => reachedByWorld(save), [save]);

  const [scope, setScope] = useState<Scope>('all');
  const report = useMemo(() => reportFor(save, scope), [save, scope]);
  const tier = reviewTier(report.percent);
  const footnotes = tier.legal ?? [];
  const paragraphs = tier.body.split('\n\n');
  const graded = report.graded;

  const accent = scope === 'all' ? null : (WORLDS.find((w) => w.id === scope)?.accent ?? null);
  const style: StyleVars = accent ? { '--world-accent': accent } : {};

  return (
    <div className="review" style={style}>
      <header className="review__header">
        <div className="screen-ident">
          <h1 className="screen-title">PERFORMANCE REVIEW</h1>
          <p className="screen-org">
            Personnel &amp; Scheduling — for information only, pending review.
          </p>
        </div>
        <button type="button" className="screen-btn" onClick={() => goto('levels')}>
          BACK TO SITE MAP
        </button>
      </header>

      <div className="review__scopes" role="group" aria-label="Review scope">
        <button
          type="button"
          className={`scope ${scope === 'all' ? 'scope--on' : ''}`}
          aria-pressed={scope === 'all'}
          onClick={() => setScope('all')}
        >
          ALL WORK ORDERS
        </button>
        {WORLDS.map((world) => {
          const issued = reached.get(world.id) ?? 0;
          const on = scope === world.id;
          const worldStyle: StyleVars = { '--world-accent': world.accent };
          return (
            <button
              key={world.id}
              type="button"
              style={worldStyle}
              className={`scope ${on ? 'scope--on' : ''} ${issued === 0 ? 'scope--empty' : ''}`}
              aria-pressed={on}
              disabled={issued === 0}
              aria-disabled={issued === 0}
              aria-label={
                issued === 0
                  ? `World ${world.id}, ${world.name}. No work orders issued.`
                  : `World ${world.id}, ${world.name}. ${issued} work orders issued.`
              }
              onClick={() => setScope(world.id)}
            >
              <span className="numeric">{String(world.id).padStart(2, '0')}</span> {world.name}
            </button>
          );
        })}
      </div>

      <div className="review__scroll">
        <article className="memo">
          <div className="memo__head numeric">
            <p className="memo__line">PERFORMANCE REVIEW — CONTRACTOR #4471</p>
            <p className="memo__grade">GRADE: {graded ? tier.grade : 'NOT ASSESSED'}</p>
          </div>

          <dl className="memo__meta numeric">
            <div className="screen-stat">
              <dt>FROM</dt>
              <dd>Deputy Site Coordinator M. Vance</dd>
            </div>
            <div className="screen-stat">
              <dt>SCOPE</dt>
              <dd>{scopeName(scope)}</dd>
            </div>
            <div className="screen-stat">
              <dt>REVIEWED</dt>
              <dd>{report.closed} work orders</dd>
            </div>
            <div className="screen-stat">
              <dt>POINTS</dt>
              <dd>
                {report.points}/{report.maxPoints} pts · {Math.round(report.percent)}%
              </dd>
            </div>
          </dl>

          {graded ? (
            <>
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
            </>
          ) : (
            <p className="memo__body memo__body--empty">
              No work orders have been closed against this scope. Assessment is deprioritised until
              they are.
            </p>
          )}

          <div className="memo__ladder numeric" aria-hidden="true">
            {REVIEW_TIERS.map((rung) => (
              <span
                key={rung.rank}
                className={`ladder__rung ${graded && rung.rank === tier.rank ? 'ladder__rung--on' : ''}`}
              >
                {rung.min}% {rung.grade}
              </span>
            ))}
          </div>
        </article>

        <section className="wall" aria-label="Medal wall">
          <h2 className="wall__title">MEDAL WALL — {scopeName(scope)}</h2>

          <dl className="wall__counts numeric">
            <div className="screen-stat">
              <dt>GOLD</dt>
              <dd className="screen-stat__gold">{report.gold}</dd>
            </div>
            <div className="screen-stat">
              <dt>SILVER</dt>
              <dd className="screen-stat__silver">{report.silver}</dd>
            </div>
            <div className="screen-stat">
              <dt>BRONZE</dt>
              <dd className="screen-stat__bronze">{report.bronze}</dd>
            </div>
            <div className="screen-stat">
              <dt>STARS</dt>
              <dd>{report.stars}</dd>
            </div>
          </dl>

          {report.rows.length > 0 ? (
            <table className="wall__table">
              <thead>
                <tr>
                  <th scope="col">WORK ORDER</th>
                  <th scope="col">MEDAL</th>
                  <th scope="col" className="wall__num">
                    STARS
                  </th>
                  <th scope="col" className="wall__num">
                    TICKS / PAR
                  </th>
                  <th scope="col" className="wall__num">
                    PTS
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr
                    key={row.level.id}
                    className={row.progress.completed ? '' : 'wall__row--open'}
                  >
                    <th scope="row">
                      <button
                        type="button"
                        className="wall__link"
                        onClick={() => openLevel(row.level.id)}
                      >
                        <span className="numeric">{row.level.id}</span>
                        <span className="wall__name">{row.level.title}</span>
                      </button>
                    </th>
                    <td>
                      <span className={`chip chip--${row.progress.medal}`}>
                        {row.progress.medal === Medal.None
                          ? 'NO RESULT'
                          : row.progress.medal.toUpperCase()}
                      </span>
                    </td>
                    <td className="wall__num numeric">
                      {starsFor(row.level.bonus, row.progress.stars)}/{row.level.bonus?.length ?? 0}
                    </td>
                    <td className="wall__num numeric">{ticksLine(row)}</td>
                    <td className="wall__num numeric">
                      {row.maxPoints > 0 ? `${row.points}/${row.maxPoints}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="wall__empty">No work orders issued against this scope at this time.</p>
          )}
        </section>
      </div>
    </div>
  );
}
