/**
 * The audio system, wired to the shell.
 *
 * `src/audio` is a cursor over the trace driven by the renderer's clock (docs/AUDIO.md §1), so the
 * only per-frame wire is `attach(renderer)`. Everything else is a reaction to a store transition,
 * which is why this lives here rather than inside `src/game/store.ts`: the store stays a pure
 * state machine that runs in Node under Vitest, and nothing in it has to know a speaker exists.
 */
import { createAudio } from '../audio/index.ts';
import { BASE_TICKS_PER_SECOND, useGame } from '../game/store.ts';
import { getLevel } from '../levels/index.ts';
import { useLibrary } from '../meta/index.ts';

export const audio = createAudio();

/** Buttons that already have a sound of their own, or that are not really buttons. */
const SILENT_BUTTONS = '.btn--run, .timeline__scrub, [aria-selected="true"]';

/**
 * Subscribes the audio system to the two stores and to clicks, and returns the teardown.
 *
 * Called once from `App`. Every branch below is a transition rather than a value, because the
 * conductor is the thing that decides how often a sound is allowed to happen — the shell's job is
 * only to say what happened.
 */
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

    // A run that ends without a report and without a verdict is one the player stopped.
    if (state.runState === 'idle' && previous.runState === 'running') {
      if (!state.showResults && !state.verdict) audio.ui('cancel');
    }

    /*
     * The outcome sting is *not* fired here.
     *
     * `<Results/>` escalates — objectives tick off, then the medal lands — and the medal sound has
     * to land with the medal rather than a second before it. The report owns that sequence and
     * calls `audio.outcome` itself; firing it here as well would play the whole thing twice.
     */

    if (state.brief !== previous.brief) audio.ui('panelOpen');
  });

  const unsubscribeLibrary = useLibrary.subscribe((state, previous) => {
    if (state.panelOpen !== previous.panelOpen) {
      audio.ui(state.panelOpen ? 'panelOpen' : 'panelClose');
    }
    if (state.offer && !previous.offer) audio.ui('panelOpen');
  });

  // One delegated listener rather than a callback on forty buttons: the conductor rate-limits UI
  // sounds anyway, so the cost of being wrong here is a click that is dropped, not a machine gun.
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
