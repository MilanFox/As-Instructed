import { useRef } from 'react';
import { useGame } from '../game/store.ts';
import { useLibrary } from '../meta/index.ts';
import { LibraryPanel, libraryStatusLine } from '../meta/ui/index.ts';
import { PanelBoundary } from './components/PanelBoundary.tsx';
import { Splitter } from './components/Splitter.tsx';
import { BriefPanel } from './panels/BriefPanel.tsx';
import { ConsolePanel } from './panels/ConsolePanel.tsx';
import { DocsPanel } from './panels/DocsPanel.tsx';
import { EditorPanel } from './panels/EditorPanel.tsx';
import { ObjectiveRail } from './panels/ObjectiveRail.tsx';
import { TimelineBar } from './panels/TimelineBar.tsx';
import { ViewportPanel } from './panels/ViewportPanel.tsx';

const TABS = [
  { id: 'brief', label: 'brief' },
  { id: 'console', label: 'console' },
  { id: 'docs', label: 'reference' },
] as const;

/** Editor left, site view right, brief/console/reference below it, objectives pinned beside them. */
export function Workspace(): React.JSX.Element {
  const layout = useGame((state) => state.save.settings.layout);
  const setLayout = useGame((state) => state.setLayout);
  const panel = useGame((state) => state.brief);
  const setPanel = useGame((state) => state.setPanel);
  const libraryOpen = useLibrary((state) => state.panelOpen && state.save.unlocked);

  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);

  return (
    <>
      <div className="workspace" ref={workspaceRef}>
        <div
          className="workspace__column workspace__editor"
          style={{ width: `${layout.editorFraction * 100}%` }}
        >
          <EditorPanel />
          {libraryOpen ? (
            <div className="workspace__library">
              <PanelBoundary label="The Repository">
                <LibraryPanel />
              </PanelBoundary>
            </div>
          ) : null}
        </div>

        <Splitter
          orientation="vertical"
          value={layout.editorFraction}
          min={0.24}
          max={0.68}
          onChange={(editorFraction) => setLayout({ editorFraction })}
          containerRef={workspaceRef}
          label="Program width"
        />

        <div className="workspace__column workspace__right" ref={rightRef}>
          <ViewportPanel />
          <TimelineBar />

          <Splitter
            orientation="horizontal"
            value={layout.viewportFraction}
            min={0.25}
            max={0.8}
            onChange={(viewportFraction) => setLayout({ viewportFraction })}
            containerRef={rightRef}
            label="Site view height"
          />

          <div
            className="workspace__lower"
            style={{ height: `${(1 - layout.viewportFraction) * 100}%` }}
          >
            <section className="panel" aria-label="Work order detail">
              <header className="panel__head">
                <div className="tabs" role="tablist" aria-label="Detail panels">
                  {TABS.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      id={`tab-${tab.id}`}
                      className="tab"
                      aria-selected={panel === tab.id}
                      aria-controls="detail-panel"
                      onClick={() => setPanel(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </header>
              <div
                className="panel__body panel__body--flush"
                id="detail-panel"
                role="tabpanel"
                aria-labelledby={`tab-${panel}`}
              >
                {panel === 'brief' ? <BriefPanel /> : null}
                {panel === 'console' ? <ConsolePanel /> : null}
                {panel === 'docs' ? <DocsPanel /> : null}
              </div>
            </section>

            <ObjectiveRail />
          </div>
        </div>
      </div>

      <StatusBar />
    </>
  );
}

/**
 * One line along the bottom of the workspace.
 *
 * The Repository owns the text (`libraryStatusLine`) and the toggle; before the unlock there is
 * nothing here at all, which is what keeps the first three worlds a one-file game.
 */
function StatusBar(): React.JSX.Element | null {
  const unlocked = useLibrary((state) => state.save.unlocked);
  const open = useLibrary((state) => state.panelOpen);
  const setPanelOpen = useLibrary((state) => state.setPanelOpen);
  const status = useLibrary(libraryStatusLine);
  const busy = useLibrary((state) => state.busy);

  if (!unlocked) return null;

  return (
    <div className="statusbar">
      <button
        type="button"
        className="statusbar__toggle"
        aria-pressed={open}
        aria-label="Shared Subroutines Repository"
        onClick={() => setPanelOpen(!open)}
      >
        repository
      </button>
      <span className={busy ? 'statusbar__status statusbar__status--busy' : 'statusbar__status'}>
        {status}
      </span>
    </div>
  );
}
