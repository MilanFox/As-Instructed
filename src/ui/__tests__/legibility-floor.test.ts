import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

import { campaignOrder } from '../../levels/index.ts';
import { Camera, ZOOM_LADDER, ladderIndex } from '../../render/index.ts';
import { LEGIBLE_DEVICE_TILE_PX } from '../feed/geometry.ts';

const read = (path: string): string =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

const SHEETS = [
  'workspace',
  'panel',
  'order',
  'telemetry',
  'deck',
  'drawer',
  'report',
  'banner',
  'reflow',
] as const;

const STYLES = new Map(SHEETS.map((name) => [name, read(`src/ui/styles/workspace/${name}.css`)]));

const REFLOW = STYLES.get('reflow') as string;
const WORKSPACE_CSS = STYLES.get('workspace') as string;

function declaredBreakpoints(css: string): number[] {
  const widths = [...css.matchAll(/@media[^{]*width\s*<=\s*(\d+)px/g)].map((found) =>
    Number(found[1]),
  );
  if (widths.length === 0) throw new Error('reflow.css declares no width breakpoint');
  return [...new Set(widths)].sort((a, b) => b - a);
}

function declarations(css: string, selector: string): string[] {
  const rule = new RegExp(`(?:^|})\\s*${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`).exec(css);
  if (!rule) throw new Error(`no rule for ${selector}`);
  return (rule[1] as string)
    .split(';')
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter((line) => line.length > 0);
}

const BREAKPOINTS = declaredBreakpoints(REFLOW);

const DPR = 2;

const NARROWEST_WHOLE_BOARD_WINDOW_PX = 576;
const SHALLOWEST_WHOLE_BOARD_WINDOW_PX = 480;

const CROPPED_IN_A_NARROWER_WINDOW = ['w8-05'] as const;
const CROPPED_IN_A_SHALLOWER_WINDOW = ['w4-04', 'w8-05'] as const;

interface Board {
  id: string;
  cols: number;
  rows: number;
}

const BOARDS: Board[] = campaignOrder().flatMap((level) =>
  level.seeds.map((seed) => {
    const world = level.build(seed);
    return { id: level.id, cols: world.w, rows: world.h };
  }),
);

function fittedTilePx(windowW: number, windowH: number, board: Board): number {
  const camera = new Camera();
  camera.setViewport(windowW, windowH, DPR);
  camera.setBounds({ cols: board.cols, rows: board.rows });
  camera.fit(true);
  return camera.deviceTilePx;
}

function croppedAt(windowW: number, windowH: number): string[] {
  const under = BOARDS.filter(
    (board) => fittedTilePx(windowW, windowH, board) < LEGIBLE_DEVICE_TILE_PX,
  ).map((board) => board.id);
  return [...new Set(under)];
}

describe('the legibility floor', () => {
  test('the map is the whole window at every declared breakpoint', () => {
    expect(['map box', declarations(WORKSPACE_CSS, '.workspace__map')]).toEqual([
      'map box',
      ['position: absolute', 'inset: 0', 'z-index: 0'],
    ]);
    const root = declarations(WORKSPACE_CSS, '.workspace');
    expect(['screen box', [root.includes('position: fixed'), root.includes('inset: 0')]]).toEqual([
      'screen box',
      [true, true],
    ]);

    for (const [name, css] of STYLES) {
      if (name === 'workspace') continue;
      const touches = css.includes('.workspace__map') || css.includes('#board');
      expect([`${name}.css resizes the map`, touches]).toEqual([
        `${name}.css resizes the map`,
        false,
      ]);
    }

    const canvas = read('src/ui/workspace/FeedCanvas.tsx');
    expect(['canvas fills the map', /width: '100%', height: '100%'/.test(canvas)]).toEqual([
      'canvas fills the map',
      true,
    ]);
  });

  test('every board is shown whole above the floor at each declared breakpoint', () => {
    for (const width of BREAKPOINTS) {
      expect([
        `${String(width)}px wide`,
        croppedAt(width, SHALLOWEST_WHOLE_BOARD_WINDOW_PX),
      ]).toEqual([`${String(width)}px wide`, []]);
    }
  });

  test('the narrowest declared breakpoint still carries the widest board', () => {
    const narrowest = Math.min(...BREAKPOINTS);
    expect(['breakpoint holds the board', narrowest >= NARROWEST_WHOLE_BOARD_WINDOW_PX]).toEqual([
      'breakpoint holds the board',
      true,
    ]);
  });

  test('the supported window is pinned where boards actually start cropping', () => {
    expect([
      'one pixel narrower',
      croppedAt(NARROWEST_WHOLE_BOARD_WINDOW_PX - 1, SHALLOWEST_WHOLE_BOARD_WINDOW_PX),
    ]).toEqual(['one pixel narrower', [...CROPPED_IN_A_NARROWER_WINDOW]]);

    for (const width of BREAKPOINTS) {
      expect([
        `${String(width)}px wide, one pixel shallower`,
        croppedAt(width, SHALLOWEST_WHOLE_BOARD_WINDOW_PX - 1),
      ]).toEqual([
        `${String(width)}px wide, one pixel shallower`,
        [...CROPPED_IN_A_SHALLOWER_WINDOW],
      ]);
    }
  });

  test('no work order opens cropped, so the floor climb never fires', () => {
    const floor = ZOOM_LADDER.findIndex((rung) => rung >= LEGIBLE_DEVICE_TILE_PX);
    const climbed: string[] = [];
    for (const width of BREAKPOINTS) {
      for (const board of BOARDS) {
        const fitted = fittedTilePx(width, SHALLOWEST_WHOLE_BOARD_WINDOW_PX, board);
        const opened = ZOOM_LADDER[Math.max(floor, ladderIndex(fitted))] as number;
        if (opened !== fitted) climbed.push(`${board.id} @ ${String(width)}px`);
      }
    }
    expect(climbed).toEqual([]);
  });

  test('w2-01 is legible on the fit alone in any supported window', () => {
    const boards = BOARDS.filter((board) => board.id === 'w2-01');
    expect(['w2-01 seeds', boards.length > 0]).toEqual(['w2-01 seeds', true]);
    for (const board of boards) {
      const fitted = fittedTilePx(
        NARROWEST_WHOLE_BOARD_WINDOW_PX,
        SHALLOWEST_WHOLE_BOARD_WINDOW_PX,
        board,
      );
      expect(['w2-01 fitted', fitted >= LEGIBLE_DEVICE_TILE_PX]).toEqual(['w2-01 fitted', true]);
    }
  });
});
