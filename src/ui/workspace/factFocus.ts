import { useSyncExternalStore } from 'react';

let focused: string | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeFactFocus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function focusedFact(): string | null {
  return focused;
}

// Every call notifies, even for the fact already focused, so a second tap on the same term
// still opens the Brief after it was shut.
export function focusFact(label: string): void {
  focused = label;
  notify();
}

export function clearFocusedFact(): void {
  if (focused === null) return;
  focused = null;
  notify();
}

export function useFocusedFact(): string | null {
  return useSyncExternalStore(subscribeFactFocus, focusedFact);
}
