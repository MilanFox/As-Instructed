/**
 * The pen, and signing for hardware.
 *
 * The same act as the stamp block for a different sheet: a requisition is signed for by dragging
 * along its signature line, and ink follows the pointer. Putting it away is a thing the player does
 * with their hand, and a requisition that signs itself on a button press is a modal in a nicer
 * costume.
 *
 * Like the stamp block this does not know what a requisition is. It listens for a drag on anything
 * carrying `data-signline` and reads the sheet's id off the nearest `data-doc-id`.
 */
import { useEffect } from 'react';

import { useGame } from '../../../game/store.ts';
import { usePapers } from '../paper/papers.ts';

/** Below this the player brushed the line rather than signed it, and nothing is committed. */
const SIGNATURE_POINTS = 7;

export function Pen(): React.ReactElement {
  useEffect(() => {
    let line: HTMLElement | null = null;
    let ink: SVGPathElement | null = null;
    let points: string[] = [];

    const stop = (): void => {
      line = null;
      ink = null;
      points = [];
    };

    const onDown = (event: PointerEvent): void => {
      const target = event.target as HTMLElement | null;
      const found = target?.closest<HTMLElement>('[data-signline]');
      if (!found) return;
      line = found;
      ink = found.querySelector<SVGPathElement>('[data-sig-path]');
      points = [];
      found.classList.add('signed');
      found.setPointerCapture?.(event.pointerId);
    };

    const onMove = (event: PointerEvent): void => {
      if (!line) return;
      const box = line.getBoundingClientRect();
      points.push(
        `${(event.clientX - box.left).toFixed(1)} ${(event.clientY - box.top).toFixed(1)}`,
      );
      ink?.setAttribute('d', `M${points.join('L')}`);
    };

    const onUp = (): void => {
      if (!line) return;
      if (points.length < SIGNATURE_POINTS) {
        line.classList.remove('signed');
        ink?.setAttribute('d', '');
        stop();
        return;
      }
      const sheet = line.closest<HTMLElement>('[data-doc-id]');
      const id = sheet?.dataset['docId'] ?? line.dataset['signline'];
      useGame.getState().signRequisition();
      /*
       * Not `file()` — the requisition already did its job by being seen. Signing is a quiet
       * way back to the tray, not a trip to the commendation book, so it stays reachable for
       * reference.
       */
      if (id) usePapers.getState().stow(id, 'signed');
      stop();
    };

    document.addEventListener('pointerdown', onDown);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
    };
  }, []);

  return (
    <div className="pen" aria-hidden="true">
      <i className="pen-cap" />
      <i className="pen-barrel" />
      <i className="pen-clip" />
    </div>
  );
}
