/**
 * The desk's replacement for the HUD-overlap guard, and the board's legibility floor.
 *
 * `docs/FIX-HUD-OVERLAP.md` landed a guard that keeps the objective read-out off the drawn grid,
 * and `docs/AUDIT-UI.md` §6.5 records that it protects exactly one rectangle — the chip row and
 * the empty-state note were left over the board on purpose. That guard lived in
 * `useWorkspaceLayout.ts` and read `--hud-gutter` out of `app.css`, and **none of that machinery
 * survives**: there is no HUD strip, no card, no `Workspace` and no hook. The header here used to
 * shorten that to "the desk uses none of it", which was read as "the desk uses none of `app.css`".
 * That is false and was false when it was written — the desk reads fifty class names out of that
 * sheet, and three shipped defects came in through them. The last block below states what is
 * actually true and holds it mechanically.
 *
 * The desk's answer is stronger and cheaper. Nothing is placed over the board at all. The canvas
 * is inset by `FEED_INSET` and every readout on the feed lives in the strip that inset created, so
 * the property to prove is not "the card misses the grid" but "the camera can never draw a tile
 * where a readout is". That reduces to two mechanical checks, and this file is both:
 *
 *  1. the stylesheet takes the canvas box from `geometry.ts`, and `Monitor.tsx` publishes it —
 *     neither side can drift without this failing;
 *  2. the real `Camera`, fitted to that box at every supported viewport and every grid in the
 *     campaign, draws entirely inside it.
 *
 * The third block is the cost, stated the way `FIX-HUD-OVERLAP.md` §8 states the objectives
 * strip's: which levels lose legibility and by how much. The fourth is the `app.css` boundary.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

import { Camera, ZOOM_LADDER, ladderIndex } from '../../render/camera.ts';
import { deskUnit } from '../desk/scale.ts';
import { FEED_INSET, LEGIBLE_DEVICE_TILE_PX } from '../desk/monitor/geometry.ts';
import { campaignOrder } from '../../levels/index.ts';

const read = (path: string): string =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

const MONITOR_CSS = read('src/ui/styles/desk/monitor.css');

/** `calc(N * var(--u))` out of a named rule, in design units. */
function designUnits(selector: string, property: string): number {
  const rule = new RegExp(`\\${selector}\\s*\\{[^}]*\\}`).exec(MONITOR_CSS)?.[0] ?? '';
  const found = new RegExp(`${property}:\\s*calc\\(([0-9.]+) \\* var\\(--u\\)\\)`).exec(rule);
  if (!found) throw new Error(`no ${property} on ${selector}`);
  return Number(found[1]);
}

/*
 * The picture area comes out of the stylesheet, because the stylesheet is where the composition is
 * written; the strip comes out of `geometry.ts`, because that is where `Monitor.tsx` reads it. The
 * whole point of this file is that the two cannot drift, so neither side is restated here.
 */
const BEZEL_SIDE = 22;
const FEED_SCREEN = {
  w: designUnits('.display--feed', 'width') - BEZEL_SIDE * 2,
  h: designUnits('.bezel--feed .screen', 'height'),
};
const FEED_CANVAS = {
  w: FEED_SCREEN.w - FEED_INSET.w - FEED_INSET.e,
  h: FEED_SCREEN.h - FEED_INSET.n - FEED_INSET.s,
};

/** The two viewports the desk is checked at. 1280x800 is the smallest supported laptop. */
const VIEWPORTS = [
  { label: '1280x800', w: 1280, h: 800 },
  { label: '1440x860', w: 1440, h: 860 },
] as const;

/** Retina. The floor in `docs/DESK-CONCEPT.md` §7 is stated in device pixels. */
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

  /*
   * The property the old guard proved for one card, proved for the whole picture instead: fit the
   * real camera to the real canvas box and the grid it draws is inside it, at every grid in the
   * campaign and both supported viewports. Nothing else on this screen is over the canvas, so
   * nothing else can collide with it.
   */
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

  /*
   * There is one strip on each side and the chrome has to fit in it, or a readout grows back over
   * the picture the long way round. These are the ported rules' own numbers; none of them
   * multiplies by `--ts`, which is what makes the SIZE dial unable to cost the board a rung.
   */
  test('every readout on the screen fits the strip that reserved it', () => {
    const css = MONITOR_CSS;
    const screenRules = css.slice(0, css.indexOf('.desk .feed-controls'));
    expect(['no --ts inside the screen', screenRules.includes('var(--ts)')]).toEqual([
      'no --ts inside the screen',
      false,
    ]);

    // header strip: 7u offset + a 9.5u line, inside the 33u north strip with the ruler below it.
    expect(FEED_INSET.n).toBeGreaterThanOrEqual(7 + 9.5 * 1.25 + 14);
    // south strip: the 26u timecode on its own line box, 2u clear of the bezel.
    expect(FEED_INSET.s).toBeGreaterThanOrEqual(26 + 2);
  });
});

/*
 * The cost, stated rather than hidden — the register `docs/FIX-HUD-OVERLAP.md` §8 uses when it says
 * plainly that four of thirty-three levels lose one rung at 1280.
 *
 * `docs/DESK-CONCEPT.md` §7 sets the floor at 24 device pixels per tile, and its own derivation of
 * the tile sizes is width-bound on a screen that is height-bound: the picture is 656 x 438 design
 * units, so a square grid is fitted by its height and `w4-05` lands at 14 device px at 1280x800,
 * not the 28 the document claims.
 *
 * These are the levels the feed cannot show **whole** above the floor. It is not a list of levels
 * that open illegibly — none do, because the camera climbs to the floor on entry and crops instead
 * (`LEGIBLE_DEVICE_TILE_PX`). It is the list of levels where seeing all of it and reading it are
 * two different views, and `FIT` on the transport is how a player asks for the first one. The list
 * is a ratchet: a level joining it has to be argued for, not absorbed.
 */
