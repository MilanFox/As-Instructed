/**
 * No document may lie across a screen, and only one may lie on the desk at a time.
 *
 * A player opened `w1-03` and was handed five documents at once, stacked over the terminal:
 * *"I literally can't see anything anymore. It used to be one small sheet. Now there is like an
 * explosion of paper."* The program is the largest thing on this desk while it is being written and
 * that has been non-negotiable since the first brief; paper on top of it is paper in the way.
 *
 * Two causes, and both are guarded here rather than trusted. Five of the seven `DOC_HOME` entries
 * sat *above* the monitor's bottom edge, and every kind issued loose at once. The first is
 * geometry, so it is checked against the geometry — **the screen extents are recomputed from the
 * stylesheets**, the same way `desk-frame.test.ts` recomputes the frame and `monitor-margin.test.ts`
 * recomputes the canvas box. A guard that restated the numbers would pass forever while someone
 * moved a screen.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { DESK_SURFACE_Y, DOC_ARRIVAL, DOC_HOME } from '../desk/paper/papers.ts';

const read = (path: string): string =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

/** `top: calc(50% - 502 * var(--u))` -> -502. */
function centredTop(css: string, selector: string): number {
  const rule = new RegExp(`\\.desk \\.${selector}\\s*\\{[^}]*\\}`).exec(css)?.[0] ?? '';
  const found = /top:\s*calc\(\s*50%\s*([-+])\s*([\d.]+)\s*\*\s*var\(--u\)\s*\)/.exec(rule);
  if (!found?.[2]) throw new Error(`no centred top for .${selector}`);
  return Number(found[2]) * (found[1] === '-' ? -1 : 1);
}

/** `top: calc(716 * var(--u))` on the stand — how far the housing reaches below its own origin. */
function standOffset(css: string, selector: string): number {
  const rule = new RegExp(`\\.desk \\.${selector}\\s*\\{[^}]*\\}`).exec(css)?.[0] ?? '';
  const found = /top:\s*calc\(\s*([\d.]+)\s*\*\s*var\(--u\)\s*\)/.exec(rule);
  if (!found?.[1]) throw new Error(`no stand offset for .${selector}`);
  return Number(found[1]);
}

const terminalCss = read('src/ui/styles/desk/terminal.css');
const monitorCss = read('src/ui/styles/desk/monitor.css');

/** The lowest point either machine reaches, in design units from the centre of the frame. */
const SCREENS_BOTTOM = Math.max(
  centredTop(terminalCss, 'display--term') + standOffset(terminalCss, 'stand--term'),
  centredTop(monitorCss, 'display--feed') + standOffset(monitorCss, 'stand--feed'),
);

describe('paper never lies across a screen', () => {
  it('agrees with the stylesheets about where the desk surface starts', () => {
    expect(
      DESK_SURFACE_Y,
      `the machines reach ${String(SCREENS_BOTTOM)} units below centre`,
    ).toBeGreaterThanOrEqual(SCREENS_BOTTOM);
  });

  it('places every document below both machines', () => {
    const over = Object.entries(DOC_HOME)
      .filter(([, home]) => home.y < DESK_SURFACE_Y)
      .map(([kind, home]) => `${kind} at y ${String(home.y)}`);
    expect(over, 'these sit on a screen').toEqual([]);
  });

  it('lands a sheet taken out of the tray below them too', () => {
    expect(DOC_ARRIVAL.y).toBeGreaterThanOrEqual(DESK_SURFACE_Y);
  });
});
