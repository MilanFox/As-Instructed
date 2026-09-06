import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { isGraded } from '../game/score.ts';
import { currentLevel, useGame } from '../game/store.ts';
import { CanvasRenderer, RuntimeRunner } from './adapters.ts';
import { exportSave } from '../game/save.ts';
import { worldMeta } from '../levels/index.ts';
// Deep import on purpose: `src/meta/ui/index.ts` also re-exports `LibraryPanel`, which pulls
// Monaco back into the entry chunk and undoes the split below.
import { PublishDialog } from '../meta/ui/PublishDialog.tsx';
import { useLibrary } from '../meta/store.ts';
import { mountAudio } from './audio.ts';
import { mountLibrary } from './library.ts';
import { IconBook, IconMap, IconSound } from './components/Icons.tsx';
import { ModalBoundary } from './components/ModalBoundary.tsx';
import { useKeyboard } from './hooks/useKeyboard.ts';
import { AudioSettings } from './screens/AudioSettings.tsx';
import { LevelSelect } from './screens/LevelSelect.tsx';
import { RepositoryIssue } from './screens/RepositoryIssue.tsx';
import { Requisition } from './screens/Requisition.tsx';
import { Results } from './screens/Results.tsx';
import { ReviewMemo } from './screens/ReviewMemo.tsx';
import { reviewOwed } from './screens/review.ts';
// Side effect: sets `data-art` and the palette custom properties before the first render.
import './art.ts';
import './styles/fonts.css';
import './styles/app.css';
import './styles/art/survey.css';
import './styles/art/signal.css';
import './styles/art/deepsite.css';

/**
 * The workspace is the only screen that needs Monaco, and Monaco is most of the build. Splitting
 * it out is what keeps the site map — the screen the game opens on — a small download.
 */
const Workspace = lazy(async () => ({ default: (await import('./Workspace.tsx')).Workspace }));

/** The memo files itself by rank, so closing a broken one has to look the rank up the same way. */
function fileOwedReview(): void {
  const state = useGame.getState();
  const tier = reviewOwed(state.save);
  if (tier) state.fileReview(tier.rank);
}

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
      {/*
        One boundary per modal, not one around the layer.
        A throw in any of these used to unmount the whole tree — the site map, the editor and the
        player's unsaved program went with it, for a fault in a dialog they did not open
        (docs/AUDIT-UI.md F21). They are boundaried separately because they stack: a publish offer
        that falls over must still leave the run report that raised it on the screen. Each one
        hands the boundary its own close, because a modal the store still thinks is open is a modal
        the next run raises again.
      */}
      <div className="modal-layer">
        <ModalBoundary label="The run report" onDismiss={() => useGame.getState().dismissResults()}>
          <Results />
        </ModalBoundary>
        <ModalBoundary
          label="The publish offer"
          onDismiss={() => useLibrary.getState().skipPublish(false)}
        >
          <PublishDialog />
        </ModalBoundary>
        {/* The Repository note waits for the hardware crate itself, so order here is cosmetic. */}
        <ModalBoundary
          label="The Repository note"
          onDismiss={() => useLibrary.getState().markBriefed()}
        >
          <RepositoryIssue />
        </ModalBoundary>
        {/* Last, so the delivery note stacks above a publish offer raised by the same transition. */}
        <ModalBoundary
          label="The delivery note"
          onDismiss={() => useGame.getState().signRequisition()}
        >
          <Requisition />
        </ModalBoundary>
        {/* Site map only, and it checks the other four are gone. Nothing here shares its screen. */}
        <ModalBoundary label="The performance memo" onDismiss={fileOwedReview}>
          <ReviewMemo />
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
