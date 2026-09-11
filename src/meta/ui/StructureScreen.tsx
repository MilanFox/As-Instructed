import type * as React from 'react';
import { STRUCTURE } from '../copy.ts';
import type { LibraryFunction, StructureRow } from '../structure.ts';
import { useLibrary } from '../store.ts';
import './library.css';

const INDENT = 16;

function Row({ row, node }: { row: StructureRow; node: LibraryFunction }): React.JSX.Element {
  const note = row.recursive
    ? STRUCTURE.recursive
    : row.shared && row.depth > 0
      ? STRUCTURE.shared
      : undefined;

  return (
    <tr className={row.depth === 0 ? 'lib-tree__root' : undefined}>
      <td>
        <span className="lib-tree__rail" style={{ paddingLeft: `${row.depth * INDENT}px` }}>
          {row.depth > 0 ? <span className="lib-tree__elbow">{row.last ? '└─' : '├─'}</span> : null}
          <span className="lib-name">{node.name}</span>
        </span>
        {note ? <span className="lib__note"> — {note}</span> : null}
      </td>
      <td className="numeric">{node.levels.length > 0 ? node.levels.length : '—'}</td>
      <td className="numeric">{node.measured ? node.callCount : '—'}</td>
      <td className="numeric">{node.measured ? node.ticks : '—'}</td>
      <td className="numeric">
        {node.measured ? `${node.approximate ? '≤' : ''}${node.selfTicks}` : '—'}
      </td>
      <td className="numeric">{row.share === undefined ? '—' : `${row.share}%`}</td>
    </tr>
  );
}

export function StructureScreen(): React.JSX.Element {
  const structure = useLibrary((state) => state.structure());

  if (structure.functions.length === 0) {
    return <p className="lib__empty">{STRUCTURE.empty}</p>;
  }

  const byName = new Map(structure.functions.map((each) => [each.name, each]));
  const depth = Math.max(...structure.rows.map((row) => row.depth)) + 1;

  return (
    <div>
      <p className="lib__note">{STRUCTURE.lede}</p>
      {structure.flat ? <p className="lib__warn">{STRUCTURE.flat}</p> : null}

      {structure.roots.map((root) => {
        const node = byName.get(root);
        if (!node) return null;
        const rows = structure.rows.filter((row) => row.root === root);
        return (
          <section className="lib-tree" key={root}>
            <table className="lib-table">
              <thead>
                <tr>
                  <th>{STRUCTURE.columns.name}</th>
                  <th className="numeric">{STRUCTURE.columns.orders}</th>
                  <th className="numeric">{STRUCTURE.columns.calls}</th>
                  <th className="numeric">{STRUCTURE.columns.ticks}</th>
                  <th className="numeric">{STRUCTURE.columns.self}</th>
                  <th className="numeric">{STRUCTURE.columns.share}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const each = byName.get(row.name);
                  return each ? <Row key={`${row.name}-${index}`} row={row} node={each} /> : null;
                })}
              </tbody>
            </table>
            <p className="lib-tree__consumers">
              {node.levels.length > 0
                ? STRUCTURE.usedBy(node.levels)
                : node.calledBy.length > 0
                  ? STRUCTURE.internalOnly
                  : STRUCTURE.unused}
              {node.measured ? '' : ` ${STRUCTURE.unmeasured}`}
            </p>
          </section>
        );
      })}

      <p className="lib-modal__footnote">
        {STRUCTURE.depth(depth)} {STRUCTURE.footnote}
      </p>
    </div>
  );
}
