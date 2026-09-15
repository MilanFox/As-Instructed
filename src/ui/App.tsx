import { useEffect, useRef } from 'react';
import { isGraded } from '../game/score.ts';
import { currentLevel, useGame } from '../game/store.ts';
import { CanvasRenderer, RuntimeRunner } from './adapters.ts';
import { exportSave } from '../game/save.ts';
import { worldMeta } from '../levels/index.ts';
import { PublishDialog } from '../meta/ui/PublishDialog.tsx';
import { useLibrary } from '../meta/store.ts';
import { mountAudio } from './audio.ts';
import { mountLibrary } from './library.ts';
import { IconMap } from './components/Icons.tsx';
import { ModalBoundary } from './components/ModalBoundary.tsx';
import { usePaperwork } from './paper/usePaperwork.ts';
import { useKeyboard } from './hooks/useKeyboard.ts';
import { Settings } from './screens/Settings.tsx';
import { LevelSelect } from './screens/LevelSelect.tsx';
import { Workspace } from './workspace/Workspace.tsx';
import './art.ts';
import './styles/fonts.css';
import './styles/app.css';
import './styles/settings.css';
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
      {screen === 'levels' ? <TopBar /> : null}
      {screen === 'workspace' ? <Workspace /> : null}
      {screen === 'levels' ? (
        <div className="screen">
          <LevelSelect />
        </div>
      ) : null}
      <Settings />
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
    </header>
  );
}
