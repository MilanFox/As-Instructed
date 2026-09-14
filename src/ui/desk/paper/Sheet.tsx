import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useDeskSize } from '../scale.ts';
import type { DeskDoc } from './papers.ts';
import { PINNABLE, usePapers } from './papers.ts';

interface Lift {
  scale: number;
  left: number;
  top: number;
  maxHeight: number;
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
        overflowY: held.scrolls ? 'auto' : 'visible',
        zIndex: doc.z,
      }
    : {
        left: `calc(50% + ${String(at.x)} * var(--u))`,
        top: `calc(50% + ${String(at.y)} * var(--u))`,
        transform: `rotate(${String(rot)}deg) scale(var(--rest))`,
        zIndex: doc.z,
      };

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
      </div>
      {children}
    </article>
  );
}
