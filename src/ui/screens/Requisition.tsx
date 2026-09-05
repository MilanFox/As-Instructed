import { useEffect, useRef } from 'react';
import type { JSX } from 'react';
import { currentLevel, useGame } from '../../game/store.ts';
import { audio } from '../audio.ts';
import { useReveal } from '../hooks/useReveal.ts';
import {
  REQUISITION_FROM,
  REQUISITION_TITLE,
  hardwareNote,
  requisitionDot,
  requisitionIntro,
} from '../copy.ts';

function openDocs(name: string): void {
  useGame.getState().setDocsOpen(true);
  useGame.getState().setPanel('docs');
  window.dispatchEvent(new CustomEvent('bootstrap:docs-focus', { detail: { name } }));
}

/**
 * The hardware delivery note.
 *
 * Progression in BOOTSTRAP is hardware, not experience points (DESIGN.md §6) — you do not have
 * `scan()` until the crate arrives. That is the single biggest beat in the game and it used to be
 * a chip in a brief panel, so it is now a delivery: signed for, item by item, with what each one
 * does and what it makes possible.
 *
 * Shown once per command, ever. `seenRequisitions` is in the save, so replaying World 1 does not
 * re-issue World 1's crate.
 */
export function Requisition(): JSX.Element | null {
  const pending = useGame((state) => state.requisition);
  if (!pending) return null;
  return <RequisitionNote key={pending.hardware.join(',')} />;
}

function RequisitionNote(): JSX.Element | null {
  const pending = useGame((state) => state.requisition);
  const level = useGame(currentLevel);
  const sign = useGame((state) => state.signRequisition);
  const celebrations = useGame((state) => state.save.settings.celebrations);
  const primaryRef = useRef<HTMLButtonElement | null>(null);

  const items = pending?.hardware ?? [];
  const { stage, done, skip } = useReveal(items.length, celebrations, 260);

  // `preventScroll` matters: without it the browser scrolls the Sign button into view and takes
  // the delivery note's header off the top of a short window with it.
  useEffect(() => {
    if (done) primaryRef.current?.focus({ preventScroll: true });
  }, [done]);

  const cued = useRef(0);
  useEffect(() => {
    for (let step = cued.current + 1; step <= stage; step++) audio.cue('spawn', step);
    cued.current = Math.max(cued.current, stage);
  }, [stage]);

  if (!pending || items.length === 0) return null;

  const salt = items.join('').length + (level?.world ?? 0);

  return (
    <div className="overlay" role="presentation">
      <div
        className="modal modal--requisition"
        role="dialog"
        aria-modal="true"
        aria-label="Hardware requisition"
        onClick={() => {
          if (!done) skip();
        }}
        onKeyDownCapture={() => {
          if (!done) skip();
        }}
      >
        <header className="requisition__head">
          <p className="requisition__from numeric">{REQUISITION_FROM}</p>
          <h2 className="requisition__title">{REQUISITION_TITLE}</h2>
          <p className="requisition__intro">{requisitionIntro(salt)}</p>
        </header>

        <div className="requisition__body">
          {items.map((name, index) => {
            const note = hardwareNote(name);
            return (
              <article
                key={name}
                className={stage > index ? 'crate crate--in' : 'crate crate--out'}
              >
                <div className="crate__head">
                  <code className="crate__name">{name}()</code>
                  <button
                    type="button"
                    className="crate__docs"
                    onClick={(event) => {
                      event.stopPropagation();
                      sign();
                      openDocs(name);
                    }}
                  >
                    reference
                  </button>
                </div>
                <p className="crate__spec">{note.spec}</p>
                <p className="crate__opens">{note.opens}</p>
              </article>
            );
          })}
        </div>

        <aside className="requisition__dot">
          <span className="memo__dot-tag">dot:</span>
          <p>{requisitionDot(salt)}</p>
        </aside>

        <footer className="modal__foot">
          <span className="modal__foot-spacer" />
          <button type="button" className="btn btn--run" ref={primaryRef} onClick={sign}>
            Sign for it
          </button>
        </footer>
      </div>
    </div>
  );
}
