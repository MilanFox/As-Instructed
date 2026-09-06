/**
 * Which of the three reading panels is currently over the board, if any.
 *
 * The brief, the console and the reference used to be three tabs in a panel that was always on
 * screen whether or not anyone wanted it. They are now summoned one at a time and dismissed, so
 * "nothing open" is a state the workspace has to be able to be in — and `state.brief` in the game
 * store cannot express it. That store field stays what it always was, the *requested* panel; this
 * module owns whether the request is currently on screen.
 *
 * It lives outside React because two hooks need the same answer: the workspace draws from it and
 * the global Escape handler in `useKeyboard` has to close the sheet before it walks out of the
 * work order.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { useGame } from '../../game/store.ts';

export type OverlayId = 'brief' | 'console' | 'docs';

export interface OverlayState {
  open: OverlayId | null;
  /**
   * Whether the player asked for this one. An overlay they summoned takes focus; the brief that
   * opens by itself on the way in must not, or it fights Monaco for the caret on every entry.
   */
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

/**
 * `setPanel('brief')` here is the store's neutral value and not a request to show the brief:
 * leaving the request where it was would make a second ask for the same panel no change at all,
 * and the top bar's reference button would work exactly once.
 */
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

/**
 * Wires the store's panel requests to the sheet, and decides when the brief steps aside.
 *
 * The brief is the establishing shot — the work order laid over the site — so it is open on the
 * way in and gone the moment the player starts work. Typing or running is what "starting work"
 * means here; nothing else closes it on its own.
 */
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
