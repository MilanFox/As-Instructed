import { useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Snapshot } from '../../engine/index.ts';
import {
  ROOT_ROW,
  flattenRows,
  headerSegments,
  previewSegments,
  previewText,
  treeKeyAction,
} from './value-tree.ts';
import type { ValueRow, ValueSegment } from './value-tree.ts';
import '../styles/value-tree.css';

export interface ValueTreeProps {
  value: Snapshot;
  label?: string;
  previous?: Snapshot;
  diff?: boolean;
  className?: string;
}

let treeSequence = 0;

function Segments({ segments }: { segments: readonly ValueSegment[] }): React.JSX.Element {
  return (
    <>
      {segments.map((segment, index) => (
        <span key={index} className={`vt__${segment.tone}`}>
          {segment.text}
        </span>
      ))}
    </>
  );
}

function rowTitle(row: ValueRow): string | undefined {
  if (row.change === 'added') return 'new';
  if (row.change === 'changed' && row.previous !== undefined) {
    return `was ${previewText(row.previous)}`;
  }
  return undefined;
}

function RowValue({ row }: { row: ValueRow }): React.JSX.Element {
  if (row.value === null && row.omitted > 0) {
    return <span className="vt__meta">… {row.omitted} more</span>;
  }
  const value = row.value;
  const segments = row.expanded ? headerSegments(value) : previewSegments(value);
  const showWas = row.change === 'changed' && !row.expandable && row.previous !== undefined;
  return (
    <>
      {showWas && row.previous !== undefined ? (
        <>
          <del className="vt__was">{previewText(row.previous)}</del>
          <span className="vt__punct"> → </span>
        </>
      ) : null}
      <Segments segments={segments} />
    </>
  );
}

export function ValueTree({
  value,
  label,
  previous,
  diff = previous !== undefined,
  className,
}: ValueTreeProps): React.JSX.Element {
  const [idPrefix] = useState(() => `value-tree-${(treeSequence += 1)}`);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [focused, setFocused] = useState(ROOT_ROW);

  const rows = useMemo(
    () => flattenRows(value, { label: label ?? null, expanded, diff, previous }),
    [value, label, expanded, diff, previous],
  );
  const active = rows.some((row) => row.id === focused) ? focused : ROOT_ROW;

  const toggle = (id: string): void => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const action = treeKeyAction(rows, active, event.key);
    if (!action) return;
    event.preventDefault();
    if (action.toggle) toggle(action.toggle);
    if (action.focus) setFocused(action.focus);
  };

  return (
    <div
      role="tree"
      tabIndex={0}
      aria-label={label ?? 'value'}
      aria-activedescendant={`${idPrefix}-${active}`}
      className={`value-tree${className ? ` ${className}` : ''}`}
      onKeyDown={onKeyDown}
    >
      {rows.map((row) => (
        <div
          key={row.id}
          id={`${idPrefix}-${row.id}`}
          role="treeitem"
          aria-level={row.level}
          aria-posinset={row.posInSet}
          aria-setsize={row.setSize}
          aria-expanded={row.expandable ? row.expanded : undefined}
          aria-selected={row.id === active}
          className="vt__row"
          data-change={row.change === 'same' ? undefined : row.change}
          data-active={row.id === active || undefined}
          title={rowTitle(row)}
          style={{ paddingInlineStart: `${(row.level - 1) * 12}px` }}
          onClick={() => {
            setFocused(row.id);
            if (row.expandable) toggle(row.id);
          }}
        >
          <span className="vt__twisty" aria-hidden="true">
            {row.expandable ? (row.expanded ? '▾' : '▸') : ''}
          </span>
          {row.label !== null ? (
            <>
              <span className="vt__key">{row.label}</span>
              <span className="vt__punct">{row.separator}</span>
            </>
          ) : null}
          <RowValue row={row} />
        </div>
      ))}
    </div>
  );
}
