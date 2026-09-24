import { useSyncExternalStore } from 'react';
import type { InspectTarget } from '../../game/debug-values.ts';
import { useGame } from '../../game/store.ts';

export interface InspectState {
  target: InspectTarget | null;
  reveal: number;
}

let state: InspectState = { target: null, reveal: 0 };
const listeners = new Set<() => void>();

function set(next: InspectState): void {
  if (state.target === next.target && state.reveal === next.reveal) return;
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function inspectState(): InspectState {
  return state;
}

export function pick(target: InspectTarget): void {
  set({ target, reveal: state.reveal + 1 });
}

export function showCall(): void {
  set({ target: null, reveal: state.reveal + 1 });
}

useGame.subscribe((next, previous) => {
  if (next.trace !== previous.trace) set({ target: null, reveal: state.reveal });
});

export function useInspect(): InspectState {
  return useSyncExternalStore(subscribe, inspectState, inspectState);
}
