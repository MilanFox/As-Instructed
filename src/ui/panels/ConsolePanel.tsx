import { useEffect, useMemo, useRef } from 'react';
import { useGame, visibleConsole } from '../../game/store.ts';
import { IconClear } from '../components/Icons.tsx';

/** Never render more than this many rows, whatever the filter says. */
const RENDER_LIMIT = 500;

const FILTERS = [
  { id: 'all', label: 'all' },
  { id: 'print', label: 'print' },
  { id: 'system', label: 'system' },
] as const;

export function ConsolePanel(): React.JSX.Element {
  const all = useGame((state) => state.console);
  const filter = useGame((state) => state.consoleFilter);
  const tick = useGame((state) => state.tick);
  const replaying = useGame((state) => state.trace !== null);
  const setFilter = useGame((state) => state.setConsoleFilter);
  const clear = useGame((state) => state.clearConsole);
  const suppressed = useGame((state) => state.suppressed);
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

  return (
    <div className="console">
      <div className="console__toolbar">
        <div className="filter-group" role="group" aria-label="Console filter">
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
        </div>
        <span className="panel__head-spacer" />
        <button
          type="button"
          className="icon-btn"
          onClick={clear}
          title="Clear the console"
          aria-label="Clear the console"
        >
          <IconClear />
        </button>
      </div>
      <div className="console__body" ref={bodyRef} role="log" aria-label="Console output">
        {shown.length === 0 ? (
          <p className="console__empty">
            Nothing on the wire. `print()` writes here, stamped with the tick it happened on.
          </p>
        ) : null}
        {hidden > 0 ? (
          <div className="console__note">{hidden.toLocaleString()} earlier lines not shown</div>
        ) : null}
        {shown.map((line) => (
          <div className="console__row" key={line.id}>
            <span className="console__t">{line.kind === 'print' ? line.t : ''}</span>
            <span className={`console__text--${line.kind}`}>{line.text}</span>
          </div>
        ))}
        {suppressed > 0 ? (
          <div className="console__note">
            …{suppressed.toLocaleString()} more lines suppressed
          </div>
        ) : null}
      </div>
    </div>
  );
}
