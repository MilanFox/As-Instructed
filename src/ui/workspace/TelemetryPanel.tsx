import { OverlayPanel, PanelBar } from './OverlayPanel.tsx';
import type { WorkspaceData } from './useWorkspace.ts';

function stateOf(workspace: WorkspaceData): { word: string; tone: string } {
  if (workspace.runState === 'running') return { word: 'running', tone: 'live' };
  if (workspace.previewState === 'running') return { word: 'preview', tone: 'live' };
  if (workspace.grade?.passed === true) return { word: 'pass', tone: 'pass' };
  if (workspace.grade) return { word: 'fail', tone: 'fail' };
  if (workspace.trace) return { word: 'preview', tone: 'idle' };
  return { word: 'idle', tone: 'idle' };
}

function FuelMeter({ fuel, max }: { fuel: number; max: number }): React.ReactElement {
  const pct = max > 0 ? Math.max(0, Math.min(100, (fuel / max) * 100)) : 0;
  const readout = `${String(Math.round(fuel))} / ${String(Math.round(max))}`;
  return (
    <div className="fuel-row">
      <span className="stat-cell__label">Fuel</span>
      <span className="progress-meter">
        <span
          className="progress-meter__track"
          role="progressbar"
          aria-label="Fuel"
          aria-valuemin={0}
          aria-valuemax={Math.round(max)}
          aria-valuenow={Math.round(fuel)}
          aria-valuetext={`${readout} units`}
        >
          <span
            className="progress-meter__fill"
            style={{
              width: `${String(pct)}%`,
              ...(pct < 20 ? { background: 'var(--danger)' } : {}),
            }}
          />
        </span>
        <span className="progress-meter__read">{readout}</span>
      </span>
    </div>
  );
}

export interface TelemetryPanelProps {
  workspace: WorkspaceData;
  compact?: boolean;
  open?: boolean;
  reportHidden?: boolean;
  onClose?: () => void;
  onReport?: () => void;
}

export function TelemetryPanel({
  workspace,
  compact = false,
  open = true,
  reportHidden = true,
  onClose,
  onReport,
}: TelemetryPanelProps): React.ReactElement {
  const state = stateOf(workspace);
  const end = Math.max(0, Math.round(workspace.endTick));
  const at = Math.min(end, Math.floor(workspace.tick));

  return (
    <OverlayPanel className="telemetry" id="workspace-telemetry" open={open} label="Telemetry">
      <>
        <PanelBar
          tools={
            <>
              {workspace.report && reportHidden ? (
                <button type="button" className="control control--tight" onClick={onReport}>
                  Report
                </button>
              ) : null}
              {compact ? (
                <button
                  type="button"
                  className="control control--tight"
                  onClick={onClose}
                  aria-label="Hide telemetry"
                >
                  Hide
                </button>
              ) : null}
            </>
          }
        >
          Telemetry
        </PanelBar>

        <div className="vitals">
          <span className="vitals__tick">
            {String(at).padStart(3, '0')}
            <span className="vitals__of">/{String(end).padStart(3, '0')}</span>
          </span>
          <span className="run-state" data-tone={state.tone}>
            {state.word}
          </span>
        </div>

        {workspace.fuel ? <FuelMeter fuel={workspace.fuel.fuel} max={workspace.fuel.max} /> : null}

        {workspace.crew.length === 0 ? null : (
          <>
            <PanelBar sub>Crew</PanelBar>
            <div className="crew-list scroll-pane">
              {workspace.crew.map((bot) => (
                <div className="crew-row" key={bot.id} data-alive={String(bot.alive)}>
                  <span className="crew-row__name">{bot.name}</span>
                  <span>
                    {String(bot.carrying)}
                    <span className="crew-row__dim">/{String(bot.capacity)}</span>
                  </span>
                  <span className="crew-row__dim">{bot.cargo ?? '—'}</span>
                  <span className="crew-row__dim">t{String(bot.clock)}</span>
                  {bot.waiting > 0 ? <span>✉{String(bot.waiting)}</span> : null}
                </div>
              ))}
            </div>
          </>
        )}

        <div className="telemetry__foot">
          <span className="kicker">#4471 · K&amp;D · site feed</span>
        </div>
      </>
    </OverlayPanel>
  );
}