const CANNOT_SHOW_WHOLE_BOARD_AT_1280 = [
  'w4-04',
  'w4-05',
  'w5-02',
  'w6-05',
  'w7-05',
  'w8-02',
  'w8-04',
  'w8-05',
] as const;

/**
 * The same list with the graticule's strip given back to the canvas, which is what the strip
 * actually costs: five of the eight cannot be shown whole and legibly on a full-bleed screen
 * either. The strip is worth one ladder rung on most of the campaign and it moves three levels —
 * `w5-02`, `w7-05` and `w8-02`, all of which sit on exactly 24 without it — off the whole-board
 * view. It never costs a level its legibility, because legibility is no longer what fit decides.
 */
const CANNOT_SHOW_WHOLE_BOARD_FULL_BLEED = ['w4-04', 'w4-05', 'w6-05', 'w8-04', 'w8-05'] as const;

describe('the legibility floor', () => {
  test('only the known large grids cannot be shown whole above the floor at 1280x800', () => {
    const under: string[] = [];
    for (const level of campaignOrder()) {
      const world = level.build(level.seeds[0] as number);
      if (fit(1280, 800, world.w, world.h).deviceTilePx < 24) under.push(level.id);
    }
    expect(under).toEqual([...CANNOT_SHOW_WHOLE_BOARD_AT_1280]);
  });

  /*
   * The ruling this file exists under: a work order never opens below the floor. `w2-02` is the one
   * that matters most — DESIGN §11 A5 makes it unsolvable if a player cannot read crop maturity —
   * and it clears the floor on the fit alone, so it never crops.
   */
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

  test('w2-02 is legible on the fit alone, so it is never cropped', () => {
    const level = campaignOrder().find((each) => each.id === 'w2-02');
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

/*
 * The `app.css` boundary, stated as what it is rather than as what would be nicer.
 *
 * `app.css` is the old panel workspace's sheet. The workspace was deleted when the desk replaced
 * it and the rules were not, so the file filled up with selectors that described nothing — until
 * one of them happened to name a class the desk *does* render, at which point it silently painted
 * a surface nobody intended. That is not hypothetical: `docs/PLAYTEST.md` has three of them from
 * one playthrough. An orphaned `.crate` block put a dark background behind paper ink and blanked
 * all eight verb names on the hardware requisition — the sheet whose entire job is naming the new
 * commands. `.desk .crate .nm` needed `flex-wrap` or the `reference` button printed over the spec.
 * An orphaned `.seed-row__outstanding { white-space: nowrap; overflow: hidden }` clipped every
 * per-seed failure reason on the halt notice mid-word. All three names are in `paper.css` too,
 * which is the whole mechanism and the whole guard: two sheets, one name, nobody's decision.
 *
 * A hard boundary — `app.css` reaches nothing under `.desk` — is not available at this price. The
 * desk genuinely reads this sheet: the terminal rail takes `.objective__mark`'s box and border and
 * `.objective__label`'s `flex` from here, the halt notice takes `.cause__diff-value`, `.seed-chip`
 * and `.tag`, and `.sr-only` is declared nowhere else. Cutting them off restyles the desk, which
 * is the one thing this may not do — measured rather than guessed: every element of the desk at
 * rest, of the hardware requisition and of the halt notice, on fifty computed properties each.
 *
 * So the guard holds the *class*, not the instances. Every name the two sheets share is listed,
 * and a new one fails this test. It cannot tell a deliberate share from an orphan — that is the
 * author's job — but it makes the author say which they meant, which is exactly what did not
 * happen three times. The list is a ratchet: it may only get shorter.
 */
const SHARED_WITH_THE_DESK = [
  // the objective rail and the report's copy of it, drawn from one set of rules
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
  // the budget gauge, the fuel gauge and par, on the rail and on the report
  'budget-bar',
  'budget-bar__fill',
  'budget-bar__limit',
  'fuel',
  'fuel__track',
  'fuel__value',
  'par-note',
  'par-row__value--good',
  'par-row__value--over',
  // why the run failed, on the halt notice
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
  // the two components the site map and the desk both mount
  'commend',
  'commend--in',
  'commend--out',
  'commend__note',
  'commend__seal',
  'commend__title',
  'medal',
  'medal--lg',
  // and the four names both sheets simply use
  'modal',
  'overlay',
  'screen',
  'sr-only',
] as const;

describe('app.css and the desk share only the names they mean to', () => {
  /** Every class named in a selector of a sheet, comments and declarations stripped. */
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

  /*
   * The names the three defects came through. None is in the shell sheet any more, and naming them
   * here is the point: both leaks would have been caught by the rule above rather than by a
   * playtester, because `paper.css` names all three as well.
   */
  test('the classes the three defects came through are gone from the shell sheet', () => {
    for (const name of ['crate', 'crate__head', 'seed-row__outstanding', 'hud-card', 'splitter']) {
      expect([name, shell.has(name)]).toEqual([name, false]);
    }
  });
});
