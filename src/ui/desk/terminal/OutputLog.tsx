import { useEffect, useMemo, useRef } from 'react';
import type { ConsoleKind } from '../../../game/store.ts';
import { useGame, visibleConsole } from '../../../game/store.ts';

const RENDER_LIMIT = 500;

const FILTERS = [
  { id: 'all', label: 'all' },
  { id: 'print', label: 'print' },
  { id: 'system', label: 'system' },
] as const;

const INK: Record<ConsoleKind, string> = {
  print: '',
  system: 'w',
  error: 'e',
  success: 'o',
  notice: 'w',
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
    runState === 'running'
      ? 'on the wire'
      : verdict
        ? verdict.passed
          ? 'closed'
          : 'halted'
        : 'idle';

  const holding = all.length > 0 || suppressed > 0 || runState === 'running';

  return (
    <div className="term-log" data-empty={holding ? 'no' : 'yes'}>
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
            <span className="t">
              {line.kind === 'print' || line.kind === 'notice'
                ? String(line.t).padStart(4, '0')
                : '    '}
            </span>
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
