import { useSyncExternalStore } from 'react';

export const FOCUS_KEY = 'bootstrap.deskFocus';

export const DEFAULT_FOCUS = false;

function read(): boolean {
  try {
    return localStorage.getItem(FOCUS_KEY) === 'on';
  } catch {
    return DEFAULT_FOCUS;
  }
}

let focused: boolean = read();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function deskFocus(): boolean {
  return focused;
}

export function setDeskFocus(next: boolean): void {
  if (next === focused) return;
  focused = next;
  try {
    localStorage.setItem(FOCUS_KEY, next ? 'on' : 'off');
  } catch {
    // Non-fatal: the composition still applies for this session.
  }
  emit();
}

export function toggleDeskFocus(): boolean {
  setDeskFocus(!focused);
  return focused;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useDeskFocus(): boolean {
  return useSyncExternalStore(subscribe, deskFocus, () => DEFAULT_FOCUS);
}
