import { ApiManual } from './ApiManual.tsx';
import { CodeEditor } from './CodeEditor.tsx';
import { Dossier } from './Dossier.tsx';
import type { WorkspaceData } from './useWorkspace.ts';

export type DrawerTab = 'program' | 'dossier' | 'manual';

export interface DrawerProps {
  workspace: WorkspaceData;
  on: boolean;
  tab: DrawerTab;
  onToggle: () => void;
  onRun: () => void;
  onProblems: (count: number) => void;
  problems: number;
}

export function Drawer({
  workspace,
  on,
  tab,
  onToggle,
  onRun,
  onProblems,
  problems,
}: DrawerProps): React.ReactElement {
  const running = workspace.runState === 'running';
  const last = workspace.console.at(-1);

  return (
    <section
      className="flyout drawer"
      id="workspace-drawer"
      aria-label="Side panel"
      data-on={String(on)}
      {...(on ? {} : { inert: true })}
    >
      <div className="drawer-tabs">
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
          role="region"
          id="workspace-page-program"
          aria-label="Program"
          {...(tab === 'program' ? {} : { inert: true })}
        >
          <CodeEditor onProblems={onProblems} />
        </div>
        <div
          className="drawer-page drawer-page--read"
          role="region"
          id="workspace-page-dossier"
          aria-label="Brief"
          data-on={String(tab === 'dossier')}
          {...(tab === 'dossier' ? {} : { inert: true })}
        >
          <Dossier workspace={workspace} />
        </div>
        <div
          className="drawer-page drawer-page--read"
          role="region"
          id="workspace-page-manual"
          aria-label="Manual"
          data-on={String(tab === 'manual')}
          {...(tab === 'manual' ? {} : { inert: true })}
        >
          <ApiManual
            reference={workspace.reference}
            types={workspace.types}
            legend={workspace.legend}
            guideIds={workspace.guideIds}
          />
        </div>
      </div>

      <div className="drawer__foot">
        <button
          type="button"
          className={running ? 'control control--stop' : 'control control--go'}
          onClick={running ? workspace.cancel : onRun}
        >
          {running ? 'Cancel' : 'Run ⌘⏎'}
        </button>
        <span className="readout readout--dim">
          {problems > 0 ? `${String(problems)} problem${problems === 1 ? '' : 's'} · ` : ''}
          {last ? last.text : 'No output yet.'}
        </span>
      </div>
    </section>
  );
}
