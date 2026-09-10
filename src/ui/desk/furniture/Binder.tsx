/**
 * THE COMMENDATION BOOK — the bound volume on the desk, and the record of what was recognised.
 *
 * Not the Shared Subroutines Repository. That is `src/meta`, a different feature with a different
 * job, and it keeps its name inside the terminal. This volume answered to that name too, and the
 * collision was not merely confusing — it is what let the book grow into a second site map with a
 * paper texture, printing the same grades, the same medal counts and the same points against the
 * same 33 orders. Two surfaces owning one number is one surface too many.
 *
 * So the two have been cut apart along what each is *for*. **Grades, points, status and every
 * route into a work order are the site map's.** The book keeps recognition: stars in aggregate,
 * the commendation shelf, and which certificates the player put in by hand. The per-order grid
 * survives because the book is still a book and wants pages, but a card here names the order and
 * what was recognised on it, never what it scored.
 *
 * Two sources, deliberately. `save` is the campaign record and is what the game scores. `filedDocs`
 * is what the *player* has actually put in the book with the stamp block, and where the two
 * disagree the book shows the sheet, because a certificate lying unstamped on the desk is a work
 * order the player has not closed yet.
 *
 * **Nothing here is required to finish the campaign.** The ruling binds it: the volume is a record,
 * and every route into a work order is on the site map.
 */
import { Fragment, useEffect, useMemo, useState } from 'react';

import { starsFor } from '../../../game/score.ts';
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

  /**
   * Every commendation the save holds a timestamp for.
   *
   * `save.achievements` is only ever written when one is earned and nothing ever removes a key
   * (achievements rule 3), so the key count *is* the earned count — the shelf below reaches the
   * same set the long way round, by testing `achievements[id] !== undefined` per row. This number
   * used to be printed on the site map header; it moved here rather than being recomputed,
   * because the count and the record it counts belong on one surface.
   */
  const commendations = Object.keys(save.achievements).length;

  return (
    <>
      <button
        type="button"
        className="binder"
        aria-expanded={open}
        aria-label="Open the Commendation Book"
        onClick={() => setOpen(true)}
      >
        <div className="bnd-board">
          <div className="bnd-plate">
            <b>THE COMMENDATION BOOK</b>
            <span>STARS · COMMENDATIONS · FILINGS</span>
            <span className="bnd-vol">VOL. II &nbsp;·&nbsp; #4471</span>
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
        <div className="binder-open" role="dialog" aria-label="The Commendation Book">
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
                <b>THE COMMENDATION BOOK</b>
                <span>
                  Kessler &amp; Daughters Terraforming Ltd. — commendations, stars and filings
                </span>
              </div>
              <div className="bo-tally numeric">
                <div>
                  <b>{tally.stars}</b>
                  <span>STARS</span>
                </div>
                <div>
                  <b>{commendations}</b>
                  <span>COMMENDATIONS</span>
                </div>
                <div>
                  <b>{stamped.size}</b>
                  <span>ENTERED</span>
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
                    /*
                     * A card names the order and what was recognised on it: the stars it earned,
                     * and whether the player filed its certificate by hand. **No grade.** The
                     * medal used to be stamped here as a rotated GOLD/SILVER/BRONZE/CLOSED die,
                     * which made this grid a paper reprint of the site map's discs — and a number
                     * printed in two places is a number that can disagree with itself. The site
                     * map owns the ladder (DESIGN.md §7) and owns every route into an order; the
                     * book owns recognition. That split is the reason the book exists separately
                     * at all.
                     *
                     * `open` is the only state class left, and it is not a grade either — it dims
                     * an order the site has not issued yet, so a mostly empty book in world 1
                     * reads as pages waiting rather than as work missed.
                     */
                    const closed = node.status === 'CLOSED';
                    const stars = starsFor(node.level.bonus, node.progress.stars);
                    return (
                      <div className={`bo-card${closed ? '' : ' open'}`} key={node.id}>
                        <div className="id">{node.id.toUpperCase()}</div>
                        <div className="ti">{node.playable ? node.level.title : '—'}</div>
                        {/* Filed by hand, rather than merely on the record. */}
                        {stamped.has(node.id) ? (
                          <div className="fl" title="filed by hand">
                            ENTERED
                          </div>
                        ) : null}
                        {/*
                          One glyph per star, not one glyph for any. Three work orders carry two
                          bonus objectives, and a single ★ told a player who found both exactly
                          what a player who found one was told.
                        */}
                        {stars > 0 ? (
                          <div className="star" aria-hidden="true">
                            {'★'.repeat(stars)}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </Fragment>
              ))}
            </div>

            {/*
              The count and the record are on one surface, which is what AUDIT-UI F14 actually
              asked for. The first answer to F14 kept the count on the site map header and spent
              an anchor getting from it to the shelf down here; that satisfied the letter of it
              and left the two halves of one fact on two screens, joined by a link the player had
              to notice. So the count moved instead. Both are in the book, a hand's width apart,
              and no anchor spans anything.

              Reachability survives the move. The book is a permanent object on the desk, present
              from the first work order rather than provisioned by one, and its door is a real
              `<button>` that is always drawn — so it is reachable by pointer and by keyboard
              (DESIGN.md §10.5), and `desk-frame.test.ts` holds it on screen at every viewport.
              Nothing here is gated and nothing here is required.
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
