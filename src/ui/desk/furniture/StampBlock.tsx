import { useEffect, useState } from 'react';

import { usePapers } from '../paper/papers.ts';

interface Die {
  mark: string;
  die: string;
  sub: string;
}

const CLOSURE: Die = { mark: 'closed', die: 'CLOSED', sub: 'NO NOTES' };

function skew(): string {
  return `${(-9 + Math.random() * 6).toFixed(1)}deg`;
}

export function StampBlock(): React.ReactElement {
  const docs = usePapers((state) => state.docs);
  const [held, setHeld] = useState<Die | null>(null);
  const [at, setAt] = useState({ x: 0, y: 0 });

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
        if (!target?.closest('.stamp')) setHeld(null);
        return;
      }
      event.preventDefault();
      event.stopPropagation();

      const sheet = box.closest<HTMLElement>('[data-doc-id]');
      const id = sheet?.dataset['docId'] ?? box.dataset['stampbox'];
      if (id) usePapers.getState().file(id, held.mark);

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
    document.addEventListener('click', onClick, true);
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
