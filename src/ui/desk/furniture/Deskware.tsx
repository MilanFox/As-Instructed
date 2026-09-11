import { useState } from 'react';

import type { DocKind } from '../paper/papers.ts';
import { trayDocs, usePapers } from '../paper/papers.ts';

const TRAY_EDGES: readonly { top: number; rot: number }[] = [
  { top: 66, rot: -1.1 },
  { top: 74, rot: 0.6 },
  { top: 82, rot: -0.4 },
];

const KEYBOARD_ROWS: readonly { keys: number; wide: readonly number[]; hot: number }[] = [
  { keys: 15, wide: [0, 14], hot: -1 },
  { keys: 14, wide: [13], hot: 13 },
  { keys: 13, wide: [0, 12], hot: -1 },
];

export function Slot(): React.ReactElement {
  return (
    <div className="slot" aria-hidden="true">
      <div className="slot-mouth" />
      <div className="slot-plate">DELIVERIES</div>
    </div>
  );
}

const TRAY_LABEL: Record<DocKind, string> = {
  order: 'WORK ORDER',
  certificate: 'CERTIFICATE OF CLOSURE',
  halt: 'HALT NOTICE',
  requisition: 'HARDWARE REQUISITION',
  issue: 'REPOSITORY NOTICE',
  memo: 'PERFORMANCE REVIEW',
  standing: 'STANDING',
};

export function Tray(): React.ReactElement {
  const waiting = usePapers(trayDocs);
  const takeOut = usePapers((state) => state.takeOut);
  const [open, setOpen] = useState(false);
  const count = waiting.length;

  return (
    <div className="tray" data-open={open ? '1' : undefined}>
      <div className="tray-back" aria-hidden="true" />
      <div className="tray-floor" aria-hidden="true" />
      <div className="tray-front" aria-hidden="true">
        <span>IN</span>
      </div>
      <div className="tray-items" aria-hidden="true">
        {TRAY_EDGES.slice(0, Math.max(1, Math.min(count, TRAY_EDGES.length))).map((edge) => (
          <div
            className="edge"
            key={edge.top}
            style={{
              top: `calc(${edge.top} * var(--u))`,
              transform: `rotate(${edge.rot}deg)`,
            }}
          />
        ))}
      </div>

      <button
        type="button"
        className="tray-tab"
        onClick={() => {
          setOpen((was) => !was);
        }}
        aria-expanded={open}
        aria-label={
          count === 0
            ? 'In-tray, empty'
            : `In-tray, ${String(count)} document${count === 1 ? '' : 's'} waiting`
        }
      >
        <b>IN&nbsp;TRAY</b>
        <span className="tray-count">{count === 0 ? 'empty' : count}</span>
      </button>

      {open && count > 0 ? (
        <ul className="tray-list">
          {waiting.map((doc) => (
            <li key={doc.id}>
              <button
                type="button"
                onClick={() => {
                  takeOut(doc.id);
                  setOpen(false);
                }}
              >
                {TRAY_LABEL[doc.kind]}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function DeskKeyboard(): React.ReactElement {
  return (
    <div className="keyboard" aria-hidden="true">
      <div className="kb-deck">
        {KEYBOARD_ROWS.map((row, index) => (
          <div className="kb-row" data-row={index} key={index}>
            {Array.from({ length: row.keys }, (_, key) => (
              <i
                key={key}
                className={key === row.hot ? 'w hot' : row.wide.includes(key) ? 'w' : undefined}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
