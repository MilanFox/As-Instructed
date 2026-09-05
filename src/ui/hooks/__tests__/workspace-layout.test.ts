import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT, type Layout } from '../../../game/save.ts';
import { effectiveLayout } from '../useWorkspaceLayout.ts';

/** The workspace box at each window size: full width, window height less the 46px top bar and 24px status bar. */
const LAPTOP = { width: 1440, height: 830 };
const WIDE = { width: 2560, height: 1370 };

const TIMELINE_AND_SPLITTER = 51;

function viewportBox(layout: Layout, box: { width: number; height: number }) {
  const right = box.width * (1 - layout.editorFraction) - 5;
  return { width: right, height: box.height * layout.viewportFraction - TIMELINE_AND_SPLITTER };
}

describe('effectiveLayout', () => {
  it('leaves the save alone before the workspace has been measured', () => {
    expect(effectiveLayout(DEFAULT_LAYOUT, { width: 0, height: 0 }, 1)).toBe(DEFAULT_LAYOUT);
  });

  it('never overrides a fraction the player has dragged', () => {
    const dragged: Layout = { editorFraction: 0.31, viewportFraction: 0.72 };
    expect(effectiveLayout(dragged, WIDE, 1)).toEqual(dragged);
  });

  it('overrides only the axis still sitting on its default', () => {
    const half: Layout = { editorFraction: 0.31, viewportFraction: DEFAULT_LAYOUT.viewportFraction };
    const out = effectiveLayout(half, WIDE, 1);
    expect(out.editorFraction).toBe(0.31);
    expect(out.viewportFraction).toBeGreaterThan(DEFAULT_LAYOUT.viewportFraction);
  });

  it('caps the detail panel so a tall window spends its height on the site view', () => {
    const out = effectiveLayout(DEFAULT_LAYOUT, WIDE, 1);
    const detail = WIDE.height * (1 - out.viewportFraction);
    expect(detail).toBeCloseTo(340, 0);
    // The old constant fraction gave the brief 575px of height for the same fixed amount of text.
    expect(detail).toBeLessThan(WIDE.height * (1 - DEFAULT_LAYOUT.viewportFraction));
  });

  it('frames a square grid squarely instead of in a 2:1 letterbox', () => {
    const before = viewportBox(DEFAULT_LAYOUT, WIDE);
    const after = viewportBox(effectiveLayout(DEFAULT_LAYOUT, WIDE, 1), WIDE);
    expect(before.width / before.height).toBeGreaterThan(1.9);
    expect(after.width / after.height).toBeLessThan(1.1);
    expect(after.height).toBeGreaterThan(before.height);
  });

  it('leaves a wide corridor level the full width it was already using', () => {
    const before = viewportBox(DEFAULT_LAYOUT, WIDE);
    const after = viewportBox(effectiveLayout(DEFAULT_LAYOUT, WIDE, 30 / 3), WIDE);
    expect(after.width).toBeCloseTo(before.width, 0);
  });

  it('keeps the detail panel and the editor usable on a 13" laptop', () => {
    const out = effectiveLayout(DEFAULT_LAYOUT, LAPTOP, 1);
    const right = LAPTOP.width * (1 - out.editorFraction) - 5;
    expect(right).toBeGreaterThanOrEqual(660);
    expect(LAPTOP.width - right).toBeGreaterThanOrEqual(520);
  });

  it('stays inside the splitters own bounds at every size and shape', () => {
    for (const box of [LAPTOP, WIDE, { width: 1024, height: 600 }, { width: 3840, height: 2000 }]) {
      for (const aspect of [1, 1.25, 1.4, 2, 4, 10]) {
        const out = effectiveLayout(DEFAULT_LAYOUT, box, aspect);
        expect(out.editorFraction).toBeGreaterThanOrEqual(0.24);
        expect(out.editorFraction).toBeLessThanOrEqual(0.68);
        expect(out.viewportFraction).toBeGreaterThanOrEqual(0.25);
        expect(out.viewportFraction).toBeLessThanOrEqual(0.8);
      }
    }
  });
});
