import { useEffect, useRef, useState } from 'react';
import { isGraded } from '../game/score.ts';
import { currentLevel, useGame } from '../game/store.ts';
import { CanvasRenderer, RuntimeRunner } from './adapters.ts';
import { exportSave } from '../game/save.ts';
import { worldMeta } from '../levels/index.ts';
// Deep import on purpose: `src/meta/ui/index.ts` also re-exports `LibraryPanel`, which pulls
// Monaco back into the entry chunk and undoes the split inside the terminal.
import { PublishDialog } from '../meta/ui/PublishDialog.tsx';
import { useLibrary } from '../meta/store.ts';
import { mountAudio } from './audio.ts';
import { mountLibrary } from './library.ts';
import { IconMap, IconSound } from './components/Icons.tsx';
import { ModalBoundary } from './components/ModalBoundary.tsx';
import { Desk } from './desk/Desk.tsx';
import { usePaperwork } from './desk/paper/usePaperwork.ts';
import { useKeyboard } from './hooks/useKeyboard.ts';
import { AudioSettings } from './screens/AudioSettings.tsx';
import { LevelSelect } from './screens/LevelSelect.tsx';
// Side effect: sets `data-art` and the palette custom properties before the first render.
import './art.ts';
import './styles/fonts.css';
import './styles/app.css';
import './styles/art/signal.css';
import './styles/art/deepsite.css';

export function App(): React.JSX.Element {
  useKeyboard();
  usePaperwork();
  const screen = useGame((state) => state.screen);

  useEffect(() => {
    const state = useGame.getState();
    const runner = new RuntimeRunner();
    state.attachRunner(runner);
    state.attachRenderer(new CanvasRenderer());
    const detachAudio = mountAudio();
    const detachLibrary = mountLibrary(runner);
    const level = state.currentLevelId;
    if (level) runner.prepare(level);
    return () => {
      detachLibrary();
      detachAudio();
    };
  }, []);

  return (
    <div className="app">
      {/* The desk has no top bar. Every control it carried is an object on the desk instead. */}
      {screen === 'levels' ? <TopBar /> : null}
      {screen === 'workspace' ? <Desk /> : null}
      {screen === 'levels' ? (
        <div className="screen">
          <LevelSelect />
        </div>
      ) : null}
      {/*
        Four of the five ceremonies that used to live here are paper now. `Results`, the hardware
        requisition, the Repository note and the performance memo arrive on the desk and stay
        there until they are filed — see `src/ui/desk/paper/usePaperwork.ts` and
        `docs/AUDIT-UI.md` §6.2 and §6.6. A modal that destroys itself is the defect the desk
        exists to remove, and re-adding one here would undo it.

        The publish offer is the exception and it is not ours: it belongs to `src/meta/ui`. It
        keeps its boundary for the reason the original comment gives — a throw in a dialog the
        player did not open used to unmount the site map, the editor and their unsaved program
        with it (docs/AUDIT-UI.md F21) — and it keeps its own close, because a modal the store
        still thinks is open is a modal the next run raises again.
      */}
      <div className="modal-layer">
        <ModalBoundary
          label="The publish offer"
          onDismiss={() => useLibrary.getState().skipPublish(false)}
        >
          <PublishDialog />
        </ModalBoundary>
      </div>
    </div>
  );
}

function TopBar(): React.JSX.Element {
  const screen = useGame((state) => state.screen);
  const level = useGame(currentLevel);
  const runState = useGame((state) => state.runState);
  const run = useGame((state) => state.run);
  const goto = useGame((state) => state.goto);
  const verdict = useGame((state) => state.verdict);
  const save = useGame((state) => state.save);
  const importSaveFile = useGame((state) => state.importSaveFile);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [sound, setSound] = useState(false);

  const running = runState === 'running';
  const ticks = verdict?.stats.ticks;
  const world = level ? worldMeta(level.world) : undefined;

  const onExport = (): void => {
    const blob = new Blob([exportSave(save)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'bootstrap-progress.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const onImport = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    importSaveFile(await file.text());
  };

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <h1 className="topbar__title">BOOTSTRAP</h1>
        <span className="topbar__org">Kessler &amp; Daughters</span>
      </div>

      {screen === 'workspace' && level ? (
        <div className="topbar__order">
          <span
            className="topbar__world-dot"
            style={{ background: world ? `var(--world-${world.id})` : 'var(--accent)' }}
            aria-hidden="true"
          />
          <span className="topbar__id">{level.id.toUpperCase()}</span>
          <span className="topbar__order-title">{level.title}</span>
        </div>
      ) : (
        <div className="topbar__order">
          <span className="topbar__id">contractor #4471</span>
        </div>
      )}

      <span className="topbar__spacer" />

      {screen === 'workspace' && level ? (
        <div className="topbar__stats">
          {/*
            Par is not a target on an ungraded work order (DESIGN.md §11 A7), so the top bar
            reports the clock and stops there — no denominator to fall short of, and no amber for
            falling short of it. The objective rail draws the same distinction for the same reason.
          */}
          <span className="stat">
            <span className="stat__label">ticks</span>
            <span
              className={`stat__value${isGraded(level) && ticks !== undefined && ticks > level.par.ticks ? ' stat__value--over' : ''}`}
            >
              {ticks ?? '—'}
              {isGraded(level) ? <span className="stat__par"> / {level.par.ticks}</span> : null}
            </span>
          </span>
        </div>
      ) : null}

      <div className="topbar__actions">
        {/*
          The way back to the station. The desk carries the site plan as an object, and this is the
          same door in the other direction — a player who came here from a work order they were
          half way through must not have to find that order again on the map to get back to it.
          `currentLevelId` is still set, so it is one move.
        */}
        {level ? (
          <button
            type="button"
            className="btn topbar__resume"
            onClick={() => goto('workspace')}
            title={`Back to the station — ${level.id.toUpperCase()}`}
          >
            <IconMap />
            <span>back to the station</span>
          </button>
        ) : null}

        <button
          type="button"
          className="icon-btn"
          onClick={() => setSound(true)}
          title="Sound settings"
          aria-label="Sound settings"
        >
          <IconSound />
        </button>

        <button type="button" className="btn btn--ghost" onClick={onExport} title="Export progress">
          export
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => fileRef.current?.click()}
          title="Import progress"
        >
          import
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="sr-only"
          aria-label="Import a progress file"
          onChange={(event) => {
            void onImport(event.target.files?.[0]);
            event.target.value = '';
          }}
        />

        {screen === 'workspace' ? (
          <button
            type="button"
            className={`btn btn--run${running ? ' btn--cancel' : ''}`}
            onClick={run}
            disabled={!level}
          >
            {running ? (
              <>
                <span className="spinner" aria-hidden="true" />
                CANCEL
              </>
            ) : (
              <>
                RUN
                <span className="btn__key">⌘⏎</span>
              </>
            )}
          </button>
        ) : null}
      </div>

      {sound ? <AudioSettings onClose={() => setSound(false)} /> : null}
    </header>
  );
}
