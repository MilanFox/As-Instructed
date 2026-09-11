import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { DESK_SURFACE_Y, DOC_ARRIVAL, DOC_HOME } from '../desk/paper/papers.ts';

const read = (path: string): string =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

function centredTop(css: string, selector: string): number {
  const rule = new RegExp(`\\.desk \\.${selector}\\s*\\{[^}]*\\}`).exec(css)?.[0] ?? '';
  const found = /top:\s*calc\(\s*50%\s*([-+])\s*([\d.]+)\s*\*\s*var\(--u\)\s*\)/.exec(rule);
  if (!found?.[2]) throw new Error(`no centred top for .${selector}`);
  return Number(found[2]) * (found[1] === '-' ? -1 : 1);
}

function standOffset(css: string, selector: string): number {
  const rule = new RegExp(`\\.desk \\.${selector}\\s*\\{[^}]*\\}`).exec(css)?.[0] ?? '';
  const found = /top:\s*calc\(\s*([\d.]+)\s*\*\s*var\(--u\)\s*\)/.exec(rule);
  if (!found?.[1]) throw new Error(`no stand offset for .${selector}`);
  return Number(found[1]);
}

const terminalCss = read('src/ui/styles/desk/terminal.css');
const monitorCss = read('src/ui/styles/desk/monitor.css');

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
