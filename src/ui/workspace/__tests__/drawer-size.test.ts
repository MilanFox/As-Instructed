import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

import { COMPACT_QUERY } from '../breakpoints.ts';
import { BOARD_KEEP, MIN_DRAWER, clampDrawer, deckIsCrowded, maxDrawer } from '../drawerSize.ts';

const FLAP = 46;

const SHEET = readFileSync(
  new URL('../../styles/workspace/workspace.css', import.meta.url),
  'utf8',
);

const COMPACT = Number(/(\d+)px/.exec(COMPACT_QUERY)?.[1] ?? 0);

// The grip is only offered above the compact query; below it the drawer takes the screen.
const RESIZABLE = [COMPACT + 1, 1200, 1440, 1920, 2560] as const;

describe('a width the player picks still leaves the screen usable', () => {
  test('the widest drawer leaves both flaps on screen at every width that offers the grip', () => {
    for (const viewport of RESIZABLE) {
      expect([viewport, maxDrawer(viewport) + FLAP <= viewport]).toEqual([viewport, true]);
    }
  });

  test('the floor is never above the ceiling', () => {
    for (const viewport of RESIZABLE) {
      expect([viewport, maxDrawer(viewport) >= MIN_DRAWER]).toEqual([viewport, true]);
    }
  });

  test('a width from a wider screen is pulled back inside a narrower one', () => {
    expect(clampDrawer(1800, 1280)).toBe(maxDrawer(1280));
  });

  test('a width below the floor is raised to it', () => {
    expect(clampDrawer(120, 1920)).toBe(MIN_DRAWER);
  });

  test('a width between the two is kept as asked', () => {
    expect(clampDrawer(1051, 1920)).toBe(1051);
  });

  // The stylesheet caps the width on its own, so a drag that never runs still cannot cover
  // the board. Both caps have to name the same number.
  test('the sheet reserves the same strip the grip does', () => {
    const named = /--ws-board-keep:\s*(\d+)px/.exec(SHEET)?.[1];

    expect(['--ws-board-keep', named]).toEqual(['--ws-board-keep', String(BOARD_KEEP)]);
    expect(SHEET).toContain('calc(100vw - var(--ws-board-keep))');
  });

  test('the deck is folded rather than crushed at the widest the grip allows', () => {
    for (const viewport of RESIZABLE) {
      expect([viewport, deckIsCrowded(maxDrawer(viewport), viewport)]).toEqual([viewport, true]);
    }
  });

  // The fold is for widths the player asked for, never for one the layout already shipped.
  test('the deck stays put at the width every screen opens on', () => {
    expect(deckIsCrowded(684, 1920)).toBe(false);
    expect(deckIsCrowded(600, 1440)).toBe(false);
    expect(deckIsCrowded(548, 1200)).toBe(false);
    expect(deckIsCrowded(548, 901)).toBe(true);
  });

  test('120 columns of program still leaves the deck where it was', () => {
    expect(deckIsCrowded(1051, 1920)).toBe(false);
  });

  test('the widest drawer still fits the right column beside it', () => {
    const column = Number(/--ws-column:\s*(\d+)px/.exec(SHEET)?.[1] ?? 0);

    expect(['column width', column > 0]).toEqual(['column width', true]);
    for (const viewport of RESIZABLE) {
      expect([viewport, maxDrawer(viewport) + column <= viewport]).toEqual([viewport, true]);
    }
  });
});
