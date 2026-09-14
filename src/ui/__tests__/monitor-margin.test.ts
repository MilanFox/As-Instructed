import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

import { Camera, ZOOM_LADDER, ladderIndex } from '../../render/camera.ts';
import { deskUnit } from '../desk/scale.ts';
import { FEED_INSET, LEGIBLE_DEVICE_TILE_PX } from '../desk/monitor/geometry.ts';
import { campaignOrder } from '../../levels/index.ts';

const read = (path: string): string =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

const MONITOR_CSS = read('src/ui/styles/desk/monitor.css');

function designUnits(selector: string, property: string): number {
  const rule = new RegExp(`\\${selector}\\s*\\{[^}]*\\}`).exec(MONITOR_CSS)?.[0] ?? '';
  const found = new RegExp(`${property}:\\s*calc\\(([0-9.]+) \\* var\\(--u\\)\\)`).exec(rule);
  if (!found) throw new Error(`no ${property} on ${selector}`);
  return Number(found[1]);
}

const BEZEL_SIDE = 22;
const FEED_SCREEN = {
  w: designUnits('.display--feed', 'width') - BEZEL_SIDE * 2,
  h: designUnits('.bezel--feed .screen', 'height'),
};
const FEED_CANVAS = {
  w: FEED_SCREEN.w - FEED_INSET.w - FEED_INSET.e,
  h: FEED_SCREEN.h - FEED_INSET.n - FEED_INSET.s,
};

const VIEWPORTS = [
  { label: '1280x800', w: 1280, h: 800 },
  { label: '1440x860', w: 1440, h: 860 },
] as const;

const DPR = 2;

interface Fit {
  deviceTilePx: number;
  cssTilePx: number;
  originX: number;
  originY: number;
  cols: number;
  rows: number;
  canvasW: number;
  canvasH: number;
}

function fit(viewportW: number, viewportH: number, cols: number, rows: number): Fit {
  const unit = deskUnit(viewportW, viewportH);
  const canvasW = FEED_CANVAS.w * unit;
  const canvasH = FEED_CANVAS.h * unit;
  const camera = new Camera();
  camera.setViewport(canvasW, canvasH, DPR);
  camera.setBounds({ cols, rows });
  camera.fit(true);
  return {
    deviceTilePx: camera.deviceTilePx,
    cssTilePx: camera.tilePx,
    originX: camera.originX(),
    originY: camera.originY(),
    cols,
    rows,
    canvasW,
    canvasH,
  };
}

