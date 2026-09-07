/**
 * `OUTPUT` — the terminal's own log, under the code.
 *
 * `visibleConsole(all, filter, tick)` already filters print output to the
 * playhead, so a printed line and the frame it belongs to line up. The old UI then drew the console
 * in a sheet *over* the board, which made the loop it exists for — watch the number, watch the bot,
 * correlate — impossible to run. The tick alignment was never the defect; the geometry was. On the
 * desk the log is inside the terminal and the site is on the other monitor, so both are in one
 * glance and the alignment is finally worth having.
 *
 * Everything else is `src/ui/panels/ConsolePanel.tsx`'s: the render limit, the auto-scroll, the
 * filter and the `suppressed` count the store reports when a run out-printed its cap.
 */
import { useEffect, useMemo, useRef } from 'react';
import type { ConsoleKind } from '../../../game/store.ts';
import { useGame, visibleConsole } from '../../../game/store.ts';

/** Never render more than this many rows, whatever the filter says. */
const RENDER_LIMIT = 500;

const FILTERS = [
  { id: 'all', label: 'all' },
  { id: 'print', label: 'print' },
  { id: 'system', label: 'system' },
] as const;

/** The prototype's four log inks: dim stamp, error, warning, closure. */
const INK: Record<ConsoleKind, string> = {
  print: '',
  system: 'w',
  error: 'e',
  success: 'o',
};

export function OutputLog(): React.JSX.Element {
  const all = useGame((state) => state.console);
  const filter = useGame((state) => state.consoleFilter);
  const tick = useGame((state) => state.tick);
  const replaying = useGame((state) => state.trace !== null);
  const setFilter = useGame((state) => state.setConsoleFilter);
  const clear = useGame((state) => state.clearConsole);
  const suppressed = useGame((state) => state.suppressed);
  const runState = useGame((state) => state.runState);
  const verdict = useGame((state) => state.verdict);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const lines = useMemo(
    () => visibleConsole(all, filter, replaying ? tick : Number.POSITIVE_INFINITY),
    [all, filter, replaying, tick],
  );
  const shown = lines.length > RENDER_LIMIT ? lines.slice(-RENDER_LIMIT) : lines;
  const hidden = lines.length - shown.length;

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    body.scrollTop = body.scrollHeight;
  }, [lines.length]);

  const meta =
    runState === 'running' ? 'on the wire' : verdict ? (verdict.passed ? 'closed' : 'halted') : 'idle';

  return (
    <div className="term-log">
      <div className="log-head">
        <span>OUTPUT</span>
        <span className="log-tools">
          <span className="log-filter" role="group" aria-label="Output filter">
            {FILTERS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={filter === option.id}
                onClick={() => setFilter(option.id)}
              >
                {option.label}
              </button>
            ))}
          </span>
          <button type="button" className="log-clear" onClick={clear}>
            clear
          </button>
        </span>
        <span className="log-meta">{meta}</span>
      </div>
      <div className="log-body" ref={bodyRef} role="log" aria-label="Output log">
        {shown.length === 0 ? (
          <p className="log-empty">
            Nothing on the wire. print() writes here, stamped with the tick it happened on.
          </p>
        ) : null}
        {hidden > 0 ? (
          <div className="log-note">{hidden.toLocaleString()} earlier lines not shown</div>
        ) : null}
        {shown.map((line) => (
          <div key={line.id}>
            <span className="t">{line.kind === 'print' ? String(line.t).padStart(4, '0') : '    '}</span>
            {'  '}
            <span className={INK[line.kind]}>{line.text}</span>
          </div>
        ))}
        {suppressed > 0 ? (
          <div className="log-note">…{suppressed.toLocaleString()} more lines suppressed</div>
        ) : null}
      </div>
    </div>
  );
}
