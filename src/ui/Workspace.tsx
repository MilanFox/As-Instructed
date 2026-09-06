import { useMemo, useRef } from 'react';
import { currentLevel, useGame } from '../game/store.ts';
import { useLibrary } from '../meta/index.ts';
import { LibraryPanel, libraryStatusLine } from '../meta/ui/index.ts';
import { HudSheet } from './components/HudSheet.tsx';
import { PanelBoundary } from './components/PanelBoundary.tsx';
import { Splitter } from './components/Splitter.tsx';
import {
  type OverlayId,
  closeOverlay,
  openOverlay,
  useOverlay,
  useOverlayRequests,
} from './hooks/useOverlay.ts';
import { useWorkspaceLayout } from './hooks/useWorkspaceLayout.ts';
import { BriefPanel } from './panels/BriefPanel.tsx';
import { ConsolePanel } from './panels/ConsolePanel.tsx';
import { DocsPanel } from './panels/DocsPanel.tsx';
import { EditorPanel } from './panels/EditorPanel.tsx';
import { ObjectiveRail } from './panels/ObjectiveRail.tsx';
import { TimelineBar } from './panels/TimelineBar.tsx';
import { ViewportPanel } from './panels/ViewportPanel.tsx';

const SHEETS: Record<OverlayId, string> = {
  brief: 'Work order',
  console: 'Console',
  docs: 'Reference',
};

const SHEET_ID = 'workspace-sheet';

/**
 * The site is the screen. The board is the whole workspace and everything else floats over it:
 * the program on its own rig down the left, the objectives and the transport as read-outs, and
 * the brief, the console and the reference summoned one at a time as a sheet.
 */
export function Workspace(): React.JSX.Element {
  const saved = useGame((state) => state.save.settings.layout);
  const setLayout = useGame((state) => state.setLayout);
  const libraryOpen = useLibrary((state) => state.panelOpen && state.save.unlocked);
  const level = useGame(currentLevel);
  const trace = useGame((state) => state.trace);
  const overlay = useOverlay();

  const workspaceRef = useRef<HTMLDivElement | null>(null);

  /*
   * The board as it stands before a run: the renderer draws it as a preview, and the split
   * follows its shape so `w1-03`'s 30x3 corridor and `w4-05`'s 40x40 maze do not get handed the
   * same box. It is memoised because `setPreview` guards on identity — a world rebuilt per render
   * re-fits the camera every frame and cancels any lean with it.
   */
  const world = useMemo(
    () => trace?.initialWorld ?? (level ? level.build(level.seeds[0] as number) : null),
    [level, trace],
  );
  const gridAspect = world && world.h > 0 ? world.w / world.h : 1;
  const layout = useWorkspaceLayout(workspaceRef, saved, gridAspect);

  useOverlayRequests(level?.id ?? null);

  return (
    <div
      className="workspace"
      ref={workspaceRef}
      style={{ ['--rig-w' as string]: `${layout.editorFraction * 100}%` }}
    >
      <ViewportPanel world={world} />

      <div className="rig">
        <EditorPanel />
        <TimelineBar />
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
        min={layout.min}
        max={layout.max}
        onChange={(editorFraction) => setLayout({ editorFraction })}
        containerRef={workspaceRef}
        label="Program width"
      />

      <ObjectiveRail />

      {overlay.open ? (
        <HudSheet
          id={SHEET_ID}
          kind={overlay.open}
          title={SHEETS[overlay.open]}
          focusKey={overlay.requested ? overlay.open : null}
          onClose={closeOverlay}
        >
          {overlay.open === 'brief' ? <BriefPanel /> : null}
          {overlay.open === 'console' ? <ConsolePanel /> : null}
          {overlay.open === 'docs' ? <DocsPanel /> : null}
        </HudSheet>
      ) : null}

      <HudTools open={overlay.open} />
    </div>
  );
}

/**
 * The corner of the board the player summons things from.
 *
 * The Repository owns its own line here (`libraryStatusLine`) and before the unlock there is
 * nothing of it at all, which is what keeps the first three worlds a one-file game.
 */
function HudTools({ open }: { open: OverlayId | null }): React.JSX.Element {
  const unlocked = useLibrary((state) => state.save.unlocked);
  const libraryOpen = useLibrary((state) => state.panelOpen);
  const setPanelOpen = useLibrary((state) => state.setPanelOpen);
  const status = useLibrary(libraryStatusLine);
  const busy = useLibrary((state) => state.busy);
  const lines = useGame((state) => state.console.length);

  return (
    <div className="hud-tools">
      {unlocked ? (
        <span className={busy ? 'statusbar__status statusbar__status--busy' : 'statusbar__status'}>
          {status}
        </span>
      ) : null}
      <div className="hud-chips" role="group" aria-label="Panels">
        <SheetChip id="brief" label="work order" hint="B" open={open} />
        <SheetChip id="console" label="console" hint="C" open={open} count={lines} />
        <SheetChip id="docs" label="reference" hint="F1" open={open} />
        {unlocked ? (
          <button
            type="button"
            className={libraryOpen ? 'hud-chip hud-chip--on' : 'hud-chip'}
            aria-pressed={libraryOpen}
            aria-label="Shared Subroutines Repository"
            onClick={() => setPanelOpen(!libraryOpen)}
          >
            repository
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SheetChip({
  id,
  label,
  hint,
  open,
  count,
}: {
  id: OverlayId;
  label: string;
  hint: string;
  open: OverlayId | null;
  count?: number;
}): React.JSX.Element {
  const on = open === id;
  return (
    <button
      type="button"
      className={on ? 'hud-chip hud-chip--on' : 'hud-chip'}
      aria-expanded={on}
      {...(on ? { 'aria-controls': SHEET_ID } : {})}
      title={`${label} (${hint})`}
      onClick={() => (on ? closeOverlay() : openOverlay(id))}
    >
      {label}
      {count ? <span className="hud-chip__count numeric">{count}</span> : null}
      <span className="hud-chip__key" aria-hidden="true">
        {hint}
      </span>
    </button>
  );
}
