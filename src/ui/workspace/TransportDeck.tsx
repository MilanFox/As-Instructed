import { useMemo } from 'react';

import type { ApiCall, Trace } from '../../engine/index.ts';
import { cursorCalls } from '../../game/debug-values.ts';
import { SPEEDS, useGame } from '../../game/store.ts';
import { showCall } from '../hooks/useInspect.ts';
import { openOverlay, useOverlay } from '../hooks/useOverlay.ts';
import { callLine, unrecordedNote } from './call-text.ts';
import { OverlayPanel, PanelBar } from './OverlayPanel.tsx';
import { RunLogLine } from './RunLogLine.tsx';
import type { DebugView, WorkspaceData } from './useWorkspace.ts';
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

const CALL_CHARS = 48;

function lastRecordedEvent(trace: Trace | null): number | null {
  const last = trace?.calls?.calls.at(-1);
  if (last === undefined) return null;
  return Math.max(last.eventIndex, ...last.events);
}

function callToken(calls: readonly ApiCall[]): string | null {
  const first = calls[0];
  if (first === undefined) return null;
  const more = calls.length > 1 ? ` +${String(calls.length - 1)}` : '';
  return `${callLine(first, CALL_CHARS)}${more}`;
}

// describeDebug reads `event n of m · kind · line`; the call takes the kind's place.
function splitDebug(debug: DebugView): { head: string; tail: string } | null {
  if (debug.note !== null || debug.index === null) return null;
  const head = `event ${String(debug.index + 1)} of ${String(debug.total)} · `;
  const full = describeDebug(debug);
  const kind = `${head}${debug.kind ?? '—'} · `;
  if (!full.startsWith(kind)) return null;
  return { head, tail: ` · ${full.slice(kind.length)}` };
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

  const recording = workspace.trace?.calls !== undefined;
  const dropped = workspace.trace?.calls?.dropped ?? 0;
  const calls = useGame(cursorCalls);
  const lastRecorded = useMemo(() => lastRecordedEvent(workspace.trace), [workspace.trace]);
  const debugParts = recording ? splitDebug(workspace.debug) : null;
  const pastLog =
    dropped > 0 &&
    workspace.debug.index !== null &&
    (lastRecorded === null || workspace.debug.index > lastRecorded);
  const token = pastLog ? null : callToken(calls);

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
        <span className="transport__group debug-strip__step">
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
        {debugParts !== null && (pastLog || token !== null) ? (
          <span className="debug-strip__text">
            {debugParts.head}
            {token === null ? (
              <span className="debug-strip__unrecorded">not recorded — call log full</span>
            ) : (
              <button
                type="button"
                className="debug-strip__call"
                onClick={showCall}
                title="Inspect this call"
              >
                {token}
              </button>
            )}
            {debugParts.tail}
          </span>
        ) : (
          <span className="debug-strip__text">{describeDebug(workspace.debug)}</span>
        )}
        {recording && dropped > 0 ? (
          <span className="debug-strip__grade debug-strip__cap" title={unrecordedNote(dropped)}>
            {unrecordedNote(dropped)}
          </span>
        ) : null}
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
              workspace.console.map((line) => <RunLogLine key={line.id} line={line} />)
            )}
          </div>
        ) : null}
      </div>
    </OverlayPanel>
  );
}
