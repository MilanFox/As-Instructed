import { useEffect, useRef, useState } from 'react';

import { ApiManual } from './ApiManual.tsx';
import { CodeEditor } from './CodeEditor.tsx';
import { Dossier } from './Dossier.tsx';
import { MIN_DRAWER, clampDrawer, maxDrawer } from './drawerSize.ts';
import type { WorkspaceData } from './useWorkspace.ts';

export type DrawerTab = 'program' | 'dossier' | 'manual';

const TABS: readonly { id: DrawerTab; label: string }[] = [
  { id: 'dossier', label: 'Dossier' },
  { id: 'program', label: 'Program' },
  { id: 'manual', label: 'Manual' },
];

export interface DrawerProps {
  workspace: WorkspaceData;
  open: boolean;
  tab: DrawerTab;
  onTab: (tab: DrawerTab) => void;
  onToggle: () => void;
  onRun: () => void;
  onProblems: (count: number) => void;
  problems: number;
  width: number;
  onWidth: (width: number) => void;
  resizable: boolean;
}

export function Drawer({
  workspace,
  open,
  tab,
  onTab,
  onToggle,
  onRun,
  onProblems,
  problems,
  width,
  onWidth,
  resizable,
}: DrawerProps): React.ReactElement {
  const running = workspace.runState === 'running';
  const last = workspace.console.at(-1);

  const onTabKey = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const at = TABS.findIndex((entry) => entry.id === tab);
    const next = TABS[(at + step + TABS.length) % TABS.length];
    if (!next) return;
    onTab(next.id);
    document.getElementById(`workspace-tab-${next.id}`)?.focus();
  };

  return (
    <div className="drawer" id="workspace-drawer" {...(open ? {} : { inert: true })}>
      {resizable ? <WidthGrip width={width} onWidth={onWidth} /> : null}
      <div className="drawer-tabs" role="tablist" aria-label="Drawer pages" onKeyDown={onTabKey}>
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            id={`workspace-tab-${entry.id}`}
            className="control"
            aria-selected={tab === entry.id}
            aria-controls={`workspace-page-${entry.id}`}
            tabIndex={tab === entry.id ? 0 : -1}
            onClick={() => onTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
        <span className="drawer-tabs__spacer" />
        {tab === 'program' ? (
          <button type="button" className="control" onClick={workspace.resetCode}>
            Reset code
          </button>
        ) : null}
        <button type="button" className="control" onClick={onToggle}>
          Close
        </button>
      </div>

      {/* The editor never unmounts and never changes size — the reading pages sit over it. */}
      <div className="drawer__stack">
        <div
          className="drawer-page drawer-page--code"
          role="tabpanel"
          id="workspace-page-program"
          aria-labelledby="workspace-tab-program"
          {...(tab === 'program' ? {} : { inert: true })}
        >
          <CodeEditor onProblems={onProblems} />
        </div>
        <div
          className="drawer-page drawer-page--read"
          role="tabpanel"
          id="workspace-page-dossier"
          aria-labelledby="workspace-tab-dossier"
          data-on={String(tab === 'dossier')}
          {...(tab === 'dossier' ? {} : { inert: true })}
        >
          <Dossier workspace={workspace} />
        </div>
        <div
          className="drawer-page drawer-page--read"
          role="tabpanel"
          id="workspace-page-manual"
          aria-labelledby="workspace-tab-manual"
          data-on={String(tab === 'manual')}
          {...(tab === 'manual' ? {} : { inert: true })}
        >
          <ApiManual
            reference={workspace.reference}
            types={workspace.types}
            legend={workspace.legend}
          />
        </div>
      </div>

      <div className="drawer__foot">
        <button
          type="button"
          className={running ? 'control control--stop' : 'control control--go'}
          onClick={running ? workspace.cancel : onRun}
        >
          {running ? 'Cancel' : 'Dispatch ⌘⏎'}
        </button>
        <span className="readout readout--dim">
          {problems > 0 ? `${String(problems)} problem${problems === 1 ? '' : 's'} · ` : ''}
          {last ? last.text : 'nothing on the wire'}
        </span>
      </div>
    </div>
  );
}

const NUDGE: Readonly<Record<string, number>> = {
  ArrowLeft: -24,
  ArrowRight: 24,
  PageUp: -120,
  PageDown: 120,
};

function WidthGrip({
  width,
  onWidth,
}: {
  width: number;
  onWidth: (width: number) => void;
}): React.ReactElement {
  const [dragging, setDragging] = useState(false);
  const gripRef = useRef<HTMLDivElement | null>(null);
  // Held-down arrows can outrun a commit, so the nudges count off this rather than the prop.
  const live = useRef(width);
  live.current = width;

  // The ceiling is part of what the grip reports, so it has to follow the window rather than
  // wait for the next width the player picks.
  const [ceiling, setCeiling] = useState(() => maxDrawer(window.innerWidth));
  useEffect(() => {
    const measure = (): void => {
      setCeiling(maxDrawer(window.innerWidth));
    };
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
    };
  }, []);

  const onKeyDown = (event: React.KeyboardEvent): void => {
    const step = NUDGE[event.key];
    const next =
      step !== undefined
        ? live.current + step
        : event.key === 'Home'
          ? MIN_DRAWER
          : event.key === 'End'
            ? maxDrawer(window.innerWidth)
            : null;
    if (next === null) return;
    event.preventDefault();
    const held = clampDrawer(next, window.innerWidth);
    live.current = held;
    onWidth(held);
  };

  return (
    <div
      className="drawer__grip"
      ref={gripRef}
      role="separator"
      aria-orientation="vertical"
      aria-label="Workbench width"
      aria-valuenow={Math.round(width)}
      aria-valuemin={MIN_DRAWER}
      aria-valuemax={ceiling}
      aria-valuetext={`${String(Math.round(width))} pixels`}
      aria-controls="workspace-drawer"
      tabIndex={0}
      data-dragging={String(dragging)}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => {
        event.preventDefault();
        gripRef.current?.setPointerCapture(event.pointerId);
        setDragging(true);
      }}
      onPointerMove={(event) => {
        // Capture is the synchronous truth about whether the grab landed; the dragging state
        // only drives the highlight and may not have committed before the first move.
        if (!gripRef.current?.hasPointerCapture(event.pointerId)) return;
        onWidth(clampDrawer(event.clientX, window.innerWidth));
      }}
      onPointerUp={(event) => {
        gripRef.current?.releasePointerCapture(event.pointerId);
        setDragging(false);
      }}
      onLostPointerCapture={() => {
        setDragging(false);
      }}
    />
  );
}
