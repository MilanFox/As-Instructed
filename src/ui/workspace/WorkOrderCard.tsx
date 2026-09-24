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
}

export function WorkOrderCard({
  workspace,
  compact = false,
  open = true,
  statusOpen = false,
  onToggle,
  onStatus,
}: WorkOrderCardProps): React.ReactElement | null {
  const brief = workspace.brief;
  if (!brief || !workspace.level) return null;

  const rows = [...workspace.objectives, ...workspace.bonus];
  const graded = workspace.targets.graded;
  const ticks = workspace.targets.ticks;
  const over = graded && ticks !== null && ticks > workspace.targets.par;
  const limit = workspace.targets.hardStop;
  const seeds = brief.seeds.length;

  return (
    <OverlayPanel className="work-order" open={open} label="Work order">
      <PanelBar
        tools={
          <>
            <button
              type="button"
              className="control control--tight"
              onClick={() => workspace.goto('levels')}
            >
              Site map
            </button>
            {compact ? (
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
                  {open ? 'Hide' : 'Order'}
                </button>
              </>
            ) : null}
          </>
        }
      >
        {brief.kicker}
      </PanelBar>

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
              {String(seeds)} seed{seeds === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        <ul className="work-order__objectives scroll-pane">
          {rows.map((row) => (
            <ObjectiveItem key={row.id} row={row} />
          ))}
        </ul>

        <div className="stat-grid">
          <StatCell label="Par" value={graded ? `${String(workspace.targets.par)} t` : '—'} />
          <StatCell
            label="Ticks"
            value={ticks === null ? '—' : String(ticks)}
            tone={over ? 'over' : undefined}
          />
          <StatCell
            label="Limit"
            value={
              limit === null
                ? workspace.targets.hasTickLimit
                  ? 'graded'
                  : 'none'
                : `${String(limit)} t`
            }
          />
          <StatCell
            label="Banked"
            value={`${String(workspace.bankedCount)}/${String(workspace.objectives.length)}`}
            tone={
              workspace.objectives.length > 0 &&
              workspace.bankedCount >= workspace.objectives.length
                ? 'good'
                : undefined
            }
          />
        </div>
      </div>
    </OverlayPanel>
  );
}
