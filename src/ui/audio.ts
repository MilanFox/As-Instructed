import { createAudio } from '../audio/index.ts';
import { BASE_TICKS_PER_SECOND, useGame } from '../game/store.ts';
import { getLevel } from '../levels/index.ts';
import { useLibrary } from '../meta/index.ts';

export const audio = createAudio();

const SILENT_BUTTONS = '.btn--run, .timeline__scrub, [aria-selected="true"]';

export function mountAudio(): () => void {
  const initial = useGame.getState();
  const startLevel = initial.currentLevelId ? getLevel(initial.currentLevelId) : undefined;
  if (startLevel) audio.setWorld(startLevel.world);
  audio.setSpeed(initial.speed === Infinity ? null : initial.speed * BASE_TICKS_PER_SECOND);

  const unsubscribeGame = useGame.subscribe((state, previous) => {
    if (state.currentLevelId !== previous.currentLevelId) {
      const level = state.currentLevelId ? getLevel(state.currentLevelId) : undefined;
      if (level) audio.setWorld(level.world);
    }

    if (state.trace !== previous.trace) audio.setTrace(state.trace);

    if (state.speed !== previous.speed) {
      audio.setSpeed(state.speed === Infinity ? null : state.speed * BASE_TICKS_PER_SECOND);
    }

    if (state.runState === 'running' && previous.runState === 'idle') {
      void audio.unlock();
      audio.ui('runStart');
    }

    if (state.runState === 'idle' && previous.runState === 'running') {
      if (!state.showResults && !state.verdict) audio.ui('cancel');
    }

    if (state.brief !== previous.brief) audio.ui('panelOpen');
  });

  const unsubscribeLibrary = useLibrary.subscribe((state, previous) => {
    if (state.panelOpen !== previous.panelOpen) {
      audio.ui(state.panelOpen ? 'panelOpen' : 'panelClose');
    }
    if (state.offer && !previous.offer) audio.ui('panelOpen');
  });

  const onPointerDown = (event: PointerEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest('button');
    if (!button || button.disabled || button.matches(SILENT_BUTTONS)) return;
    void audio.unlock();
    audio.ui('button');
  };
  document.addEventListener('pointerdown', onPointerDown, { passive: true });

  return () => {
    document.removeEventListener('pointerdown', onPointerDown);
    unsubscribeGame();
    unsubscribeLibrary();
  };
}
