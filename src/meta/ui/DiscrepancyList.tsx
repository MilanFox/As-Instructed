import type * as React from 'react';
import { DISCREPANCY } from '../copy.ts';
import { useLibrary } from '../store.ts';
import './library.css';

/**
 * The incident list. A page, not an interruption.
 *
 * A discrepancy never blocks anything: the work order stays closed, the medal stays recorded, and
 * "close the discrepancy" is available whether or not the player fixes it — which is the joke, and
 * also the guarantee that this can be ignored for the whole game.
 */
export function DiscrepancyList(): React.JSX.Element {
  const save = useLibrary((state) => state.save);
  const open = useLibrary((state) => state.openDiscrepancyLevel);
  const close = useLibrary((state) => state.closeDiscrepancy);
  const setMuted = useLibrary((state) => state.setMuted);

  if (save.discrepancies.length === 0) {
    return (
      <div>
        <p className="lib__empty">Nothing has been raised.</p>
        {save.discrepanciesMuted ? (
          <button
            type="button"
            className="lib__btn"
            onClick={() => setMuted({ discrepancies: false })}
          >
            Start raising these again
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      {save.discrepancies.map((entry) => (
        <article key={entry.id} className={entry.closed ? 'lib-disc lib-disc--closed' : 'lib-disc'}>
          <div className="lib-disc__ref">{entry.id}</div>
          <h3 className="lib-disc__title">{DISCREPANCY.title(entry.levelId)}</h3>
          <p className="lib-disc__body">{DISCREPANCY.body(entry.levelId, entry.seed)}</p>
          <p className="lib__note">{DISCREPANCY.note}</p>
          {entry.resolved ? (
            <p className="lib__note">{DISCREPANCY.resolved(entry.levelId)}</p>
          ) : null}
          <div className="lib-modal__actions">
            <button
              type="button"
              className="lib__btn lib__btn--primary"
              onClick={() => open(entry.id)}
            >
              {DISCREPANCY.open}
            </button>
            <button
              type="button"
              className="lib__btn"
              disabled={entry.closed}
              onClick={() => close(entry.id)}
              title={DISCREPANCY.closeNote}
            >
              {DISCREPANCY.close}
            </button>
          </div>
        </article>
      ))}

      <div className="lib-modal__actions">
        <button
          type="button"
          className="lib__btn"
          onClick={() => setMuted({ discrepancies: !save.discrepanciesMuted })}
        >
          {save.discrepanciesMuted ? 'Start raising these again' : DISCREPANCY.mute}
        </button>
      </div>
      <p className="lib-modal__footnote">{DISCREPANCY.legal[0]}</p>
    </div>
  );
}
