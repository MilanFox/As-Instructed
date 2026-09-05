import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A staged reveal, with an escape hatch that is always reachable.
 *
 * The run report escalates — objectives tick off one at a time, then the medal lands, then the
 * commendations — because a result that arrives all at once reads as a receipt. But a reveal that
 * cannot be skipped is a delay, and a delay on every single work order is exactly the chore this
 * was built to avoid. So three things are true at once:
 *
 *  - `prefers-reduced-motion` skips straight to the end. No timers are ever armed.
 *  - `enabled: false` (the player's own setting) does the same.
 *  - `skip()` is wired to any click or key on the report, so the fortieth time costs one tap.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface Reveal {
  /** How many stages have landed. `stage >= n` means stage `n` is visible. */
  stage: number;
  done: boolean;
  skip: () => void;
}

export function useReveal(steps: number, enabled: boolean, intervalMs = 190): Reveal {
  const instant = !enabled || prefersReducedMotion();
  const [stage, setStage] = useState(() => (instant ? steps : 0));
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const skip = useCallback(() => {
    setStage(steps);
  }, [steps]);

  useEffect(() => {
    if (instant) {
      setStage(steps);
      return;
    }
    setStage(0);
    timer.current = setInterval(() => {
      setStage((current) => {
        if (current >= steps) return current;
        return current + 1;
      });
    }, intervalMs);
    return () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
  }, [instant, steps, intervalMs]);

  useEffect(() => {
    if (stage >= steps && timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, [stage, steps]);

  return { stage, done: stage >= steps, skip };
}
