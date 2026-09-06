import { useEffect } from 'react';
import { useGame } from '../../game/store.ts';
import { useLibrary } from '../../meta/index.ts';
import { closeOverlay, overlayState, toggleOverlay } from './useOverlay.ts';
import { toggleRail } from './useRail.ts';

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
 * Anything that would steal a character from a text field is gated behind `isTypingTarget`;
 * Ctrl/Cmd+Enter deliberately is not, because Run must work from anywhere including the editor.
 */
export function useKeyboard(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const state = useGame.getState();
      const typing = isTypingTarget(event.target);

      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        state.run();
        return;
      }

      if (event.key === 'Escape') {
        // Innermost thing first. The publish offer is a modal, and Escape on a modal closes the
        // modal — it does not walk out of the work order underneath it. A sheet over the board is
        // the same rule one level further in: it is dismissed before the work order is.
        if (useLibrary.getState().offer) useLibrary.getState().skipPublish(false);
        else if (state.showResults) state.dismissResults();
        else if (state.screen === 'workspace' && overlayState().open !== null) closeOverlay();
        else if (state.screen !== 'levels') state.goto('levels');
        event.preventDefault();
        return;
      }

      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (state.screen !== 'workspace') return;

      switch (event.key) {
        case ' ':
          state.togglePlay();
          break;
        case 'ArrowLeft':
        case ',':
          state.step(event.shiftKey ? -10 : -1);
          break;
        case 'ArrowRight':
        case '.':
          state.step(event.shiftKey ? 10 : 1);
          break;
        case 'Home':
          state.pause();
          state.seek(0);
          break;
        case 'End':
          state.pause();
          state.seek(state.endTick);
          break;
        case 'b':
          toggleOverlay('brief');
          break;
        case 'c':
          toggleOverlay('console');
          break;
        case 'o':
          toggleRail();
          break;
        case '?':
        case 'F1':
          toggleOverlay('docs');
          break;
        default:
          return;
      }
      event.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
