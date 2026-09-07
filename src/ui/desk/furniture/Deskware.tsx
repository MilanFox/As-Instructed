import { useState } from 'react';

import type { DocKind } from '../paper/papers.ts';
import { trayDocs, usePapers } from '../paper/papers.ts';
/**
 * Things a desk has.
 *
 * The delivery slot, the in-tray and the keyboard carry no verb: they are what makes the terminal
 * and the paper read as being *on* something. The keyboard is cropped by the front edge of the
 * desk because you are sitting here, and that crop is the only thing in the composition that
 * places the player's body.
 *
 * Subtraction beats placement: the coffee mug was cut, and every unit of clutter is a unit stolen
 * from the code, so nothing is added here that is not already load-bearing for the fiction.
 */

/** Three paper edges resting in the tray, from the prototype's own offsets. */
const TRAY_EDGES: readonly { top: number; rot: number }[] = [
  { top: 66, rot: -1.1 },
  { top: 74, rot: 0.6 },
  { top: 82, rot: -0.4 },
];

/** Key counts per row, and which of them are wide. The Return key is the lit one. */
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

/** What the tray calls each kind, on its edge, so the player knows what came in. */
const TRAY_LABEL: Record<DocKind, string> = {
  order: 'WORK ORDER',
  certificate: 'CERTIFICATE OF CLOSURE',
  halt: 'HALT NOTICE',
  requisition: 'HARDWARE REQUISITION',
  issue: 'REPOSITORY NOTICE',
  memo: 'PERFORMANCE REVIEW',
  standing: 'STANDING',
};

/**
 * The in-tray. Everything the company sends you arrives here except the work order itself.
 *
 * A player who opened `w1-03` was handed five documents at once, stacked over the terminal, and
 * said *"I literally can't see anything anymore."* Ceremonies queue, they do not pile: a corporate
 * workplace hands you one form at a time and waits. The tray is where the rest wait, it says how
 * many are waiting, and **the player opens it — the game never opens it for them.**
 *
 * Nothing here is lost. Paper still persists until it is filed; this is only the difference
 * between paper on the desk and paper put away.
 */
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
                className={
                  key === row.hot ? 'w hot' : row.wide.includes(key) ? 'w' : undefined
                }
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
