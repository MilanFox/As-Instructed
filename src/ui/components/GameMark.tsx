import type { JSX } from 'react';

export type MarkId = 'overrun' | 'workOrder' | 'offEdge' | 'uTurn' | 'crawl' | 'limb';

// Every mark is drawn on a 16x16 field with integer coordinates and a 2-unit stroke, so at favicon
// size one unit is one device pixel and no edge lands on a half pixel.
const FIELD = 16;

// Swap the logo by naming a different mark here; nothing else needs to change.
export const MARK: MarkId = 'overrun';

export const GAME_TITLE = 'AS INSTRUCTED';

const MARKS: Record<MarkId, () => JSX.Element> = {
  overrun: () => (
    <g>
      <path d="M3 13V4h10v9" fill="none" stroke="var(--accent)" strokeWidth="2" />
      <rect x="2" y="8" width="12" height="2" fill="var(--ink)" />
      <path d="M13 13v2" fill="none" stroke="var(--accent-2)" strokeWidth="2" />
    </g>
  ),
  workOrder: () => (
    <g>
      <path d="M2 1h9l3 3v11H2Z" fill="none" stroke="var(--ink-dim)" strokeWidth="1.2" />
      <path d="M4 3h5" stroke="var(--ink-dim)" strokeWidth="1" />
      <g fill="var(--ink-dim)" opacity="0.45">
        <rect x="8" y="6" width="2" height="2" />
        <rect x="11" y="6" width="2" height="2" />
        <rect x="11" y="9" width="2" height="2" />
        <rect x="5" y="12" width="2" height="2" />
      </g>
      <g fill="var(--accent)">
        <rect x="5" y="6" width="2" height="2" />
        <rect x="5" y="9" width="2" height="2" />
        <rect x="8" y="9" width="2" height="2" />
        <rect x="8" y="12" width="2" height="2" />
      </g>
      <rect x="11" y="12" width="2" height="2" fill="var(--accent-2)" />
    </g>
  ),
  offEdge: () => (
    <g>
      <rect
        x="1"
        y="2"
        width="10"
        height="12"
        fill="none"
        stroke="var(--ink-dim)"
        strokeWidth="1.2"
      />
      <path d="M4 11V6h7" fill="none" stroke="var(--accent)" strokeWidth="2" />
      <path d="M11 6h4" fill="none" stroke="var(--accent-2)" strokeWidth="2" />
    </g>
  ),
  uTurn: () => (
    <g>
      <path d="M3 4h10v7H3" fill="none" stroke="var(--accent)" strokeWidth="2" />
      <path d="M3 11H2" fill="none" stroke="var(--accent-2)" strokeWidth="2" />
      <path
        d="M5 8l-4 3 4 3"
        fill="none"
        stroke="var(--accent-2)"
        strokeWidth="2"
        strokeLinejoin="miter"
      />
    </g>
  ),
  crawl: () => (
    <g>
      <g fill="var(--accent)">
        <rect x="1" y="1" width="3" height="3" />
        <rect x="1" y="4" width="3" height="3" />
        <rect x="4" y="4" width="3" height="3" />
        <rect x="7" y="4" width="3" height="3" />
        <rect x="7" y="7" width="3" height="3" />
        <rect x="7" y="10" width="3" height="3" />
      </g>
      <rect x="13" y="10" width="3" height="3" fill="var(--accent-2)" />
    </g>
  ),
  limb: () => (
    <g>
      <circle cx="8" cy="8" r="6.2" fill="none" stroke="var(--ink-dim)" strokeWidth="1.6" />
      <rect x="4" y="5" width="2" height="2" fill="var(--ink)" />
      <path d="M5 6h5v6" fill="none" stroke="var(--accent)" strokeWidth="2" />
      <path d="M10 12v4" fill="none" stroke="var(--accent-2)" strokeWidth="2" />
    </g>
  ),
};

interface MarkProps {
  size?: number;
  id?: MarkId;
}

export function GameMark({ size = 48, id = MARK }: MarkProps): JSX.Element {
  const Drawn = MARKS[id];
  return (
    <svg
      className="game-mark"
      width={size}
      height={size}
      viewBox={`0 0 ${String(FIELD)} ${String(FIELD)}`}
      aria-hidden="true"
      focusable="false"
    >
      <Drawn />
    </svg>
  );
}
