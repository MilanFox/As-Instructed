import { useEffect } from 'react';
import { useGame } from '../../game/store.ts';
import { useLibrary } from '../../meta/index.ts';
import { usePapers } from '../desk/paper/papers.ts';
import { KEY_LIST, type KeyId } from '../desk/terminal/keys.ts';
import { closeOverlay, overlayState, toggleOverlay } from './useOverlay.ts';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.closest('.monaco-editor') !== null;
}

/**
 * Global shortcuts. DESIGN.md §10.5 — the game is playable without a mouse.
 *
 * The bindings themselves are `src/ui/desk/terminal/keys.ts`, which is also what the REFERENCE
 * manual prints: a key the manual announces and a key the listener binds cannot be two different
 * facts (docs/AUDIT-UI.md F17). This file owns only what each one *does*, and the
 * `Record<KeyId, …>` below is what makes the two lists the same length — an unbound listed key and
 * an unlisted bound key are both compile errors.
 *
 * Anything that would steal a character from a text field is gated behind `isTypingTarget`; the
 * two bindings marked `always` deliberately are not, because Run and the way out must work from
 * anywhere including the editor.
 */
export function useKeyboard(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const state = useGame.getState();

      const actions: Record<KeyId, () => void> = {
        run: () => {
          state.run();
        },

        /*
         * The way out, innermost thing first — and it destroys nothing on the way.
         *
         * A sheet held up to the lamp goes back on the desk. The publish offer is a real modal and
         * closes as one. Then the open book. Then `~/lib.ts`, which is the terminal's other file
         * rather than an overlay, so leaving it puts the work order back on the screen. Then the
         * work order itself.
         *
         * It deliberately does not dismiss the run report. On the desk the report is paper and it
         * lies there until it is filed (docs/AUDIT-UI.md §6.2, §6.6): a key that made a player's
         * grade unreachable would be the same data loss the desk exists to remove, with a keyboard
         * instead of a stray click.
         */
        escape: () => {
          const papers = usePapers.getState();
          if (papers.lifted) papers.putDown();
          else if (useLibrary.getState().offer) useLibrary.getState().skipPublish(false);
          else if (overlayState().open === 'docs') closeOverlay();
          else if (useLibrary.getState().panelOpen) useLibrary.getState().setPanelOpen(false);
          else if (state.screen !== 'levels') state.goto('levels');
        },

        play: () => {
          state.togglePlay();
        },
        back: () => {
          state.step(event.shiftKey ? -10 : -1);
        },
        forward: () => {
          state.step(event.shiftKey ? 10 : 1);
        },
        first: () => {
          state.pause();
          state.seek(0);
        },
        last: () => {
          state.pause();
          state.seek(state.endTick);
        },
        reference: () => {
          toggleOverlay('docs');
        },
      };

      const typing = isTypingTarget(event.target);
      const modified = event.metaKey || event.ctrlKey || event.altKey;

      for (const binding of KEY_LIST) {
        if (!binding.matches(event)) continue;
        if (!binding.always) {
          if (typing || modified) return;
          if (state.screen !== 'workspace') return;
        }
        event.preventDefault();
        actions[binding.id]();
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
