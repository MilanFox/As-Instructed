import { Fragment, useEffect, useMemo, useState } from 'react';

import { starsFor } from '../../../game/score.ts';
import { useGame } from '../../../game/store.ts';
import { CommendationShelf } from '../../components/CommendationShelf.tsx';
import { buildRows, campaignTally } from '../../screens/LevelSelect.tsx';
import { filedDocs, usePapers } from '../paper/papers.ts';

const TABS = [0, 1, 2, 3, 4, 5, 6, 7];

export function Binder(): React.ReactElement {
  const save = useGame((state) => state.save);
  usePapers((state) => state.docs);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      event.preventDefault();
      setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open]);

  const rows = useMemo(() => buildRows(save), [save]);
  const tally = useMemo(() => campaignTally(rows), [rows]);

  const stamped = new Map<string, string>();
  for (const doc of filedDocs(usePapers.getState())) {
    if (doc.payload.kind !== 'certificate' || !doc.mark) continue;
    if (!stamped.has(doc.payload.report.levelId)) {
      stamped.set(doc.payload.report.levelId, doc.mark);
    }
  }

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
            <button
              type="button"
              className="bo-close bo-close--head"
              onClick={() => setOpen(false)}
            >
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
                    const closed = node.status === 'CLOSED';
                    const stars = starsFor(node.level.bonus, node.progress.stars);
                    return (
                      <div className={`bo-card${closed ? '' : ' open'}`} key={node.id}>
                        <div className="id">{node.id.toUpperCase()}</div>
                        <div className="ti">{node.playable ? node.level.title : '—'}</div>
                        {stamped.has(node.id) ? (
                          <div className="fl" title="filed by hand">
                            ENTERED
                          </div>
                        ) : null}
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
