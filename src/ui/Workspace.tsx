import { useRef } from 'react';
import { useGame } from '../game/store.ts';
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

  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);

  return (
    <div className="workspace" ref={workspaceRef}>
      <div
        className="workspace__column workspace__editor"
        style={{ width: `${layout.editorFraction * 100}%` }}
      >
        <EditorPanel />
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
  );
}
