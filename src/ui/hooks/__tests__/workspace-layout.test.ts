import { describe, expect, it } from 'vitest';
import { Camera } from '../../../render/camera.ts';
import { DEFAULT_LAYOUT, type Layout } from '../../../game/save.ts';
import { LEVELS } from '../../../levels/index.ts';
import { effectiveLayout } from '../useWorkspaceLayout.ts';

/** The workspace box at each window size: full width, window height less the 46px top bar. */
const LAPTOP = { width: 1440, height: 854 };
const AUDIT = { width: 1680, height: 734 };
const WIDE = { width: 2560, height: 1394 };
const SMALL = { width: 1280, height: 674 };

/**
 * The layout this replaced, kept whole so the tile-size guarantee below is *checked* rather than
 * asserted: two saved fractions, a 46px transport and a 5px splitter carved out of the right-hand
 * column, with the site view taking what was left of it.
 */
const TIMELINE_AND_SPLITTER = 51;
const LEGACY_DETAIL_MAX_H = 340;
const LEGACY_DETAIL_MIN_W = 268 + 392;
const LEGACY_EDITOR_MIN_W = 520;

function legacyBoard(box: { width: number; height: number }, aspect: number) {
  const clamp = (value: number, low: number, high: number): number =>
    Math.min(Math.max(value, low), high);
  const widest = box.width * (1 - DEFAULT_LAYOUT.editorFraction) - 5;
  const today = box.height * DEFAULT_LAYOUT.viewportFraction - TIMELINE_AND_SPLITTER;
  const tallest = box.height - LEGACY_DETAIL_MAX_H - TIMELINE_AND_SPLITTER;
  const height = clamp(widest / Math.max(aspect, 0.01), today, Math.max(today, tallest));
  const viewportFraction = clamp((height + TIMELINE_AND_SPLITTER) / box.height, 0.25, 0.8);
  const viewportHeight = box.height * viewportFraction - TIMELINE_AND_SPLITTER;
  const narrowest = Math.min(LEGACY_DETAIL_MIN_W, widest);
  const detail = clamp(
    viewportHeight * aspect,
    narrowest,
    Math.max(narrowest, Math.min(widest, box.width - LEGACY_EDITOR_MIN_W - 5)),
  );
  return { width: detail, height: viewportHeight };
}

function board(saved: Layout, box: { width: number; height: number }, aspect: number) {
  const out = effectiveLayout(saved, box, aspect);
  return { width: box.width * (1 - out.editorFraction), height: box.height };
}

/** Device pixels per tile, from the real camera, so the zoom ladder and the fit padding count. */
function tilePx(view: { width: number; height: number }, grid: { w: number; h: number }): number {
  const camera = new Camera();
  camera.setViewport(view.width, view.height, 1);
  camera.setBounds({ cols: grid.w, rows: grid.h });
  camera.fit();
  return camera.deviceTilePx;
}

const GRIDS = LEVELS.map((level) => {
  const world = level.build(level.seeds[0] as number);
  return { id: level.id, w: world.w, h: world.h };
});

