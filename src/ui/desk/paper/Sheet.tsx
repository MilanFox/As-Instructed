/**
 * One sheet of paper on the desk.
 *
 * This is the physical half of every document: where it lies, how it is dragged, how it is
 * enlarged, and the pin that puts it on the copy stand. What is printed on it is the caller's
 * business.
 *
 * **A document has exactly one gesture and two controls.** The gesture is drag: press it anywhere,
 * move it, and it stays where it is dropped. Enlarging and pinning are buttons printed on the
 * sheet. The first build overloaded the click — press to drag, click to enlarge — and an
 * overloaded gesture is a gesture nobody discovers: a player who pressed a sheet meaning to move
 * it got it flying across the desk at 1.23x instead, and once it was up, dragging did nothing at
 * all. It is the same defect `docs/AUDIT-UI.md` F12 names about the 10px chips, and the desk's
 * whole thesis is that things are objects you can see.
 *
 * **Enlarging is a transform on this element and nothing else.** `docs/DESK-CONCEPT.md` §9 item 2
 * is a hard constraint: as a portal or an overlay it would reintroduce exactly the
 * self-destroying-ceremony problem the desk exists to remove. So the held sheet is the same node
 * in the same layer with a different `transform`, and putting it down restores the position it was
 * already in.
 *
 * The lift is sized to be read rather than to a fixed number: `min(1.9, 0.92 × innerHeight / its
 * own height, 0.42 × innerWidth / its own width)`, floored at 1, parked against the right of the
 * desk so it never covers the terminal. Where that floor binds — a long work order at `--ts: 1.5`
 * on a 13" laptop — the sheet scrolls rather than running off the bottom of the screen, and its
 * controls stay stuck to the top of it, because whatever opens on the desk closes without
 * scrolling.
 *
 * Geometry is in design units offset from the centre of the frame, never in pixels, so a sheet
 * dragged at one window size is in the same place at another.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useDeskSize } from '../scale.ts';
import type { DeskDoc } from './papers.ts';
import { PINNABLE, usePapers } from './papers.ts';

interface Lift {
  scale: number;
  left: number;
  top: number;
  maxHeight: number;
  /** True only where the window has no room left. Then, and only then, the sheet scrolls. */
  scrolls: boolean;
}

function liftFor(width: number, height: number): Lift {
  const scale = Math.max(
    1,
    Math.min(1.9, (window.innerHeight * 0.92) / height, (window.innerWidth * 0.42) / width),
  );
  const maxHeight = (window.innerHeight * 0.92) / scale;
  return {
    scale,
    /* `transform-origin: 50% 0`, so the box grows about its own centre-top. */
    left: window.innerWidth - window.innerWidth * 0.04 - (width * (1 + scale)) / 2,
    top: window.innerHeight * 0.035,
    maxHeight,
    scrolls: height > maxHeight,
  };
}

