/**
 * THE REPOSITORY — the bound volume on the desk, and the record of closed work orders.
 *
 * Not the library of routines. That is `src/meta`, it is a different feature with a different job,
 * and it keeps its name inside the terminal. This is the ring binder the company keeps: every work
 * order the site has issued, in the order Finance prefers them closed, with the grade that was
 * stamped on it. `docs/AUDIT-UI.md` F18 — a grade shown once and then deleted is not a grade, it
 * is an event.
 *
 * Two sources, deliberately. `save` is the campaign record and is what the game scores. `filedDocs`
 * is what the *player* has actually put in the binder with the stamp block, and where the two
 * disagree the binder shows the sheet, because a certificate lying unstamped on the desk is a work
 * order the player has not closed yet.
 *
 * **Nothing here is required to finish the campaign.** The ruling binds it: the volume is a record,
 * and every route into a work order is on the site map.
 */
import { Fragment, useEffect, useMemo, useState } from 'react';

import { Medal, medalOf, starsFor } from '../../../game/score.ts';
import { useGame } from '../../../game/store.ts';
import { CommendationShelf } from '../../components/CommendationShelf.tsx';
import { buildRows, campaignTally } from '../../screens/LevelSelect.tsx';
import { filedDocs, usePapers } from '../paper/papers.ts';

/** The eight tab colours down the fore-edge, cooling across the campaign like the world accents. */
const TABS = [0, 1, 2, 3, 4, 5, 6, 7];

export function Binder(): React.ReactElement {
  const save = useGame((state) => state.save);
  /*
   * The pile itself, not `filedDocs`. That helper builds a new array on every call, and a zustand
   * selector that never returns the same reference twice re-renders forever — so this is the
   * subscription and `filedDocs` below is the reading.
   */
  usePapers((state) => state.docs);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      // Capture, and stopped: the global handler would otherwise walk out of the work order
      // underneath the binder rather than shutting the binder.
      event.stopPropagation();
      event.preventDefault();
      setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open]);

  const rows = useMemo(() => buildRows(save), [save]);
  const tally = useMemo(() => campaignTally(rows), [rows]);

  /** The mark the player stamped on this order's certificate, where one has been filed. */
  const stamped = new Map<string, string>();
  for (const doc of filedDocs(usePapers.getState())) {
    if (doc.payload.kind !== 'certificate' || !doc.mark) continue;
    if (!stamped.has(doc.payload.report.levelId)) {
      stamped.set(doc.payload.report.levelId, doc.mark);
    }
  }

  return (
    <>
      <button
        type="button"
        className="binder"
        aria-expanded={open}
        aria-label="Open the Repository"
        onClick={() => setOpen(true)}
      >
        <div className="bnd-board">
          <div className="bnd-plate">
            <b>THE REPOSITORY</b>
            <span>CLOSED WORK ORDERS</span>
            <span className="bnd-vol">VOL. I &nbsp;·&nbsp; #4471</span>
          </div>
          <div className="bnd-tabs">
            {TABS.map((tab) => (
              <i key={tab} style={{ '--t': tab } as React.CSSProperties} />
            ))}
          </div>
        </div>
        <div className="bnd-spine" />
        <div className="bnd-pages" />
      </button>

      {open ? (
        <div className="binder-open" role="dialog" aria-label="The Repository">
          <div className="bo-sheet">
            <div className="bo-holes" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </div>
            {/*
              The way out sits in the head, and the head does not scroll. It used to be the last
              thing after thirty-three cards and the commendation shelf, so shutting the binder
              meant scrolling past everything you had opened it to read.
            */}
            <button type="button" className="bo-close bo-close--head" onClick={() => setOpen(false)}>
              shut the binder
            </button>
            <header className="bo-head">
              <div>
                <b>THE REPOSITORY</b>
                <span>
                  Kessler &amp; Daughters Terraforming Ltd. — closed work orders, in order of
                  closure
                </span>
              </div>
              <div className="bo-tally numeric">
                <div>
                  <b>{tally.points}</b>
                  <span>POINTS</span>
                </div>
                <div>
                  <b>{tally.closed}</b>
                  <span>CLOSED</span>
                </div>
                <div>
                  <b>{tally.gold}</b>
                  <span>GOLD</span>
                </div>
                <div>
                  <b>{tally.silver}</b>
                  <span>SILVER</span>
                </div>
                <div>
                  <b>{tally.bronze}</b>
                  <span>BRONZE</span>
                </div>
                <div>
                  <b>{tally.stars}</b>
                  <span>STARS</span>
                </div>
              </div>
            </header>

            <div className="bo-grid">
              {rows.map((row) => (
                <Fragment key={row.world.id}>
                  <div className="bo-world">
                    <span>
                      {row.world.id} · {row.world.name.toUpperCase()}
                    </span>
                    <i />
                  </div>
                  {row.nodes.map((node) => {
                    const closed = node.status === 'CLOSED';
                    /*
                     * The grade is the company's and comes from the campaign record. `medalOf` is
                     * `null` on an order that carries no ladder, and an ungraded close is finished
                     * work rather than a missing medal (DESIGN.md §11 A7) — so it reads CLOSED,
                     * which is the die the contractor actually holds.
                     */
                    const medal = medalOf(node.level, node.progress);
                    const graded = medal !== null && medal !== Medal.None;
                    const mark = closed ? (graded ? medal : 'closed') : 'open';
                    return (
                      <div className={`bo-card ${mark}`} key={node.id}>
                        <div className="id">{node.id.toUpperCase()}</div>
                        <div className="ti">{node.playable ? node.level.title : '—'}</div>
                        <div className="mk">{closed ? mark.toUpperCase() : node.status}</div>
                        {/* Filed by hand, rather than merely on the record. */}
                        {stamped.has(node.id) ? (
                          <div className="fl" title="filed by hand">
                            ENTERED
                          </div>
                        ) : null}
                        {starsFor(node.level.bonus, node.progress.stars) > 0 ? (
                          <div className="star" aria-hidden="true">
                            ★
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </Fragment>
              ))}
            </div>

            {/*
              The commendation record lives in the volume it belongs to. It is also on the site
              map, where its count is printed and now links to it (AUDIT-UI F14) — the count and
              the record have to be in the same place, and the count is on the site map.
            */}
            <CommendationShelf achievements={save.achievements} />

            <footer className="bo-foot">
              <span>Retained records may not be closed.</span>
              <button type="button" className="bo-close" onClick={() => setOpen(false)}>
                shut the binder
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}