describe('the feed reserves its own margin', () => {
  test('the stylesheet takes the canvas box from the monitor geometry', () => {
    const css = MONITOR_CSS;
    const rule = /#board\s*\{[^}]*\}/.exec(css)?.[0] ?? '';

    expect(['canvas top', /top:\s*var\(--feed-n\)/.test(rule)]).toEqual(['canvas top', true]);
    expect(['canvas left', /left:\s*var\(--feed-w\)/.test(rule)]).toEqual(['canvas left', true]);
    expect([
      'canvas width',
      /width:\s*calc\(100% - var\(--feed-w\) - var\(--feed-e\)\)/.test(rule),
    ]).toEqual(['canvas width', true]);
    expect([
      'canvas height',
      /height:\s*calc\(100% - var\(--feed-n\) - var\(--feed-s\)\)/.test(rule),
    ]).toEqual(['canvas height', true]);

    const monitor = read('src/ui/desk/monitor/Monitor.tsx');
    for (const property of ['--feed-n', '--feed-e', '--feed-s', '--feed-w']) {
      expect([property, monitor.includes(property)]).toEqual([property, true]);
    }
    expect(['insets come from geometry', monitor.includes('FEED_INSET')]).toEqual([
      'insets come from geometry',
      true,
    ]);
  });

  test('the picture area is the one the approved composition sets', () => {
    expect([FEED_SCREEN.w, FEED_SCREEN.h]).toEqual([656, 438]);
    expect([FEED_CANVAS.w, FEED_CANVAS.h]).toEqual([622, 375]);
  });

  test('the camera never draws a tile outside the canvas box', () => {
    const offenders: string[] = [];
    for (const viewport of VIEWPORTS) {
      for (const level of campaignOrder()) {
        const world = level.build(level.seeds[0] as number);
        const box = fit(viewport.w, viewport.h, world.w, world.h);
        const right = box.originX + world.w * box.cssTilePx;
        const bottom = box.originY + world.h * box.cssTilePx;
        const inside =
          box.originX >= -0.5 &&
          box.originY >= -0.5 &&
          right <= box.canvasW + 0.5 &&
          bottom <= box.canvasH + 0.5;
        if (!inside) offenders.push(`${level.id} @ ${viewport.label}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('every readout on the screen fits the strip that reserved it', () => {
    const css = MONITOR_CSS;
    const screenRules = css.slice(0, css.indexOf('.desk .feed-controls'));
    expect(['no --ts inside the screen', screenRules.includes('var(--ts)')]).toEqual([
      'no --ts inside the screen',
      false,
    ]);

    expect(FEED_INSET.n).toBeGreaterThanOrEqual(7 + 9.5 * 1.25 + 14);
    expect(FEED_INSET.s).toBeGreaterThanOrEqual(26 + 2);
  });
});

const CANNOT_SHOW_WHOLE_BOARD_AT_1280 = [
  'w4-03',
  'w4-04',
  'w5-02',
  'w6-05',
  'w7-05',
  'w8-02',
  'w8-04',
  'w8-05',
] as const;

const CANNOT_SHOW_WHOLE_BOARD_FULL_BLEED = ['w4-03', 'w4-04', 'w6-05', 'w8-04', 'w8-05'] as const;

describe('the legibility floor', () => {
  test('only the known large grids cannot be shown whole above the floor at 1280x800', () => {
    const under: string[] = [];
    for (const level of campaignOrder()) {
      const world = level.build(level.seeds[0] as number);
      if (fit(1280, 800, world.w, world.h).deviceTilePx < 24) under.push(level.id);
    }
    expect(under).toEqual([...CANNOT_SHOW_WHOLE_BOARD_AT_1280]);
  });

  test('no work order opens below the floor', () => {
    const target = ZOOM_LADDER.findIndex((rung) => rung >= LEGIBLE_DEVICE_TILE_PX);
    const under: string[] = [];
    for (const viewport of VIEWPORTS) {
      for (const level of campaignOrder()) {
        const world = level.build(level.seeds[0] as number);
        const fitted = fit(viewport.w, viewport.h, world.w, world.h).deviceTilePx;
        const opened = ZOOM_LADDER[Math.max(target, ladderIndex(fitted))] as number;
        if (opened < LEGIBLE_DEVICE_TILE_PX) under.push(`${level.id} @ ${viewport.label}`);
      }
    }
    expect(under).toEqual([]);
  });

  test('w2-01 is legible on the fit alone, so it is never cropped', () => {
    const level = campaignOrder().find((each) => each.id === 'w2-01');
    const world = (level as NonNullable<typeof level>).build(1);
    for (const viewport of VIEWPORTS) {
      const fitted = fit(viewport.w, viewport.h, world.w, world.h).deviceTilePx;
      expect([viewport.label, fitted >= LEGIBLE_DEVICE_TILE_PX]).toEqual([viewport.label, true]);
    }
  });

  test('the margin is what moves three of them, and the rest miss it either way', () => {
    const under: string[] = [];
    for (const level of campaignOrder()) {
      const world = level.build(level.seeds[0] as number);
      const unit = deskUnit(1280, 800);
      const camera = new Camera();
      camera.setViewport(FEED_SCREEN.w * unit, FEED_SCREEN.h * unit, DPR);
      camera.setBounds({ cols: world.w, rows: world.h });
      camera.fit(true);
      if (camera.deviceTilePx < 24) under.push(level.id);
    }
    expect(under).toEqual([...CANNOT_SHOW_WHOLE_BOARD_FULL_BLEED]);
  });
});

const SHARED_WITH_THE_DESK = [
  'objective',
  'objective--active',
  'objective--met',
  'objective--over',
  'objective__gate',
  'objective__label',
  'objective__mark',
  'objective__progress',
  'objective__progress--over',
  'seed-chip',
  'seed-row',
  'budget-bar',
  'budget-bar__fill',
  'budget-bar__limit',
  'fuel',
  'fuel__track',
  'fuel__value',
  'par-note',
  'par-row__value--good',
  'par-row__value--over',
  'cause',
  'cause__detail',
  'cause__diff',
  'cause__diff-tag',
  'cause__diff-where',
  'cause__head',
  'cause__label',
  'cause__readout',
  'failure-box',
  'failure-box__code',
  'failure-box__message',
  'failure-box__note',
  'record',
  'record__line',
  'record__numbers',
  'record__tag',
  'record__was',
  'tag',
  'commend',
  'commend--in',
  'commend--out',
  'commend__note',
  'commend__seal',
  'commend__title',
  'medal',
  'medal--lg',
  'modal',
  'overlay',
  'screen',
  'sr-only',
] as const;

describe('app.css and the desk share only the names they mean to', () => {
  function classesIn(css: string): Set<string> {
    const found = new Set<string>();
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const match of bare.matchAll(/(?:^|[};])([^{};]*)\{/g)) {
      const selector = match[1];
      if (!selector || selector.trim().startsWith('@')) continue;
      for (const name of selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
        if (name[1]) found.add(name[1]);
      }
    }
    return found;
  }

  const shell = classesIn(read('src/ui/styles/app.css'));
  const desk = new Set(
    ['desk', 'terminal', 'monitor', 'paper', 'furniture', 'director'].flatMap((name) => [
      ...classesIn(read(`src/ui/styles/desk/${name}.css`)),
    ]),
  );

  test('no name is in both sheets without being on the list', () => {
    const shared = [...shell].filter((name) => desk.has(name)).sort();
    expect(shared).toEqual([...SHARED_WITH_THE_DESK].sort());
  });

  test('the list carries no name that has stopped being shared', () => {
    const stale = [...SHARED_WITH_THE_DESK].filter((name) => !shell.has(name) || !desk.has(name));
    expect(stale).toEqual([]);
  });

  test('the classes the three defects came through are gone from the shell sheet', () => {
    for (const name of ['crate', 'crate__head', 'seed-row__outstanding', 'hud-card', 'splitter']) {
      expect([name, shell.has(name)]).toEqual([name, false]);
    }
  });
});
