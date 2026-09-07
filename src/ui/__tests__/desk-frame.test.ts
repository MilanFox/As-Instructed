/**
 * The frame must contain the furniture it frames.
 *
 * `DESK_FRAME` is the denominator of `--u`, so a frame smaller than the composition crops it at
 * every viewport where that axis binds. That is not hypothetical: the prototype's 1560 x 1000 was
 * four units short vertically against a terminal whose top edge is at `50% - 502 * u`, and the
 * terminal's lit north arris — the one hard rule the lamp spends on the top edge — was
 * clipped by about 1.5px on every laptop.
 *
 * The extents are **recomputed from the stylesheets**, never restated here. A test that carried
 * its own copy of the numbers would pass forever while someone nudged the in-tray outward, which
 * is precisely how the objectives overlay shipped past a guard that asserted the wrong thing.
 * The only literals below are the *policy*: which objects have to be
 * wholly on screen and which are cropped on purpose.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DESK_FRAME } from '../desk/scale.ts';

const STYLE_DIR = join(process.cwd(), 'src/ui/styles/desk');

/**
 * Wholly on screen at every supported viewport. Each of these is either a machine the player
 * reads or a door they have to be able to find — a
 * door the player cannot see is a door that does not exist.
 */
const MUST_CONTAIN: Record<string, string> = {
  'display--term': 'the program. the largest thing on the desk while writing',
  'display--feed': 'the site. the picture the whole work order describes',
  manual: 'the REFERENCE. a door',
  binder: 'the Repository. a door',
  dispatch: 'the only way to run a program',
  stampblock: 'how a work order is closed',
  copystand: 'what is pinned has to stay readable',
  siteplan: 'the way back to the campaign. a player got stuck in a work order without it',
  routines: 'lib.ts. the door onto the routines the player has published',
};

/**
 * Cropped by the front edge of the desk on purpose, because you are sitting at it. Clipping these
 * is the composition working, not failing.
 */
const MAY_OVERFLOW: Record<string, string> = {
  keyboard: 'cropped by the desk edge. you are sitting here',
  tray: 'sits behind the copy stand at the desk edge',
  pen: 'lies on the desk and may run off it',
  slot: 'display: none — deliveries arrive from off frame',
  mug: 'cut — subtraction beat placement',
  station: 'a bare wrapper. its two displays are measured instead',
  'paper-layer': 'a full-bleed layer. the sheets inside it are draggable anywhere',
  'binder-open': 'a full-bleed spread when the Repository is open',
  room: 'the room is the viewport',
};

interface Box {
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  /**
   * Whether the rule positions from the centre of the frame. That is what makes something a piece
   * of furniture rather than a part of one: a stage object is placed against the desk, a detail is
   * placed against its parent.
   */
  centred?: boolean;
}

/** `calc(50% - 762 * var(--u))` -> -762 centred, `calc(306 * var(--u))` -> 306 not. */
function units(value: string): { n: number; centred: boolean } | undefined {
  const centred = /calc\(\s*50%\s*([-+])\s*([\d.]+)\s*\*\s*var\(--u\)\s*\)/.exec(value);
  if (centred?.[2]) return { n: Number(centred[2]) * (centred[1] === '-' ? -1 : 1), centred: true };
  const plain = /^calc\(\s*([\d.]+)\s*\*\s*var\(--u\)\s*\)$/.exec(value);
  if (plain?.[1]) return { n: Number(plain[1]), centred: false };
  return undefined;
}

function readDeskCss(): string {
  return readdirSync(STYLE_DIR)
    .filter((name) => name.endsWith('.css') && name !== 'director.css')
    .map((name) => readFileSync(join(STYLE_DIR, name), 'utf8'))
    .join('\n');
}

/** Every class the desk positions with `position: fixed`, with whatever box it declares. */
function fixedBoxes(css: string): Map<string, Box> {
  const found = new Map<string, Box>();
  const rules = /\.desk([^{}]*)\{([^}]*)\}/g;
  let rule: RegExpExecArray | null;
  while ((rule = rules.exec(css)) !== null) {
    const selector = (rule[1] ?? '').trim();
    const body = rule[2] ?? '';
    const classes = selector.match(/\.[\w-]+/g);
    if (!classes || classes.length !== 1 || !classes[0]) continue;
    const name = classes[0].slice(1);
    const declares = /position:\s*fixed/.test(body);
    const box: Box = found.get(name) ?? {};
    let touched = false;
    for (const side of ['left', 'top', 'width', 'height'] as const) {
      const declaration = new RegExp(`(?:^|;)\\s*${side}:\\s*([^;]+)`).exec(body);
      if (!declaration?.[1]) continue;
      const value = units(declaration[1].trim());
      if (value === undefined) continue;
      box[side] = value.n;
      if (value.centred && (side === 'left' || side === 'top')) box.centred = true;
      touched = true;
    }
    if (declares || touched || found.has(name)) found.set(name, box);
  }
  return found;
}

const css = readDeskCss();
const boxes = fixedBoxes(css);

