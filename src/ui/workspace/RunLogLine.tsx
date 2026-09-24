import type { Snapshot } from '../../engine/index.ts';
import type { ConsoleLine } from '../../game/store.ts';
import { ValueTree } from '../components/ValueTree.tsx';

const EXPANDABLE = new Set(['array', 'object', 'map', 'set']);

function isExpandable(value: Snapshot): boolean {
  return typeof value === 'object' && value !== null && EXPANDABLE.has(value.$);
}

export function RunLogLine({ line }: { line: ConsoleLine }): React.ReactElement {
  const tick = <span className="run-log__tick">{String(Math.round(line.t))}</span>;
  const values = line.values;
  if (values === undefined || !values.some(isExpandable)) {
    return (
      <p className="run-log__line" data-kind={line.kind}>
        {tick}
        <span className="run-log__text">{line.text}</span>
      </p>
    );
  }
  return (
    <div className="run-log__line" data-kind={line.kind}>
      {tick}
      <span className="run-log__values">
        {values.map((value, index) =>
          typeof value === 'string' ? (
            <span key={index} className="run-log__text">
              {value}
            </span>
          ) : (
            <ValueTree key={index} value={value} />
          ),
        )}
      </span>
    </div>
  );
}
