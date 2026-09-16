import { useEffect, useRef, useState } from 'react';

import { MIN_DRAWER, clampDrawer, maxDrawer } from './drawerSize.ts';

const NUDGE: Readonly<Record<string, number>> = {
  ArrowLeft: -24,
  ArrowRight: 24,
  PageUp: -120,
  PageDown: 120,
};

export function WidthGrip({
  label,
  controls,
  open,
  width,
  onWidth,
}: {
  label: string;
  controls: string;
  open: boolean;
  width: number;
  onWidth: (width: number) => void;
}): React.ReactElement {
  const [dragging, setDragging] = useState(false);
  const gripRef = useRef<HTMLDivElement | null>(null);
  // Held-down arrows can outrun a commit, so the nudges count off this rather than the prop.
  const live = useRef(width);
  live.current = width;

  // The ceiling is part of what the grip reports, so it has to follow the window rather than
  // wait for the next width the player picks.
  const [ceiling, setCeiling] = useState(() => maxDrawer(window.innerWidth));
  useEffect(() => {
    const measure = (): void => {
      setCeiling(maxDrawer(window.innerWidth));
    };
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
    };
  }, []);

  const onKeyDown = (event: React.KeyboardEvent): void => {
    const step = NUDGE[event.key];
    const next =
      step !== undefined
        ? live.current + step
        : event.key === 'Home'
          ? MIN_DRAWER
          : event.key === 'End'
            ? maxDrawer(window.innerWidth)
            : null;
    if (next === null) return;
    event.preventDefault();
    const held = clampDrawer(next, window.innerWidth);
    live.current = held;
    onWidth(held);
  };

  return (
    <div
      className="flyout-grip"
      ref={gripRef}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(width)}
      aria-valuemin={MIN_DRAWER}
      aria-valuemax={ceiling}
      aria-valuetext={`${String(Math.round(width))} pixels`}
      aria-controls={controls}
      tabIndex={0}
      data-dragging={String(dragging)}
      {...(open ? {} : { inert: true })}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => {
        event.preventDefault();
        gripRef.current?.setPointerCapture(event.pointerId);
        setDragging(true);
      }}
      onPointerMove={(event) => {
        // Capture is the synchronous truth about whether the grab landed; the dragging state
        // only drives the highlight and may not have committed before the first move.
        if (!gripRef.current?.hasPointerCapture(event.pointerId)) return;
        onWidth(clampDrawer(event.clientX, window.innerWidth));
      }}
      onPointerUp={(event) => {
        gripRef.current?.releasePointerCapture(event.pointerId);
        setDragging(false);
      }}
      onLostPointerCapture={() => {
        setDragging(false);
      }}
    />
  );
}
