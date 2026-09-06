/**
 * Whether the objective read-out is open, and where that is remembered.
 *
 * The layout guarantees the card is never over the grid (`useWorkspaceLayout`), so folding it away
 * is not an escape from a collision — it is the player saying they want the width for the board.
 * That is a preference, and it is worth remembering: a player who has closed the read-out does not
 * want it back on the next work order.
 *
 * It lives in its own `localStorage` key rather than in the campaign save, which is the precedent
 * `src/ui/art.ts` set: no save migration, and nothing here can corrupt anybody's progress.
 *
 * Outside React because two things need the same answer — the rail draws from it and the workspace
 * has to size the strip from it before the rail renders into it.
 */
import { useSyncExternalStore } from 'react';

export const RAIL_KEY = 'bootstrap.rail';

function stored(): boolean {
  try {
    return localStorage.getItem(RAIL_KEY) !== 'shut';
  } catch {
    // Private-mode Safari throws on `localStorage`. A preference is not worth a white screen.
    return true;
  }
}

let open = stored();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function railOpen(): boolean {
  return open;
}

export function setRailOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  try {
    localStorage.setItem(RAIL_KEY, next ? 'open' : 'shut');
  } catch {
    // Non-fatal: the choice still holds for this session.
  }
  for (const listener of listeners) listener();
}

export function toggleRail(): void {
  setRailOpen(!open);
}

export function useRail(): boolean {
  return useSyncExternalStore(subscribe, railOpen, railOpen);
}
