import { useMemo } from 'react';

import { SPEEDS } from '../../game/store.ts';
import { openOverlay, useOverlay } from '../hooks/useOverlay.ts';
import { OverlayPanel, PanelBar } from './OverlayPanel.tsx';
import type { WorkspaceData } from './useWorkspace.ts';
import { describeDebug } from './useWorkspace.ts';

const FILTERS = ['all', 'print', 'system'] as const;

function speedLabel(speed: number): string {
  return Number.isFinite(speed) ? `${String(speed)}×` : 'max';
}

function faultOf(workspace: WorkspaceData): { text: string; jump: boolean } | null {
  if (workspace.divergence) {
    return { text: workspace.divergence, jump: workspace.failure?.line !== undefined };
  }
  const failure = workspace.failure;
  if (!failure) return null;
  const where = failure.line === undefined ? '' : ` · line ${String(failure.line)}`;
  return { text: `${failure.kind}${where} · ${failure.message}`, jump: failure.line !== undefined };
}

export interface TransportDeckProps {
  workspace: WorkspaceData;
  zoom: (rungs: number) => void;
  logOpen: boolean;
  onLog: () => void;
  readout: string | null;
}

export function TransportDeck({
  workspace,
  zoom,
  logOpen,
  onLog,
  readout,
}: TransportDeckProps): React.ReactElement {
  const running = workspace.runState === 'running';
  const end = Math.max(0, Math.round(workspace.endTick));
  const at = Math.min(end, Math.floor(workspace.tick));
  const fault = faultOf(workspace);

  const overlay = useOverlay().open;
  const surveyed = workspace.surveySeed;
  const surveyBusy = surveyed !== null && workspace.previewState === 'running';
  const debugging = workspace.previewState === 'running' && workspace.runMode === 'debug';
  const noTrace = workspace.trace === null;
  // The subroutines file is a flap of its own, so an event attributed to it names a line the
  // player cannot see until they open it.
  const shutLib = workspace.debug.origin?.file === 'lib' && overlay !== 'library';

  const rung = useMemo(() => {
    const found = SPEEDS.indexOf(workspace.speed);
    return found < 0 ? SPEEDS.indexOf(1) : found;
  }, [workspace.speed]);

  const nudgeSpeed = (delta: number): void => {
    const next = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, rung + delta))];
    if (next !== undefined) workspace.setSpeed(next);
  };

  return (
    <OverlayPanel className="transport-deck" label="Transport and run log">
      {fault === null ? null : (
        <p className="fault-strip">
          <span className="fault-strip__text">{fault.text}</span>
          {fault.jump ? (
            <button
              type="button"
              className="control control--tight"
              onClick={workspace.jumpToFailure}
            >
              Go to fault
            </button>
          ) : null}
        </p>
      )}

      <p className="debug-strip">
        {workspace.ungraded === null ? null : (
          <span className="debug-strip__grade">{workspace.ungraded}</span>
        )}
        <span className="debug-strip__text">{describeDebug(workspace.debug)}</span>
        {shutLib ? (
          <button
            type="button"
            className="control control--tight"
            onClick={() => openOverlay('library')}
          >
            Open lib.ts
          </button>
        ) : null}
      </p>

      <div className="transport">
        <button
          type="button"
          className={running || surveyBusy ? 'control control--stop' : 'control control--go'}
          onClick={running ? workspace.cancel : workspace.run}
        >
          {running || surveyBusy
            ? 'Cancel'
            : surveyed === null
              ? 'Dispatch'
              : `Dispatch seed ${String(surveyed)}`}
        </button>

        <button
          type="button"
          className="control control--tight"
          onClick={workspace.debugRun}
          disabled={running}
        >
          {debugging ? 'Cancel debug' : 'Debug run'}
        </button>

        <span className="transport__group">
          <button
            type="button"
            className="control control--tight"
            onClick={() => workspace.step(-1)}
            aria-label="Back one tick"
          >
            −1
          </button>
          <button
            type="button"
            className="control control--tight"
            onClick={workspace.togglePlay}
            aria-label={workspace.playing ? 'Pause playback' : 'Play the run'}
          >
            {workspace.playing ? '❚❚' : '▶'}
          </button>
          <button
            type="button"
            className="control control--tight"
            onClick={() => workspace.step(1)}
            aria-label="Forward one tick"
          >
            +1
          </button>
        </span>

        <span className="transport__group">
          <button
            type="button"
            className="control control--tight"
            onClick={() => workspace.stepEvent(-1)}
            disabled={noTrace}
            aria-label="Back one event"
          >
            «
          </button>
          <button
            type="button"
            className="control control--tight"
            onClick={() => workspace.stepEvent(1)}
            disabled={noTrace}
            aria-label="Forward one event"
          >
            »
          </button>
        </span>

        <input
          className="scrubber"
          type="range"
          min={0}
          max={Math.max(1, end)}
          step={1}
          value={at}
          disabled={end === 0}
          aria-label="Playback tick"
          aria-valuetext={`tick ${String(at)} of ${String(end)}`}
          onChange={(event) => workspace.seek(Number(event.target.value))}
        />

        <span className="readout">
          {String(at).padStart(3, '0')}
          <span className="readout--dim">/{String(end).padStart(3, '0')}</span>
        </span>

        <span className="transport__group">
          <button
            type="button"
            className="control control--tight"
            onClick={() => nudgeSpeed(-1)}
            disabled={rung <= 0}
            aria-label="Slower"
          >
            ◂
          </button>
          <span className="readout" style={{ minWidth: 38, textAlign: 'center' }}>
            {speedLabel(workspace.speed)}
          </span>
          <button
            type="button"
            className="control control--tight"
            onClick={() => nudgeSpeed(1)}
            disabled={rung >= SPEEDS.length - 1}
            aria-label="Faster"
          >
            ▸
          </button>
        </span>

        <span className="transport__group">
          <button
            type="button"
            className="control control--tight"
            onClick={() => zoom(-1)}
            aria-label="Zoom out"
          >
            −
          </button>
          <button type="button" className="control control--tight" onClick={() => zoom(0)}>
            Fit
          </button>
          <button
            type="button"
            className="control control--tight"
            onClick={() => zoom(1)}
            aria-label="Zoom in"
          >
            +
          </button>
        </span>
      </div>

      <div className="run-log">
        <PanelBar
          sub
          tools={
            <>
              {FILTERS.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  className="control control--tight"
                  aria-pressed={workspace.consoleFilter === filter}
                  onClick={() => workspace.setConsoleFilter(filter)}
                >
                  {filter}
                </button>
              ))}
              <button
                type="button"
                className="control control--tight"
                onClick={workspace.clearConsole}
              >
                Clear
              </button>
              <button
                type="button"
                className="control control--tight"
                aria-expanded={logOpen}
                aria-controls={logOpen ? 'workspace-run-log' : undefined}
                onClick={onLog}
              >
                {logOpen ? 'Hide' : 'Show'}
              </button>
            </>
          }
        >
          Log{workspace.suppressed > 0 ? ` · ${String(workspace.suppressed)} held` : ''}
          {readout === null ? '' : ` · ${readout}`}
        </PanelBar>
        {logOpen ? (
          <div className="run-log__lines scroll-pane" id="workspace-run-log">
            {workspace.console.length === 0 ? (
              <p className="empty-note">nothing on the wire</p>
            ) : (
              workspace.console.map((line) => (
                <p className="run-log__line" key={line.id} data-kind={line.kind}>
                  <span className="run-log__tick">{String(Math.round(line.t))}</span>
                  <span className="run-log__text">{line.text}</span>
                </p>
              ))
            )}
          </div>
        ) : null}
      </div>
    </OverlayPanel>
  );
}
