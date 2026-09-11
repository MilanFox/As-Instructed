import { useEffect } from 'react';
import { useGame } from '../../game/store.ts';
import { useLibrary } from '../../meta/index.ts';
import { usePapers } from '../desk/paper/papers.ts';
import { toggleDeskFocus } from '../desk/focus.ts';
import { KEY_LIST, type KeyId } from '../desk/terminal/keys.ts';
import { closeOverlay, overlayState, toggleOverlay } from './useOverlay.ts';

function isEditorTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('.monaco-editor') !== null;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return isEditorTarget(target);
}

export function isNativeSaveShortcut(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's';
}

export function useKeyboard(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isNativeSaveShortcut(event)) {
        event.preventDefault();
        return;
      }

      const state = useGame.getState();

      const actions: Record<KeyId, () => void> = {
        run: () => {
          state.run();
        },

        escape: () => {
          const papers = usePapers.getState();
          if (papers.lifted) papers.putDown();
          else if (useLibrary.getState().offer) useLibrary.getState().skipPublish(false);
          else if (overlayState().open === 'docs') closeOverlay();
          else if (useLibrary.getState().panelOpen) useLibrary.getState().setPanelOpen(false);
          else if (state.screen !== 'levels' && !isEditorTarget(event.target)) state.goto('levels');
        },

        focus: () => {
          toggleDeskFocus();
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
