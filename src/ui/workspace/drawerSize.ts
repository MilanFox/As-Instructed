const WIDTH_KEY = 'as-instructed.drawer-width';

export const MIN_DRAWER = 420;

// The board is the other half of the job, so the widest the player may pull still leaves it
// the right column and a strip to read. Named --ws-board-keep in workspace.css.
export const BOARD_KEEP = 380;

// The narrowest deck the layout already ships — what a 1200px screen leaves it at its own
// default width — and the gutters it sits in between the drawer's edge and the viewport's
// right edge, under the column (--ws-deck-left, --ws-deck-right).
const DECK_FLOOR = 500;
const DECK_GUTTERS = 138;

// Past this the deck would wrap rather than shrink, so it is folded away instead — the drawer
// carries its own Dispatch while it is open, which is the same trade the compact layout makes.
export function deckIsCrowded(drawer: number, viewport: number): boolean {
  return viewport - drawer - DECK_GUTTERS < DECK_FLOOR;
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
