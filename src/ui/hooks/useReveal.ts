import { useCallback, useEffect, useRef, useState } from 'react';

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface Reveal {
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
