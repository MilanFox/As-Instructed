import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { currentLevel, useGame } from '../game/store.ts';
import { CanvasRenderer, RuntimeRunner } from './adapters.ts';
import { exportSave } from '../game/save.ts';
import { worldMeta } from '../levels/index.ts';
// Deep import on purpose: `src/meta/ui/index.ts` also re-exports `LibraryPanel`, which pulls
// Monaco back into the entry chunk and undoes the split below.
import { PublishDialog } from '../meta/ui/PublishDialog.tsx';
import { mountAudio } from './audio.ts';
import { mountLibrary } from './library.ts';
import { IconBook, IconMap, IconReview, IconSound } from './components/Icons.tsx';
import { useKeyboard } from './hooks/useKeyboard.ts';
import { AudioSettings } from './screens/AudioSettings.tsx';
import { LevelSelect } from './screens/LevelSelect.tsx';
import { PerformanceReview } from './screens/PerformanceReview.tsx';
import { Requisition } from './screens/Requisition.tsx';
import { Results } from './screens/Results.tsx';
import './styles/fonts.css';
import './styles/app.css';

/**
 * The workspace is the only screen that needs Monaco, and Monaco is most of the build. Splitting
 * it out is what keeps the site map — the screen the game opens on — a small download.
 */
const Workspace = lazy(async () => ({ default: (await import('./Workspace.tsx')).Workspace }));

export function App(): React.JSX.Element {
  useKeyboard();
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
      <TopBar />
      {screen === 'workspace' ? (
        <Suspense fallback={<div className="screen screen--loading">opening the terminal…</div>}>
          <Workspace />
        </Suspense>
      ) : null}
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
      <PublishDialog />
      {/* Last, so the delivery note stacks above a publish offer raised by the same transition. */}
      <Requisition />
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
