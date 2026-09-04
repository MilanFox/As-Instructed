import { useEffect, useRef } from 'react';
import { currentLevel, useGame } from '../game/store.ts';
import { CanvasRenderer, RuntimeRunner } from './adapters.ts';
import { countChars } from '../game/score.ts';
import { exportSave } from '../game/save.ts';
import { worldMeta } from '../levels/index.ts';
import { IconBook, IconMap, IconReview } from './components/Icons.tsx';
import { useKeyboard } from './hooks/useKeyboard.ts';
import { LevelSelect } from './screens/LevelSelect.tsx';
import { PerformanceReview } from './screens/PerformanceReview.tsx';
import { Results } from './screens/Results.tsx';
import { Workspace } from './Workspace.tsx';
import './styles/fonts.css';
import './styles/app.css';

export function App(): React.JSX.Element {
  useKeyboard();
  const screen = useGame((state) => state.screen);

  useEffect(() => {
    const state = useGame.getState();
    state.attachRunner(new RuntimeRunner());
    state.attachRenderer(new CanvasRenderer());
    const level = state.currentLevelId;
    if (level) state.runner().prepare(level);
  }, []);

  return (
    <div className="app">
      <TopBar />
      {screen === 'workspace' ? <Workspace /> : null}
      {screen === 'levels' ? (
        <div className="screen">
          <LevelSelect />
        </div>
      ) : null}
      {screen === 'review' ? (
        <div className="screen">
          <PerformanceReview />
        </div>
      ) : null}
      <Results />
    </div>
  );
}

function TopBar(): React.JSX.Element {
  const screen = useGame((state) => state.screen);
  const level = useGame(currentLevel);
  const runState = useGame((state) => state.runState);
  const run = useGame((state) => state.run);
  const goto = useGame((state) => state.goto);
  const setPanel = useGame((state) => state.setPanel);
  const panel = useGame((state) => state.brief);
  const code = useGame((state) => state.code);
  const verdict = useGame((state) => state.verdict);
  const save = useGame((state) => state.save);
  const importSaveFile = useGame((state) => state.importSaveFile);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const running = runState === 'running';
  const chars = countChars(code);
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
            style={{ background: world?.accent ?? 'var(--accent)' }}
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
              className={`stat__value${ticks !== undefined && ticks > level.par.ticks ? ' stat__value--over' : ''}`}
            >
              {ticks ?? '—'}
              <span className="stat__par"> / {level.par.ticks}</span>
            </span>
          </span>
          <span className="stat">
            <span className="stat__label">chars</span>
            <span className={`stat__value${chars > level.par.chars ? ' stat__value--over' : ''}`}>
              {chars}
              <span className="stat__par"> / {level.par.chars}</span>
            </span>
          </span>
        </div>
      ) : null}

      <div className="topbar__actions">
        <button
          type="button"
          className="icon-btn"
          onClick={() => goto('levels')}
          aria-pressed={screen === 'levels'}
          title="Site map (Esc)"
          aria-label="Site map"
        >
          <IconMap />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => goto('review')}
          aria-pressed={screen === 'review'}
          title="Performance review"
          aria-label="Performance review"
        >
          <IconReview />
        </button>
        {screen === 'workspace' ? (
          <button
            type="button"
            className="icon-btn"
            onClick={() => setPanel('docs')}
            aria-pressed={panel === 'docs'}
            title="Reference (F1)"
            aria-label="Reference"
          >
            <IconBook />
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
