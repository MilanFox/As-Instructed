/**
 * SIZE — the character-size dial on the terminal's bezel.
 *
 * One global setting for the whole desk. Per-element zoom is ruled out: the composition is the
 * only thing holding the fiction together and scaling one object destroys it.
 *
 * It scales type and line boxes (`--ts`), not station geometry (`--u`). The station is already
 * fitted to the viewport by `deskUnit`, so multiplying `--u` pushes the terminal's left edge off
 * screen and crops the thing the player is reading. Measured at 1440x860: `--u` is 0.857 and the
 * terminal's left edge sits at `50% - 762u`; at 1.25x that lands at -97px, taking the program's
 * line-number gutter off screen.
 *
 * Stored in its own `localStorage` key rather than in the campaign save, following
 * `src/ui/art.ts`: no save migration, and a look cannot corrupt a player's progress.
 */
import { useSyncExternalStore } from 'react';

export const SIZE_KEY = 'bootstrap.deskSize';

/** The dial's detents. A 1988 monitor's H-SIZE had stops; so does this. */
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
    // Private-mode Safari throws on `localStorage`. A dial is not worth a white screen.
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

/** Turning the dial: one detent on, wrapping back to the smallest past the top. */
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

/**
 * The design frame. Every position and dimension on the desk is written in these units and
 * multiplied by `--u`, so the whole composition is one fixed arrangement that fits itself to the
 * window rather than reflowing. Below about 1180x640 it needs a reflow that does not exist.
 *
 * These are the furniture's real extents, not a round number. The prototype's 1560 x 1000 was
 * four units short on the vertical: the terminal's top edge sits at `50% - 502 * u`, needing
 * 1004, so its lit north arris clipped by about 1.5px at every viewport where height was the
 * binding axis. A frame that does not contain the furniture it frames is wrong, and the width is
 * set the same way — the copy stand's right edge at `50% + 776 * u` is the widest thing on the
 * desk, not the in-tray it sits behind.
 *
 * `src/ui/__tests__/desk-frame.test.ts` recomputes both numbers from the stylesheets rather than
 * restating them, so nudging a piece of furniture outward fails the test instead of silently
 * cropping it.
 */
export const DESK_FRAME = { w: 1552, h: 1004 } as const;

export function deskUnit(viewportW: number, viewportH: number): number {
  return Math.min(viewportW / DESK_FRAME.w, viewportH / DESK_FRAME.h);
}
