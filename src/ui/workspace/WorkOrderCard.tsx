import { useMemo } from 'react';
import { factTerms } from './fact-terms.ts';
import { ObjectiveItem } from './ObjectiveItem.tsx';
import { OverlayPanel, PanelBar, StatCell } from './OverlayPanel.tsx';
import type { WorkspaceData } from './useWorkspace.ts';

export interface WorkOrderCardProps {
  workspace: WorkspaceData;
  compact?: boolean;
  open?: boolean;
  statusOpen?: boolean;
  onToggle?: () => void;
  onStatus?: () => void;
  onManual?: () => void;
}

export function WorkOrderCard({
  workspace,
  compact = false,
  open = true,
  statusOpen = false,
  onToggle,
  onStatus,
  onManual,
}: WorkOrderCardProps): React.ReactElement | null {
  const brief = workspace.brief;
  const facts = brief?.facts;
  const terms = useMemo(() => factTerms(facts ?? []), [facts]);
  if (!brief || !workspace.level) return null;

  const rows = [...workspace.objectives, ...workspace.bonus];
  const graded = workspace.targets.graded;
  const ticks = workspace.targets.ticks;
  const over = graded && ticks !== null && ticks > workspace.targets.par;
  const limit = workspace.targets.hardStop;
  const seeds = brief.seeds.length;
  const requisition = compact ? workspace.requisition : null;

  return (
    <OverlayPanel className="work-order" open={open} label="Level">
      <PanelBar
        tools={
          compact ? (
            <>
              <button
                type="button"
                className="control control--tight"
                aria-expanded={statusOpen}
                aria-controls="workspace-telemetry"
                onClick={onStatus}
              >
                Status
              </button>
              <button
                type="button"
                className="control control--tight"
                aria-expanded={open}
                aria-controls="workspace-order-fold"
                onClick={onToggle}
              >
                {open ? 'Hide' : 'Show'}
              </button>
            </>
          ) : undefined
        }
      >
        {brief.kicker}
      </PanelBar>

      {requisition ? (
        <div className="chip-row work-order__commands" role="group" aria-label="New commands">
          <span className="kicker">New commands</span>
          {requisition.hardware.map((name) => (
            <span className="chip" key={name}>
              {name}
            </span>
          ))}
          <span className="work-order__command-tools">
            <button type="button" className="control control--tight" onClick={onManual}>
              Manual
            </button>
            <button
              type="button"
              className="control control--tight"
              onClick={workspace.signRequisition}
              aria-label="Close new commands"
            >
              Close
            </button>
          </span>
        </div>
      ) : null}

      <div className="work-order__fold" id="workspace-order-fold">
        <div className="work-order__head">
          <span
            className="work-order__id"
            style={
              {
                '--world': `var(${workspace.world?.accentVar ?? '--accent'})`,
              } as React.CSSProperties
            }
          >
            {brief.head[1]}
          </span>
          <div>
            <h1 className="work-order__title">{brief.title}</h1>
            <span className="kicker work-order__seeds">
              {String(seeds)} board{seeds === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        <ul className="work-order__objectives scroll-pane">
          {rows.map((row) => (
            <ObjectiveItem key={row.id} row={row} terms={terms} />
          ))}
        </ul>

        <div className="stat-grid">
          <StatCell
            label="For gold"
            value={graded ? `≤ ${String(workspace.targets.par)} ticks` : '—'}
          />
          <StatCell
            label="Ticks"
            value={ticks === null ? '—' : String(ticks)}
            tone={over ? 'over' : undefined}
          />
          {limit === null ? null : <StatCell label="Tick limit" value={`${String(limit)} ticks`} />}
        </div>
      </div>
    </OverlayPanel>
  );
}
