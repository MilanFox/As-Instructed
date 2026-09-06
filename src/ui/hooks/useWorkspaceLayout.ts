/**
 * How wide the program rig is, derived from the window and from the shape of the level being run.
 *
 * The saved fraction is the player's and a value they have dragged is used as given — the splitter
 * has the last word. What is derived here is only the *default*, because one constant cannot
 * serve a 13" laptop and a 27" monitor at once.
 *
 * The board is now the screen: it is the full height of the workspace and everything else floats
 * over it, so there is one split left to make and it is the one between the code and the board.
 * Two observations drive where it lands:
 *
 *  - `tilePx = min(viewW/cols, viewH/rows)`, so a grid can only spend `height x aspect` of width.
 *    Width past that is empty background, and the code is a better home for it than the void.
 *  - The objective read-out and the panel chips float in the board's own gutters. Reserving that
 *    much width on each side is what keeps them off the grid instead of over it, and it costs the
 *    board nothing while the surplus exists.
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
/** The board never gets narrower than this, however little width there is to go round. */
const BOARD_MIN = 420;
/** One gutter's worth of board. Mirrors `.hud-card`'s width in app.css: reserve less than the
 *  card is wide and the objective read-out sits over the grid instead of beside it. */
const HUD_GUTTER = 232;

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
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

/**
 * The fraction the workspace should actually use, and the range the splitter may be dragged over.
 * `gridAspect` is the level's cols/rows; pass 1 when nothing is loaded, which is the shape the
 * derivation is least generous to.
 */
export function effectiveLayout(
  saved: Layout,
  box: WorkspaceBox,
  gridAspect: number,
): WorkspaceLayout {
  if (box.width <= 0 || box.height <= 0) {
    return { editorFraction: saved.editorFraction, min: 0.24, max: 0.68 };
  }
  const min = Math.min(RIG_MIN / box.width, 0.5);
  const max = clamp((box.width - BOARD_MIN) / box.width, min, 0.68);
  const dragged = saved.editorFraction !== DEFAULT_LAYOUT.editorFraction;
  const fraction = dragged ? saved.editorFraction : rigWidth(box, gridAspect) / box.width;
  return { editorFraction: clamp(fraction, min, max), min, max };
}

function rigWidth(box: WorkspaceBox, gridAspect: number): number {
  // The width the grid can actually spend at full height, plus a gutter each side for the HUD.
  const board = box.height * Math.max(gridAspect, 0.01) + HUD_GUTTER * 2;
  return clamp(box.width - board, RIG_MIN, RIG_MAX);
}

/** Measures the workspace and re-derives on resize. Until it has a box, the save is used as-is. */
export function useWorkspaceLayout(
  ref: React.RefObject<HTMLElement | null>,
  saved: Layout,
  gridAspect: number,
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

  return useMemo(() => effectiveLayout(saved, box, gridAspect), [saved, box, gridAspect]);
}
