import { useEffect, useSyncExternalStore } from 'react';
import { useGame } from '../../game/store.ts';

export type OverlayId = 'brief' | 'console' | 'docs';

export interface OverlayState {
  open: OverlayId | null;
  requested: boolean;
}

let state: OverlayState = { open: 'brief', requested: false };
const listeners = new Set<() => void>();

function set(open: OverlayId | null, requested: boolean): void {
  if (state.open === open && state.requested === requested) return;
  state = { open, requested };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function overlayState(): OverlayState {
  return state;
}

export function openOverlay(id: OverlayId): void {
  useGame.getState().setPanel(id);
  set(id, true);
}

export function closeOverlay(): void {
  useGame.getState().setPanel('brief');
  set(null, false);
}

export function toggleOverlay(id: OverlayId): void {
  if (state.open === id) closeOverlay();
  else openOverlay(id);
}

export function useOverlay(): OverlayState {
  return useSyncExternalStore(subscribe, overlayState, overlayState);
}

export function useOverlayRequests(levelId: string | null): void {
  useEffect(() => {
    set('brief', false);
  }, [levelId]);

  useEffect(
    () =>
      useGame.subscribe((next, previous) => {
        if (next.brief !== previous.brief && next.brief !== 'brief') set(next.brief, true);
        if (state.open !== 'brief') return;
        const working =
          next.code !== previous.code ||
          (next.runState === 'running' && previous.runState !== 'running');
        if (working) set(null, false);
      }),
    [],
  );
}