/**
 * `.display` carries `position: fixed` for both machines; the two modifiers carry the geometry.
 * The shared rule is not a piece of furniture and has nothing to measure.
 */
const NOT_FURNITURE = new Set(['desk', 'display', 'bezel', 'screen', 'glass', 'stand', 'held']);

describe('the desk frame contains the desk', () => {
  it('classifies every fixed object as contained or deliberately cropped', () => {
    const unclassified = [...boxes.entries()]
      .filter(([, box]) => box.centred)
      .map(([name]) => name)
      .filter(
        (name) =>
          !NOT_FURNITURE.has(name) && !(name in MUST_CONTAIN) && !(name in MAY_OVERFLOW),
      );
    expect(unclassified).toEqual([]);
  });

  it('measures the furniture rather than restating it', () => {
    for (const name of Object.keys(MUST_CONTAIN)) {
      const box = boxes.get(name);
      expect(box, `${name} has no rule in src/ui/styles/desk/`).toBeDefined();
      expect(box?.left, `${name} declares no centred left`).toBeTypeOf('number');
      expect(box?.top, `${name} declares no centred top`).toBeTypeOf('number');
    }
  });

  it('is wide enough for the widest thing on the desk', () => {
    let widest = 0;
    let by = '';
    for (const name of Object.keys(MUST_CONTAIN)) {
      const box = boxes.get(name);
      if (box?.left === undefined) continue;
      const reach = Math.max(Math.abs(box.left), Math.abs(box.left + (box.width ?? 0)));
      if (reach > widest) {
        widest = reach;
        by = name;
      }
    }
    expect(widest, 'no furniture was measured').toBeGreaterThan(0);
    expect(
      DESK_FRAME.w,
      `.${by} reaches ${widest} units from the centre, so the frame needs ${widest * 2}`,
    ).toBeGreaterThanOrEqual(widest * 2);
  });

  it('is tall enough for the terminal, whose lit top edge is the thing that clipped', () => {
    let tallest = 0;
    let by = '';
    for (const name of Object.keys(MUST_CONTAIN)) {
      const box = boxes.get(name);
      if (box?.top === undefined) continue;
      const reach = Math.max(Math.abs(box.top), Math.abs(box.top + (box.height ?? 0)));
      if (reach > tallest) {
        tallest = reach;
        by = name;
      }
    }
    expect(tallest, 'no furniture was measured').toBeGreaterThan(0);
    expect(
      DESK_FRAME.h,
      `.${by} reaches ${tallest} units from the centre, so the frame needs ${tallest * 2}`,
    ).toBeGreaterThanOrEqual(tallest * 2);
  });

  /**
   * The routines file is the terminal showing something else, not a layer laid over it.
   *
   * The rule is absolute that nothing is drawn over either machine, and a
   * full-bleed panel is how that rule gets broken by accident. So the box is asserted to be the
   * terminal's glass exactly — recomputed here from the bezel's padding and the terminal screen's
   * own height, never restated — which makes it impossible for it to reach the desk, the paper or
   * the site feed without failing.
   */
  it('draws lib.ts on the terminal glass and nowhere else', () => {
    const term = boxes.get('display--term');
    const routines = boxes.get('routines');
    const pad = Number(
      /\.desk \.bezel\s*\{[^}]*?padding:\s*calc\(\s*([\d.]+)\s*\*\s*var\(--u\)\s*\)/.exec(
        css,
      )?.[1],
    );
    const screenHeight = Number(
      /\.desk \.display--term \.screen\s*\{[^}]*?height:\s*calc\(\s*([\d.]+)\s*\*\s*var\(--u\)\s*\)/.exec(
        css,
      )?.[1],
    );

    expect(pad, 'no bezel padding in src/ui/styles/desk/').toBeGreaterThan(0);
    expect(screenHeight, 'no terminal screen height in src/ui/styles/desk/').toBeGreaterThan(0);
    expect(term?.left).toBeTypeOf('number');
    expect(term?.width).toBeTypeOf('number');

    expect({
      left: routines?.left,
      top: routines?.top,
      width: routines?.width,
      height: routines?.height,
    }).toEqual({
      left: (term?.left ?? 0) + pad,
      top: (term?.top ?? 0) + pad,
      width: (term?.width ?? 0) - 2 * pad,
      height: screenHeight,
    });
  });

  it('is not so large that it wastes the window', () => {
    // A frame with slack shrinks every desk for nothing. Half a unit of tolerance, no more.
    let widest = 0;
    let tallest = 0;
    for (const name of Object.keys(MUST_CONTAIN)) {
      const box = boxes.get(name);
      if (box?.left !== undefined) {
        widest = Math.max(widest, Math.abs(box.left), Math.abs(box.left + (box.width ?? 0)));
      }
      if (box?.top !== undefined) {
        tallest = Math.max(tallest, Math.abs(box.top), Math.abs(box.top + (box.height ?? 0)));
      }
    }
    expect(DESK_FRAME.w).toBeLessThanOrEqual(widest * 2 + 1);
    expect(DESK_FRAME.h).toBeLessThanOrEqual(tallest * 2 + 1);
  });
});
