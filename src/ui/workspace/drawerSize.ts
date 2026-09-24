const WIDTH_KEY = 'as-instructed.drawer-width';

export const MIN_DRAWER = 420;

// The board is the other half of the job, so the widest the player may pull still leaves it
// the right column and a strip to read. Named --ws-board-keep in workspace.css.
export const BOARD_KEEP = 440;

// The right column's width at each reflow step (--ws-column in workspace.css and reflow.css).
export function columnWidth(viewport: number): number {
  if (viewport <= 1200) return 280;
  if (viewport <= 1440) return 300;
  return 360;
}

// An open flyout leaves the deck the strip between its edge and the column, less the gutters
// either side (--ws-deck-left while open, and the column's own gap). Narrower than the floor the
// transport row wraps to a fourth line, so the deck is folded away instead — the drawer carries
// its own Dispatch while it is open, which is the same trade the compact layout makes.
const DECK_FLOOR = 340;
const DECK_GUTTERS = 120;

export function deckIsCrowded(drawer: number, viewport: number): boolean {
  return viewport - drawer - DECK_GUTTERS - columnWidth(viewport) < DECK_FLOOR;
}

// The site map link rides the flyout's edge, so it needs its own width and a clear gap either side
// of it between that edge and the column; short of that it drops its words for the arrow alone.
const BACK_ROOM = 130;
const COLUMN_GAP = 16;

export function backIsCrowded(drawer: number, viewport: number): boolean {
  return viewport - drawer - COLUMN_GAP - columnWidth(viewport) < BACK_ROOM;
}

export function maxDrawer(viewport: number): number {
  return Math.max(MIN_DRAWER, viewport - BOARD_KEEP);
}

export function clampDrawer(width: number, viewport: number): number {
  return Math.min(Math.max(Math.round(width), MIN_DRAWER), maxDrawer(viewport));
}

export function storedDrawerWidth(): number | null {
  try {
    const raw = localStorage.getItem(WIDTH_KEY);
    if (raw === null) return null;
    const width = Number.parseInt(raw, 10);
    return Number.isFinite(width) ? width : null;
  } catch {
    return null;
  }
}

export function rememberDrawerWidth(width: number | null): void {
  try {
    if (width === null) localStorage.removeItem(WIDTH_KEY);
    else localStorage.setItem(WIDTH_KEY, String(width));
  } catch {
    // Non-fatal: the width still holds for this session.
  }
}
