import { useMemo } from 'react';
import type { ApiCall, Snapshot } from '../../engine/index.ts';
import { snapshot } from '../../engine/index.ts';
import { apiFunction } from '../../runtime/index.ts';
import { cursorCalls, entityViewsAt } from '../../game/debug-values.ts';
import type { InspectTarget } from '../../game/debug-values.ts';
import { resolveEventCursor, useGame } from '../../game/store.ts';
import { ValueTree } from '../components/ValueTree.tsx';
import { pick, showCall, useInspect } from '../hooks/useInspect.ts';
import { OverlayPanel, PanelBar } from './OverlayPanel.tsx';
import type { CrewRow, WorkspaceData } from './useWorkspace.ts';

function stateOf(workspace: WorkspaceData): { word: string; tone: string } {
  const single = workspace.runMode === 'debug' ? 'debug' : 'preview';
  if (workspace.runState === 'running') return { word: 'running', tone: 'live' };
  if (workspace.previewState === 'running') return { word: single, tone: 'live' };
  if (workspace.grade?.passed === true) return { word: 'pass', tone: 'pass' };
  if (workspace.grade) return { word: 'fail', tone: 'fail' };
  if (workspace.trace) return { word: single, tone: 'idle' };
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

function targetName(target: InspectTarget, crew: readonly CrewRow[]): string {
  switch (target.kind) {
    case 'tile':
      return `tile ${String(target.at.x)},${String(target.at.y)}`;
    case 'machine':
      return `machine ${target.id}`;
    case 'bot':
      return crew.find((bot) => bot.id === target.id)?.name ?? `bot ${String(target.id)}`;
  }
}

function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function namedArgs(call: ApiCall): Snapshot {
  const params = apiFunction(call.name)?.params ?? [];
  return {
    $: 'object',
    ctor: null,
    entries: call.args.map((value, index) => [params[index]?.name ?? String(index), value]),
    omitted: 0,
  };
}

function CallValues({ call }: { call: ApiCall }): React.ReactElement {
  return (
    <div className="inspect__call">
      <div className="inspect__name">
        {call.name} <span className="crew-row__dim">t{String(call.t)}</span>
      </div>
      {call.args.length > 0 ? <ValueTree value={namedArgs(call)} label="args" /> : null}
      {'threw' in call.outcome ? (
        <ValueTree value={call.outcome.threw} label="threw" />
      ) : (
        <ValueTree value={call.outcome.returned} label="return" />
      )}
    </div>
  );
}

function CursorCalls(): React.ReactElement {
  const calls = useGame(cursorCalls);
  const unrecorded = useGame((state) => {
    const log = state.trace?.calls;
    const last = log?.calls[log.calls.length - 1];
    if (!state.trace || !log || log.dropped === 0) return false;
    const index = resolveEventCursor(state.trace, state.tick, state.eventCursor);
    return index !== null && index > (last ? Math.max(last.eventIndex, ...last.events) : -1);
  });
  if (calls.length > 0) {
    return (
      <>
        {calls.map((call) => (
          <CallValues key={call.seq} call={call} />
        ))}
      </>
    );
  }
  return (
    <p className="inspect__note">
      {unrecorded ? 'not recorded — call log full' : 'no call at this event'}
    </p>
  );
}

function TargetValues({ target }: { target: InspectTarget }): React.ReactElement {
  const views = useGame((state) => entityViewsAt(state, target));
  const now = views?.now ?? null;
  const current = useMemo(() => (now === null ? null : snapshot(now)), [now]);
  const before = views?.before ?? null;
  const previous = useMemo(() => (before === null ? undefined : snapshot(before)), [before]);
  if (now === null || current === null) {
    return <p className="inspect__note">not on the site at this event</p>;
  }
  const unchanged = previous !== undefined && sameSnapshot(current, previous);
  return (
    <>
      {unchanged ? <p className="inspect__note">unchanged by this event</p> : null}
      <ValueTree value={current} previous={unchanged ? undefined : previous} label="now" />
    </>
  );
}

function InspectSection({ crew }: { crew: readonly CrewRow[] }): React.ReactElement {
  const { target } = useInspect();
  const atEvent = useGame(
    (state) =>
      state.trace !== null &&
      resolveEventCursor(state.trace, state.tick, state.eventCursor) !== null,
  );
  return (
    <section className="inspect" aria-label="Inspect">
      <PanelBar
        sub
        tools={
          target ? (
            <button
              type="button"
              className="control control--tight"
              onClick={showCall}
              aria-label="Back to the call"
            >
              x
            </button>
          ) : null
        }
      >
        {target
          ? `Inspect · ${targetName(target, crew)} · ${atEvent ? 'this event' : 'this tick'}`
          : 'Inspect · call'}
      </PanelBar>
      <div className="inspect__body scroll-pane">
        {target ? <TargetValues target={target} /> : <CursorCalls />}
      </div>
    </section>
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
  const debugging = workspace.trace?.calls !== undefined;
  const { target } = useInspect();

  return (
    <OverlayPanel
      className={debugging ? 'telemetry telemetry--debug' : 'telemetry'}
      id="workspace-telemetry"
      open={open}
      label="Telemetry"
    >
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
              {workspace.crew.map((bot) => {
                const cells = (
                  <>
                    <span className="crew-row__name">{bot.name}</span>
                    <span>
                      {String(bot.carrying)}
                      <span className="crew-row__dim">/{String(bot.capacity)}</span>
                    </span>
                    <span className="crew-row__dim">{bot.cargo ?? '—'}</span>
                    <span className="crew-row__dim">t{String(bot.clock)}</span>
                    {bot.waiting > 0 ? <span>✉{String(bot.waiting)}</span> : null}
                  </>
                );
                return debugging ? (
                  <button
                    type="button"
                    className="crew-row crew-row--pick"
                    key={bot.id}
                    data-alive={String(bot.alive)}
                    aria-pressed={target?.kind === 'bot' && target.id === bot.id}
                    title={`Inspect ${bot.name}`}
                    onClick={() => pick({ kind: 'bot', id: bot.id })}
                  >
                    {cells}
                  </button>
                ) : (
                  <div className="crew-row" key={bot.id} data-alive={String(bot.alive)}>
                    {cells}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {debugging ? <InspectSection crew={workspace.crew} /> : null}

        <div className="telemetry__foot">
          <span className="kicker">#4471 · K&amp;D · site feed</span>
        </div>
      </>
    </OverlayPanel>
  );
}
