/**
 * Where the workspace splits, derived from the window and from the shape of the level being run.
 *
 * The two saved fractions are the player's and a value they have dragged is used exactly as
 * given — the splitters stay authoritative. What is derived here is only the *default*, because
 * one constant pair cannot serve a 13" laptop and a 27" monitor at once, and the pair we had
 * produced a 2.27:1 letterbox with a square grid sitting in the middle of it.
 *
 * Two independent observations drive it:
 *
 *  - The site view is height-bound. `tilePx = min(viewW/cols, viewH/rows)` and no level is wider
 *    than 1.4:1 in the range that matters, so widening the panel buys empty background and not a
 *    single pixel of tile. Height is the only lever on legibility.
 *  - The brief and the console are a fixed amount of reading. Sizing them as a *fraction* of the
 *    window meant a tall monitor spent hundreds of pixels growing their whitespace, and took
 *    every one of them off the site view.
 */
import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_LAYOUT, type Layout } from '../../game/save.ts';

/** Mirrors `--timeline-h` and `.splitter--horizontal` in app.css. */
const TIMELINE_H = 46;
const SPLITTER_PX = 5;
/** `.rail` is a fixed 268px, and the brief beside it stops reading as prose below ~390px. */
const DETAIL_MIN_W = 268 + 392;
/** Past this the detail panel only grows whitespace, so the rest of the height is the site view's. */
const DETAIL_MAX_H = 340;
/** Monaco below this is a worse trade than any framing gain. Also keeps the Repository drawer whole. */
const EDITOR_MIN_W = 520;

export interface WorkspaceBox {
  width: number;
  height: number;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

/**
 * The fractions the workspace should actually use. `gridAspect` is the level's cols/rows; pass 1
 * when nothing is loaded, which is the shape the derivation is least generous to.
 */
export function effectiveLayout(saved: Layout, box: WorkspaceBox, gridAspect: number): Layout {
  if (box.width <= 0 || box.height <= 0) return saved;
  const viewportFraction =
    saved.viewportFraction === DEFAULT_LAYOUT.viewportFraction
      ? viewportShare(box, gridAspect)
      : saved.viewportFraction;
  const editorFraction =
    saved.editorFraction === DEFAULT_LAYOUT.editorFraction
      ? editorShare(box, viewportFraction, gridAspect)
      : saved.editorFraction;
  return { editorFraction, viewportFraction };
}

function viewportShare(box: WorkspaceBox, gridAspect: number): number {
  const today = box.height * DEFAULT_LAYOUT.viewportFraction - TIMELINE_H - SPLITTER_PX;
  const tallest = box.height - DETAIL_MAX_H - TIMELINE_H - SPLITTER_PX;
  // Height is only worth claiming while the grid can spend it. A 30x3 corridor runs out of rows
  // long before the window runs out of pixels, and the extra would be the same waste on the other
  // axis — so it goes back to the brief instead.
  const useful = widestDetail(box) / Math.max(gridAspect, 0.01);
  const height = clamp(useful, today, Math.max(today, tallest));
  return clamp((height + TIMELINE_H + SPLITTER_PX) / box.height, 0.25, 0.8);
}

/**
 * The width the old constant already handed the right-hand column. Nothing here ever exceeds it:
 * a grid wider than it is tall was using that width, and taking it back to tidy up the square
 * ones would only move the waste.
 */
function widestDetail(box: WorkspaceBox): number {
  return box.width * (1 - DEFAULT_LAYOUT.editorFraction) - SPLITTER_PX;
}

function editorShare(box: WorkspaceBox, viewportFraction: number, gridAspect: number): number {
  const viewportHeight = box.height * viewportFraction - TIMELINE_H - SPLITTER_PX;
  const widest = widestDetail(box);
  const narrowest = Math.min(DETAIL_MIN_W, widest);
  const detail = clamp(
    viewportHeight * gridAspect,
    narrowest,
    Math.max(narrowest, Math.min(widest, box.width - EDITOR_MIN_W - SPLITTER_PX)),
  );
  return clamp((box.width - detail - SPLITTER_PX) / box.width, 0.24, 0.68);
}

/** Measures the workspace and re-derives on resize. Until it has a box, the save is used as-is. */
export function useWorkspaceLayout(
  ref: React.RefObject<HTMLElement | null>,
  saved: Layout,
  gridAspect: number,
): Layout {
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
