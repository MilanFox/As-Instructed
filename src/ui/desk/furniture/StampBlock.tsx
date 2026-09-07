/**
 * The stamp block, and what filing actually is.
 *
 * Five ceremonies used to take the screen, say something once and then become unreachable, and the
 * run report was one stray click from gone with no way back. The desk's
 * answer is that **paper persists until it is filed** — so filing has to be an act the player
 * performs, not a timeout and not a backdrop click. You pick up the closure die and press it into
 * the box on the certificate. That call is `usePapers.file(id, mark)`, and the sheet moves to the
 * Repository rather than being destroyed.
 *
 * `CLOSED` is the contractor's die, and pressing it is how a sheet leaves the desk. The grade a
 * work order earned is read off the certificate and the medal badge, not stamped here — a rack of
 * dies that never reacted was mistaken for a broken control, so it is gone. Six work orders carry
 * no medal at all (DESIGN.md §7), and `CLOSED` presses the same for those: the normal act with no
 * grade attached.
 *
 * The block does not know what a certificate is. It listens for a press on anything carrying
 * `data-stampbox` and reads the sheet's id off the nearest `data-doc-id`, so the paper lane owns
 * the sheet and this owns the hand.
 */
import { useEffect, useState } from 'react';

import { usePapers } from '../paper/papers.ts';

interface Die {
  /** What `file()` records as the sheet's mark, and the class the ink lands in. */
  mark: string;
  die: string;
  /** The rule the die stands for, printed under the ink. */
  sub: string;
}

/** Yours. */
const CLOSURE: Die = { mark: 'closed', die: 'CLOSED', sub: 'NO NOTES' };

/** How far a struck die is allowed to sit off square. Hand-stamped paper is never straight. */
function skew(): string {
  return `${(-9 + Math.random() * 6).toFixed(1)}deg`;
}

export function StampBlock(): React.ReactElement {
  const docs = usePapers((state) => state.docs);
  const [held, setHeld] = useState<Die | null>(null);
  const [at, setAt] = useState({ x: 0, y: 0 });

  /**
   * The certificate waiting to be closed, if there is one.
   *
   * The die reacting *only* when there is something to stamp is the whole instruction: a control
   * that is plainly inert until the moment it is needed teaches itself, and this game does not get
   * a tutorial or a tooltip.
   *
   * A certificate is *issued to the in-tray*, because one sheet lies out and that sheet is the
   * work order. So the die was live with nothing on the desk carrying a stamp box: a player closed
   * a level, was told to pick the die up, pressed it four times and watched it do nothing. And a
   * certificate lying at its own `DOC_HOME` puts its stamp box at y 893 in an 839px window —
   * measured, not assumed — so taking it out is not enough on its own either. Picking the die up
   * therefore takes the certificate out of the tray *and* brings it up to reading size, which is
   * the ceremony the copy on the die describes: pick it up, and the box is in front of you.
   */
  const waiting = docs.find(
    (doc) => !doc.filed && doc.payload.kind === 'certificate' && doc.mark === null,
  );
  const ready = waiting !== undefined;

  useEffect(() => {
    if (!held) return undefined;

    const onMove = (event: PointerEvent): void => {
      setAt({ x: event.clientX, y: event.clientY });
    };

    const onClick = (event: MouseEvent): void => {
      const target = event.target as HTMLElement | null;
      const box = target?.closest<HTMLElement>('[data-stampbox]');
      if (!box) {
        // Clicking the die again puts it back; clicking anywhere else does too.
        if (!target?.closest('.stamp')) setHeld(null);
        return;
      }
      event.preventDefault();
      event.stopPropagation();

      const sheet = box.closest<HTMLElement>('[data-doc-id]');
      const id = sheet?.dataset['docId'] ?? box.dataset['stampbox'];
      if (id) usePapers.getState().file(id, held.mark);

      /*
       * The ink lands on the sheet the paper lane is rendering. It is written into the DOM rather
       * than into a store because the strike is over before the next paint — the sheet is filed by
       * the same click, and what the player sees is the die hitting the paper it is leaving on.
       */
      box.classList.add('filled');
      const ink = document.createElement('div');
      ink.className = `inked ${held.mark}`;
      ink.style.setProperty('--sr', skew());
      ink.textContent = held.die;
      const rule = document.createElement('small');
      rule.textContent = held.sub;
      ink.appendChild(rule);
      box.appendChild(ink);

      setHeld(null);
    };

    window.addEventListener('pointermove', onMove);
    // Capture: the sheet's own click handler would otherwise pick the paper up under the die.
    document.addEventListener('click', onClick, true);
    // The cursor goes away while a die is in hand — the die *is* the cursor.
    const desk = document.querySelector('.desk');
    desk?.classList.add('stamping');
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('click', onClick, true);
      desk?.classList.remove('stamping');
    };
  }, [held]);

  return (
    <>
      <div className="stampblock">
        <div className="pad" aria-hidden="true">
          <div className="pad-felt" />
          <span>K&amp;D</span>
        </div>
        <div className="rack">
          <button
            type="button"
            className={`stamp ${CLOSURE.mark}${ready ? ' is-ready' : ''}${held ? ' stamp--held' : ''}`}
            aria-pressed={held !== null}
            disabled={!ready}
            aria-label={
              ready
                ? 'Pick up the CLOSED stamp and file the certificate'
                : 'The CLOSED stamp. Nothing on the desk is waiting to be closed'
            }
            onClick={(event) => {
              event.stopPropagation();
              setAt({ x: event.clientX, y: event.clientY });
              if (held) {
                setHeld(null);
                return;
              }
              if (waiting) {
                const papers = usePapers.getState();
                if (waiting.stowed) papers.takeOut(waiting.id);
                if (papers.lifted !== waiting.id) papers.lift(waiting.id);
              }
              setHeld(CLOSURE);
            }}
          >
            <span className="sh" />
            <span className="sb">{CLOSURE.die}</span>
            {ready ? <span className="sc">{held ? 'CLICK THE BOX' : 'PRESS TO FILE'}</span> : null}
          </button>
        </div>
      </div>

      {held ? (
        <div className="held" style={{ left: `${at.x}px`, top: `${at.y}px` }} aria-hidden="true">
          <div className="held-handle" />
          <div className="held-neck" />
          <div className="held-die">{held.die}</div>
        </div>
      ) : null}
    </>
  );
}
