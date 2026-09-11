import { useSyncExternalStore } from 'react';

export const SIZE_KEY = 'bootstrap.deskSize';

export const SIZE_STOPS = [1, 1.15, 1.3, 1.5] as const;

export type DeskSize = (typeof SIZE_STOPS)[number];

export const DEFAULT_SIZE: DeskSize = 1;

function isDeskSize(value: number): value is DeskSize {
  return (SIZE_STOPS as readonly number[]).includes(value);
}

function read(): DeskSize {
  try {
    const raw = Number(localStorage.getItem(SIZE_KEY));
    return isDeskSize(raw) ? raw : DEFAULT_SIZE;
  } catch {
    return DEFAULT_SIZE;
  }
}

let size: DeskSize = read();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function deskSize(): DeskSize {
  return size;
}

export function setDeskSize(next: DeskSize): void {
  if (next === size) return;
  size = next;
  try {
    localStorage.setItem(SIZE_KEY, String(next));
  } catch {
    // Non-fatal: the size still applies for this session.
  }
  emit();
}

export function turnDeskSize(): DeskSize {
  const at = SIZE_STOPS.indexOf(size);
  const next = SIZE_STOPS[(at + 1) % SIZE_STOPS.length] ?? DEFAULT_SIZE;
  setDeskSize(next);
  return next;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useDeskSize(): DeskSize {
  return useSyncExternalStore(subscribe, deskSize, () => DEFAULT_SIZE);
}

export const DESK_FRAME = { w: 1552, h: 1004 } as const;

export function deskUnit(viewportW: number, viewportH: number): number {
  return Math.min(viewportW / DESK_FRAME.w, viewportH / DESK_FRAME.h);
}
