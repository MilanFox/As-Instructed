import { ApiManual } from './ApiManual.tsx';
import { CodeEditor } from './CodeEditor.tsx';
import { Dossier } from './Dossier.tsx';
import type { WorkspaceData } from './useWorkspace.ts';

export type DrawerTab = 'program' | 'dossier' | 'manual';

const TABS: readonly { id: DrawerTab; label: string }[] = [
  { id: 'dossier', label: 'Dossier' },
  { id: 'program', label: 'Program' },
  { id: 'manual', label: 'Manual' },
];

export interface DrawerProps {
  workspace: WorkspaceData;
  on: boolean;
  tab: DrawerTab;
  onTab: (tab: DrawerTab) => void;
  onToggle: () => void;
  onRun: () => void;
  onProblems: (count: number) => void;
  problems: number;
}

export function Drawer({
  workspace,
  on,
  tab,
  onTab,
  onToggle,
  onRun,
  onProblems,
  problems,
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
    <section
      className="flyout drawer"
      id="workspace-drawer"
      aria-label="Workbench"
      data-on={String(on)}
      {...(on ? {} : { inert: true })}
    >
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
    </section>
  );
}
