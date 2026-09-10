/**
 * FOCUS — the throw switch on the terminal's bezel, and the second view it opens.
 *
 * A player writing a World 6 routine said the terminal was too small for the work, and the numbers
 * agreed: the glass is 776 design units wide, the objectives rail takes 224 of them and Monaco's
 * line-number margin another 37, so the program gets 513u — 63 columns of JetBrains Mono, and 22
 * lines of the 660u screen once the terminal bar, the log and the status strip have had theirs.
 *
 * The first answer to it widened the terminal inside the desk composition and shrank the site feed
 * beside it. It worked and it was still a compromise, because 1160u is all the glass that fits
 * between the terminal's left edge and the copy stand and no arrangement of the furniture gives the
 * program more than that. The player's own answer was better: *"the 'Focus Mode' can be an entirely
 * different view. Without all the clutter of the desk and stuff. Only Terminal and preview."*
 *
 * So this is not a second arrangement of the desk. **It is a second view, and the desk is not in
 * it.** `styles/desk/desk.css`'s FOCUS section takes the room and every piece of deskware off
 * screen and gives `.station` a two-column grid against the viewport; the terminal takes the
 * flexible column and the site feed a fixed 360u preview beside it. Throw the switch back and the
 * approved arrangement is exactly where it was, unit for unit, because none of the rules that place
 * it were touched — that is what makes this a view and not the reflow `Desk.tsx`'s header rules out.
 *
 * Three things it deliberately does not do:
 *
 * - **It does not change character size.** `--ts` is the player's own SIZE dial and `--u` is the
 *   desk's unit, and FOCUS touches neither. The room arrives as more rows and more columns of the
 *   same type, which is the entire request. A focus mode that shrank the code to fit more of it in
 *   would be answering a question nobody asked.
 * - **It does not shrink the objectives rail.** The rail is where a level's graded objectives, its
 *   budgets, its par and its crew readouts are stated, which is the material DESIGN §11 is about.
 *   It is the same 224u at the same type size in both views.
 * - **It does not build a way around what it hides.** The player accepted that reaching the
 *   reference, the commendation book or the paperwork means throwing the switch back, so there
 *   is no floating toolbar and no second dispatch key. The two exceptions are §11 obligations
 *   rather than conveniences and both are one line of copy: `ctrl+enter` is already printed on the terminal's
 *   status strip, and the strip states that a passing work order is ready to close and how to get
 *   to the stamp block.
 *
 * Stored in its own `localStorage` key rather than in the campaign save, following `scale.ts` and
 * `src/ui/art.ts`: no save migration, and a look cannot corrupt a player's progress. Every touch of
 * `localStorage` is wrapped, because private-mode Safari throws on it and a switch on a bezel is
 * never worth a white screen.
 */
import { useSyncExternalStore } from 'react';

export const FOCUS_KEY = 'bootstrap.deskFocus';

/** Off. A player arrives at the approved composition and asks for the other one. */
export const DEFAULT_FOCUS = false;

function read(): boolean {
  try {
    return localStorage.getItem(FOCUS_KEY) === 'on';
  } catch {
    // Private-mode Safari throws on `localStorage`. A switch is not worth a white screen.
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

/** Throwing the switch. It is a two-position switch, so there is nothing to wrap around. */
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
