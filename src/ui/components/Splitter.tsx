import { useCallback, useRef } from 'react';

export interface SplitterProps {
  orientation: 'vertical' | 'horizontal';
  /** Current position as a fraction of the container, 0..1. */
  value: number;
  min: number;
  max: number;
  onChange(value: number): void;
  containerRef: React.RefObject<HTMLElement | null>;
  label: string;
}

const KEY_STEP = 0.02;

/**
 * A draggable region divider. It is a real focusable `separator`, so the layout is adjustable
 * from the keyboard as well as the mouse (DESIGN.md §10.5).
 */
export function Splitter({
  orientation,
  value,
  min,
  max,
  onChange,
  containerRef,
  label,
}: SplitterProps): React.JSX.Element {
  const dragging = useRef(false);

  const clamp = useCallback(
    (next: number) => Math.max(min, Math.min(max, next)),
    [min, max],
  );

  const fractionFromEvent = useCallback(
    (clientX: number, clientY: number): number | null => {
      const container = containerRef.current;
      if (!container) return null;
      const rect = container.getBoundingClientRect();
      if (orientation === 'vertical') {
        return rect.width === 0 ? null : (clientX - rect.left) / rect.width;
      }
      return rect.height === 0 ? null : (clientY - rect.top) / rect.height;
    },
    [containerRef, orientation],
  );

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.dataset['dragging'] = 'true';
    dragging.current = true;
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!dragging.current) return;
    const next = fractionFromEvent(event.clientX, event.clientY);
    if (next !== null) onChange(clamp(next));
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    dragging.current = false;
    delete event.currentTarget.dataset['dragging'];
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const back = orientation === 'vertical' ? 'ArrowLeft' : 'ArrowUp';
    const forward = orientation === 'vertical' ? 'ArrowRight' : 'ArrowDown';
    if (event.key === back) onChange(clamp(value - KEY_STEP));
    else if (event.key === forward) onChange(clamp(value + KEY_STEP));
    else if (event.key === 'Home') onChange(min);
    else if (event.key === 'End') onChange(max);
    else return;
    event.preventDefault();
  };

  return (
    <div
      className={`splitter splitter--${orientation}`}
      role="separator"
      tabIndex={0}
      aria-orientation={orientation}
      aria-label={label}
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={Math.round(min * 100)}
      aria-valuemax={Math.round(max * 100)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
    />
  );
}