export function Sheet({
  doc,
  label,
  children,
}: {
  doc: DeskDoc;
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const lifted = usePapers((state) => state.lifted === doc.id);
  const pinned = usePapers((state) => state.pinned === doc.id);
  const lift = usePapers((state) => state.lift);
  const raise = usePapers((state) => state.raise);
  const moveTo = usePapers((state) => state.moveTo);
  const stow = usePapers((state) => state.stow);
  const pin = usePapers((state) => state.pin);
  const unpin = usePapers((state) => state.unpin);
  const size = useDeskSize();

  const node = useRef<HTMLElement | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [held, setHeld] = useState<Lift | null>(null);
  const [arriving, setArriving] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setArriving(false);
    }, 700);
    return () => {
      window.clearTimeout(timer);
    };
  }, [doc.id]);

  /*
   * Measured, not assumed: `offsetHeight` is the sheet's own layout height, before the resting
   * scale and before the rotation, so the fit is right whatever the type scale has done to the
   * prose inside it.
   */
  const measure = useCallback(() => {
    const element = node.current;
    if (!element) return;
    setHeld(liftFor(element.offsetWidth, element.offsetHeight));
  }, []);

  useLayoutEffect(() => {
    if (!lifted) {
      setHeld(null);
      return;
    }
    measure();
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
    };
  }, [lifted, measure, size]);

  const at = doc.moved ?? doc.home;
  const rot = doc.moved ? 0 : doc.home.rot;

  const style: React.CSSProperties = held
    ? {
        left: `${String(Math.round(held.left))}px`,
        top: `${String(Math.round(held.top))}px`,
        transform: `rotate(-0.5deg) scale(${String(held.scale)})`,
        maxHeight: `${String(Math.round(held.maxHeight))}px`,
        /*
         * Overflow is only turned on where the sheet genuinely cannot fit. A scroll container
         * clips on both axes, and turning it on unconditionally cut the corner controls off the
         * one sheet that most needs them.
         */
        overflowY: held.scrolls ? 'auto' : 'visible',
        zIndex: doc.z,
      }
    : {
        left: `calc(50% + ${String(at.x)} * var(--u))`,
        top: `calc(50% + ${String(at.y)} * var(--u))`,
        transform: `rotate(${String(rot)}deg) scale(var(--rest))`,
        zIndex: doc.z,
      };

  /*
   * Drag, and only drag. There is no threshold, because there is nothing to disambiguate from.
   *
   * The sheet follows the cursor for the whole gesture and the store is written **once**, on
   * release. Nothing moved until release in the first build and the player concluded the drag was
   * broken; committing per move instead is the other failure, because `looseDocs` re-derives and
   * every subscriber re-renders on every mouse event. Live transform, single commit.
   *
   * `translate` is the independent property rather than part of `transform`: it composes outside
   * the resting rotate-and-scale, so the sheet tracks the pointer one-for-one whatever the sheet
   * is already doing, and the resting transform never has to be rebuilt per frame.
   */
  const onPointerDown = (event: React.PointerEvent<HTMLElement>): void => {
    if (lifted) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, .sigline, .stampbox, a, input, textarea')) return;
    event.preventDefault();
    node.current?.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY };
    raise(doc.id);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLElement>): void => {
    const from = drag.current;
    if (!from || !node.current) return;
    node.current.style.translate = `${String(event.clientX - from.x)}px ${String(event.clientY - from.y)}px`;
  };

  const onPointerUp = (event: React.PointerEvent<HTMLElement>): void => {
    const from = drag.current;
    drag.current = null;
    if (!from || lifted) return;
    if (event.clientX === from.x && event.clientY === from.y) {
      if (node.current) node.current.style.translate = '';
      return;
    }
    const unit = node.current
      ? parseFloat(getComputedStyle(node.current).getPropertyValue('--u')) || 1
      : 1;
    moveTo(doc.id, at.x + (event.clientX - from.x) / unit, at.y + (event.clientY - from.y) / unit);
  };

  /*
   * The live translate is dropped only once the committed `left`/`top` are on the element, or the
   * sheet snaps back for one frame before it lands.
   */
  useLayoutEffect(() => {
    if (node.current) node.current.style.translate = '';
  }, [doc.moved, lifted]);

  const classes = [
    'doc',
    `doc--${doc.kind}`,
    lifted ? 'up' : '',
    arriving ? 'doc-arrive' : '',
    doc.mark ? 'doc--marked' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article
      ref={node}
      className={classes}
      style={{ ...style, ['--rot' as string]: `${String(rot)}deg` }}
      data-doc-id={doc.id}
      data-doc-kind={doc.kind}
      data-scrolls={held?.scrolls ? '1' : undefined}
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/*
        Printed on the sheet, first in the flow and stuck to the top of it, so a sheet taller than
        the window still carries the control that closes it.
      */}
      <div className="doc__tools">
        <button
          type="button"
          className="tool"
          aria-pressed={lifted}
          onClick={(event) => {
            event.stopPropagation();
            lift(doc.id);
          }}
        >
          {lifted ? 'put it down' : 'enlarge'}
        </button>
        {PINNABLE.has(doc.kind) ? (
          <button
            type="button"
            className={pinned ? 'tool tool--pin tool--set' : 'tool tool--pin'}
            aria-pressed={pinned}
            onClick={(event) => {
              event.stopPropagation();
              if (pinned) unpin();
              else pin(doc.id);
            }}
          >
            <i className="tool__pin" aria-hidden="true" />
            {pinned ? 'on the copy stand' : 'pin to the copy stand'}
          </button>
        ) : null}
        {/*
          Away means the in-tray, and the in-tray means retrievable. Paper still persists until it
          is filed; this is only the difference between paper on the desk and paper put away, and
          without it there was no way at all to clear a sheet off the work.

          The standing sheet has no `put it away`, because a grade you can put down is an event
          rather than a standing (`docs/AUDIT-UI.md` F18).
        */}
        {doc.kind === 'standing' ? null : (
          <button
            type="button"
            className="tool"
            onClick={(event) => {
              event.stopPropagation();
              stow(doc.id);
            }}
          >
            put it away
          </button>
        )}
      </div>
      {children}
    </article>
  );
}
