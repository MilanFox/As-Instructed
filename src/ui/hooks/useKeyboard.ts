import { useEffect } from 'react';
import { useGame } from '../../game/store.ts';

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
        if (state.showResults) state.dismissResults();
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
        case '?':
        case 'F1':
          state.setPanel('docs');
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
