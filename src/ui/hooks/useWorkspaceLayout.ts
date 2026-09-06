/**
 * How the workspace is divided: the program rig, the strip the read-out lives in, and the board.
 *
 * The saved fraction is the player's and a value they have dragged is used as given — the splitter
 * has the last word over the *split*. What is derived here is the default, because one constant
 * cannot serve a 13" laptop and a 27" monitor at once, and the strip, which is not negotiable.
 *
 * The board is the screen: it is the full height of the workspace and the read-outs float over it.
 * Two observations drive where the split lands:
 *
 *  - `tilePx = min(viewW/cols, viewH/rows)`, so a grid can only spend `height x aspect` of width.
 *    Width past that is empty background, and the code is a better home for it than the void.
 *  - The panel chips float in the board's right-hand corner. Leaving that much width on that side
 *    is what keeps them over background, and it costs the board nothing while the surplus exists.
 *
 * **The strip is different, and this is the fix for `docs/FIX-HUD-OVERLAP.md`.** The objective
 * read-out used to float in a gutter this derivation *hoped* would be there. It was a preference,
 * and the first thing surrendered when `RIG_MIN` bound or the player dragged the splitter, so the
 * card ended up over the grid on the game's first work order at the default split. So the strip is
 * no longer hoped for: `gutter` is subtracted from the canvas itself (`.viewport__canvas`), the
 * camera fits the grid into what is left, and the card is laid out inside the strip from the same
 * numbers. There is nowhere for the two to meet. Widening the card widens the strip and moves the
 * board; it cannot move the card onto the grid.
 *
 * The old pair of fractions split the workspace into four boxes; the second one — `viewportFraction`,
 * the site view's share of the right column's height — has nothing left to divide and is no longer
 * read. It stays in the save (`src/game/save.ts`) so an existing file still loads.
 */
import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_LAYOUT, type Layout } from '../../game/save.ts';

/** Monaco below this is a worse trade than any framing gain. Also keeps the Repository drawer whole. */
const RIG_MIN = 440;
/** Past this the rig is carrying surplus the code cannot spend either, so the board keeps it. */
const RIG_MAX = 640;
/** How much *drawn* board is left when the splitter is dragged as far right as it goes. */
const BOARD_MIN = 420;

/**
 * The strip, open and shut.
 *
 * Open it holds the objective card; shut it holds the tab that brings the card back — narrow, but
 * still a reserved strip, so the way back is never itself over the grid.
 *
 * The card's width follows the window because the strip is real now. A fixed 232px is a fair share
 * of a 1920px workspace and nearly a third of the board on a 1280px one, where it cost `w1-01` a
 * rung and a half of zoom — and a rework that buys a tidy read-out with smaller tiles has missed
 * the point of putting the board on the screen. So it is a share, floored where the card stops
 * being a column of text and capped where more width only buys whitespace.
 */
const RAIL_SHARE = 0.14;
const CARD_MIN = 168;
const CARD_MAX = 232;
const RAIL_OPEN_INSET = 12;
const RAIL_SHUT = { inset: 8, content: 24 };

export interface WorkspaceBox {
  width: number;
  height: number;
}

export interface WorkspaceLayout {
  /** The program rig's share of the workspace width. Same units as the saved `editorFraction`. */
  editorFraction: number;
  /** The splitter's live bounds. Both are pixel limits, expressed against the box it is dividing. */
  min: number;
  max: number;
  /** Width the board gives up down its left edge, in CSS pixels. The canvas starts after it. */
  gutter: number;
  /** The read-out's own width inside that strip. */
  cardWidth: number;
  /** The read-out's offset from the rig's right edge. */
  cardInset: number;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

function strip(
  box: WorkspaceBox,
  railOpen: boolean,
): Pick<WorkspaceLayout, 'gutter' | 'cardWidth' | 'cardInset'> {
  const { inset, content } = railOpen
    ? {
        inset: RAIL_OPEN_INSET,
        content: clamp(Math.round(box.width * RAIL_SHARE), CARD_MIN, CARD_MAX),
      }
    : RAIL_SHUT;
  return { gutter: inset * 2 + content, cardWidth: content, cardInset: inset };
}

/**
 * The fraction the workspace should actually use, the range the splitter may be dragged over, and
 * the strip held back for the read-out. `gridAspect` is the level's cols/rows; pass 1 when nothing
 * is loaded, which is the shape the derivation is least generous to.
 */
export function effectiveLayout(
  saved: Layout,
  box: WorkspaceBox,
  gridAspect: number,
  railOpen = true,
): WorkspaceLayout {
  const held = strip(box, railOpen);
  if (box.width <= 0 || box.height <= 0) {
    return { ...held, editorFraction: saved.editorFraction, min: 0.24, max: 0.68 };
  }
  const min = Math.min(RIG_MIN / box.width, 0.5);
  const max = clamp((box.width - held.gutter - BOARD_MIN) / box.width, min, 0.68);
  const dragged = saved.editorFraction !== DEFAULT_LAYOUT.editorFraction;
  const fraction = dragged
    ? saved.editorFraction
    : rigWidth(box, gridAspect, held.gutter) / box.width;
  return { ...held, editorFraction: clamp(fraction, min, max), min, max };
}

function rigWidth(box: WorkspaceBox, gridAspect: number, gutter: number): number {
  // The strip, the width the grid can spend at full height, and a matching margin for the chips.
  const board = box.height * Math.max(gridAspect, 0.01) + gutter * 2;
  return clamp(box.width - board, RIG_MIN, RIG_MAX);
}

/** Measures the workspace and re-derives on resize. Until it has a box, the save is used as-is. */
export function useWorkspaceLayout(
  ref: React.RefObject<HTMLElement | null>,
  saved: Layout,
  gridAspect: number,
  railOpen = true,
): WorkspaceLayout {
  const [box, setBox] = useState<WorkspaceBox>({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = (): void =>
      setBox({ width: element.clientWidth, height: element.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return useMemo(
    () => effectiveLayout(saved, box, gridAspect, railOpen),
    [saved, box, gridAspect, railOpen],
  );
}