describe('effectiveLayout', () => {
  it('leaves the save alone before the workspace has been measured', () => {
    const out = effectiveLayout(DEFAULT_LAYOUT, { width: 0, height: 0 }, 1);
    expect(out.editorFraction).toBe(DEFAULT_LAYOUT.editorFraction);
  });

  it('never overrides a fraction the player has dragged', () => {
    const dragged: Layout = { editorFraction: 0.31, viewportFraction: 0.72 };
    expect(effectiveLayout(dragged, WIDE, 1).editorFraction).toBe(0.31);
    expect(effectiveLayout(dragged, LAPTOP, 4).editorFraction).toBe(0.31);
  });

  it('clamps a dragged fraction only when the window can no longer hold it', () => {
    const dragged: Layout = { editorFraction: 0.68, viewportFraction: 0.58 };
    const roomy = { width: 1000, height: 600 };
    const out = effectiveLayout(dragged, roomy, 1);
    expect(out.editorFraction).toBeLessThan(0.68);
    expect(roomy.width * (1 - out.editorFraction)).toBeGreaterThanOrEqual(419);
  });

  it('splits a window too small for both down the middle rather than starving either', () => {
    const cramped = { width: 700, height: 500 };
    const out = effectiveLayout(DEFAULT_LAYOUT, cramped, 1);
    expect(cramped.width * out.editorFraction).toBeGreaterThanOrEqual(280);
    expect(cramped.width * (1 - out.editorFraction)).toBeGreaterThanOrEqual(280);
  });

  /*
   * The one that matters. The board is the screen now, and a rework that made the picture prettier
   * by making the tiles smaller would have missed the point entirely — so every level is fitted
   * with the real camera under both layouts and none of them is allowed to come out worse.
   */
  it('gives every level at least as many device pixels per tile as the layout it replaced', () => {
    for (const box of [SMALL, LAPTOP, AUDIT, WIDE]) {
      for (const grid of GRIDS) {
        const aspect = grid.w / grid.h;
        const before = tilePx(legacyBoard(box, aspect), grid);
        const after = tilePx(board(DEFAULT_LAYOUT, box, aspect), grid);
        expect(`${grid.id} ${box.width}: ${after}`).toBe(
          `${grid.id} ${box.width}: ${Math.max(before, after)}`,
        );
      }
    }
  });

  it('hands the board the width its grid can spend and the program the rest', () => {
    // A 40x40 maze runs out of columns at the height it has; a 30x3 corridor never does.
    const square = board(DEFAULT_LAYOUT, AUDIT, 1);
    const corridor = board(DEFAULT_LAYOUT, AUDIT, 10);
    expect(corridor.width).toBeGreaterThan(square.width);
    expect(square.width).toBeGreaterThan(square.height);
  });

  /*
   * The reservation is a preference, not a promise: it is the first thing given up when the
   * program's own floor binds. On a 13" laptop it does, and the objective card ends up over the
   * corner of a 40x40 grid — which is still the better half of a trade that used to spend a whole
   * 268px column on the same list.
   */
  it('keeps a gutter each side of a square grid wherever there is width to spare', () => {
    for (const box of [AUDIT, WIDE]) {
      const view = board(DEFAULT_LAYOUT, box, 1);
      const grid = { w: 40, h: 40 };
      const drawn = tilePx(view, grid) * grid.w;
      expect((view.width - drawn) / 2).toBeGreaterThanOrEqual(232);
    }
    expect(LAPTOP.width * effectiveLayout(DEFAULT_LAYOUT, LAPTOP, 1).editorFraction).toBeCloseTo(
      440,
      6,
    );
  });

  it('keeps the program readable at every window size', () => {
    for (const box of [SMALL, LAPTOP, AUDIT, WIDE, { width: 3840, height: 2000 }]) {
      for (const aspect of [1, 1.25, 1.4, 2, 4, 10]) {
        const out = effectiveLayout(DEFAULT_LAYOUT, box, aspect);
        expect(box.width * out.editorFraction).toBeGreaterThanOrEqual(440);
        expect(box.width * out.editorFraction).toBeLessThanOrEqual(640);
      }
    }
  });

  it('reports splitter bounds that hold both the program and the board', () => {
    for (const box of [SMALL, LAPTOP, AUDIT, WIDE, { width: 3840, height: 2000 }]) {
      const out = effectiveLayout(DEFAULT_LAYOUT, box, 1);
      expect(out.min).toBeLessThanOrEqual(out.editorFraction);
      expect(out.max).toBeGreaterThanOrEqual(out.editorFraction);
      expect(box.width * out.min).toBeCloseTo(440, 0);
      expect(box.width * (1 - out.max)).toBeGreaterThanOrEqual(419);
    }
  });

  it('never lets the derived split leave the splitter out of range', () => {
    for (const box of [SMALL, LAPTOP, AUDIT, WIDE, { width: 1024, height: 600 }]) {
      for (const aspect of [1, 1.25, 1.4, 2, 4, 10]) {
        const out = effectiveLayout(DEFAULT_LAYOUT, box, aspect);
        expect(out.editorFraction).toBeGreaterThanOrEqual(out.min);
        expect(out.editorFraction).toBeLessThanOrEqual(out.max);
      }
    }
  });
});
