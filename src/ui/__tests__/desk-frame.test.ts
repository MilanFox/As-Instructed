import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DESK_FRAME } from '../desk/scale.ts';

const STYLE_DIR = join(process.cwd(), 'src/ui/styles/desk');

const MUST_CONTAIN: Record<string, string> = {
  'display--term': 'the program. the largest thing on the desk while writing',
  'display--feed': 'the site. the picture the whole work order describes',
  manual: 'the REFERENCE. a door',
  binder: 'the COMMENDATION BOOK. a door',
  dispatch: 'the only way to run a program',
  stampblock: 'how a work order is closed',
  copystand: 'what is pinned has to stay readable',
  siteplan: 'the way back to the campaign. a player got stuck in a work order without it',
  routines: 'lib.ts. the door onto the routines the player has published',
};

const MAY_OVERFLOW: Record<string, string> = {
  keyboard: 'cropped by the desk edge. you are sitting here',
  tray: 'sits behind the copy stand at the desk edge',
  pen: 'lies on the desk and may run off it',
  slot: 'display: none — deliveries arrive from off frame',
  mug: 'cut — subtraction beat placement',
  station: 'a bare wrapper. its two displays are measured instead',
  'paper-layer': 'a full-bleed layer. the sheets inside it are draggable anywhere',
  'binder-open': 'a full-bleed spread when the commendation book is open',
  room: 'the room is the viewport',
};

const FOCUS_KEEPS: Record<string, string> = {
  'display--term': 'the program. the view exists for it',
  'display--feed': 'the site, as a preview. a run you cannot watch is a run you cannot debug',
  routines: 'lib.ts — the player’s own code, on the terminal glass. reached from the file rail',
};

const FOCUS_HIDES: Record<string, string> = {
  room: 'no lamp and nothing to light. a half-lit desk with no desk on it reads as a bug',
  manual: 'the REFERENCE is paper on the desk. the switch is the door to it',
  binder: 'the commendation book is a bound book on the desk',
  'binder-open': 'its spread has nothing to lie on',
  dispatch: 'ctrl+enter is the only way to run, and the status strip has always printed it',
  stampblock: 'the strip states that a passed order is ready to close, and names the key',
  copystand: 'what is pinned is paper',
  siteplan: 'the way back to the campaign is one throw of the switch away',
  keyboard: 'there is no desk edge to be cropped by',
  tray: 'the in-tray stands on the desk',
  pen: 'it lies on the desk',
  slot: 'already off frame at rest',
  'paper-layer': 'the paperwork. the single largest thing the player asked to be rid of',
  mug: 'cut from the desk already, and still cut here',
};

interface Box {
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  centred?: boolean;
}

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

interface Rule {
  selector: string;
  body: string;
}

function deskRules(css: string): Rule[] {
  const found: Rule[] = [];
  const pattern = /\.desk([^{}]*)\{([^}]*)\}/g;
  let rule: RegExpExecArray | null;
  while ((rule = pattern.exec(css)) !== null) {
    found.push({ selector: (rule[1] ?? '').trim(), body: rule[2] ?? '' });
  }
  return found;
}

function viewOf(selector: string): 'desk' | 'program' | 'both' {
  const named = /\[data-focus=['"]?([\w-]+)['"]?\]/.exec(selector)?.[1];
  if (named === undefined) return 'both';
  return named === 'program' ? 'program' : 'desk';
}

function classesIn(selector: string): string[] {
  return [...new Set((selector.match(/\.[\w-]+/g) ?? []).map((each) => each.slice(1)))];
}

function fixedBoxes(rules: readonly Rule[]): Map<string, Box> {
  const found = new Map<string, Box>();
  for (const { selector, body } of rules) {
    if (viewOf(selector) === 'program') continue;
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

function hides(body: string): boolean {
  return /(?:^|;)\s*display:\s*none/.test(body);
}

const css = readDeskCss();
const rules = deskRules(css);
const boxes = fixedBoxes(rules);
const focusRules = rules.filter((rule) => viewOf(rule.selector) === 'program');

const NOT_FURNITURE = new Set(['desk', 'display', 'bezel', 'screen', 'glass', 'stand', 'held']);

describe('the desk frame contains the desk', () => {
  it('classifies every fixed object as contained or deliberately cropped', () => {
    const unclassified = [...boxes.entries()]
      .filter(([, box]) => box.centred)
      .map(([name]) => name)
      .filter(
        (name) => !NOT_FURNITURE.has(name) && !(name in MUST_CONTAIN) && !(name in MAY_OVERFLOW),
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

  it('draws lib.ts on the terminal glass and nowhere else', () => {
    const term = boxes.get('display--term');
    const routines = boxes.get('routines');
    const pad = Number(
      /\.desk \.bezel\s*\{[^}]*?padding:\s*calc\(\s*([\d.]+)\s*\*\s*var\(--u\)\s*\)/.exec(css)?.[1],
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

describe('FOCUS is two objects and a way out', () => {
  it('rules on every object the desk places', () => {
    const placed = [...Object.keys(MUST_CONTAIN), ...Object.keys(MAY_OVERFLOW)]
      .filter((name) => name !== 'station' && boxes.has(name))
      .sort();
    const undecided = placed.filter((name) => !(name in FOCUS_KEEPS) && !(name in FOCUS_HIDES));
    const both = placed.filter((name) => name in FOCUS_KEEPS && name in FOCUS_HIDES);

    expect(undecided, 'nobody has said whether these are in the FOCUS view').toEqual([]);
    expect(both, 'these are on both roll-calls').toEqual([]);
  });

  it('takes every hidden object off screen outright', () => {
    const hidden = new Set<string>();
    for (const { selector, body } of focusRules) {
      if (!hides(body)) continue;
      for (const name of classesIn(selector)) hidden.add(name);
    }
    const restingHidden = new Set(
      rules
        .filter((rule) => viewOf(rule.selector) !== 'program' && hides(rule.body))
        .flatMap((rule) => classesIn(rule.selector)),
    );
    const leaking = Object.keys(FOCUS_HIDES)
      .filter((name) => !hidden.has(name) && !restingHidden.has(name))
      .sort();
    expect(leaking, 'these are on the desk in a view that has no desk').toEqual([]);
  });

  it('leaves every kept object on screen', () => {
    const hidden = new Set(
      focusRules.filter((rule) => hides(rule.body)).flatMap((rule) => classesIn(rule.selector)),
    );
    const lost = Object.keys(FOCUS_KEEPS)
      .filter((name) => hidden.has(name))
      .sort();
    expect(lost, 'the view exists for these').toEqual([]);
  });

  it('keeps the bezel plate, which carries the switch back', () => {
    const gone = focusRules
      .filter((rule) => hides(rule.body))
      .flatMap((rule) => classesIn(rule.selector))
      .filter((name) => name === 'bezel-foot' || name === 'focussw' || name === 'bezel');
    expect(gone, 'this is the only way out of the FOCUS view').toEqual([]);

    const switchRule = rules.some((rule) => rule.selector.includes('.focussw'));
    expect(switchRule, 'the FOCUS switch has no rule in src/ui/styles/desk/').toBe(true);
  });

  it('draws lib.ts on the glass the glass says it is', () => {
    const rule = focusRules.find((each) => classesIn(each.selector).includes('routines'));
    expect(
      rule,
      '.routines has no FOCUS rule, so it keeps a box the desk composition set',
    ).toBeDefined();
    for (const [side, property] of [
      ['left', '--glass-x'],
      ['top', '--glass-y'],
      ['width', '--glass-w'],
      ['height', '--glass-h'],
    ] as const) {
      expect([side, rule?.body.includes(`${side}: var(${property})`)]).toEqual([side, true]);
    }
    const terminal = readFileSync(join(process.cwd(), 'src/ui/desk/terminal/Terminal.tsx'), 'utf8');
    for (const property of ['--glass-x', '--glass-y', '--glass-w', '--glass-h']) {
      expect([property, terminal.includes(property)]).toEqual([property, true]);
    }
  });

  it('lays the station against the window rather than in the frame', () => {
    const station = focusRules.find(
      (rule) => classesIn(rule.selector).length === 1 && classesIn(rule.selector)[0] === 'station',
    );
    expect(station, '.station has no FOCUS rule').toBeDefined();
    expect(['inset', /inset:\s*0/.test(station?.body ?? '')]).toEqual(['inset', true]);
    expect(['grid', /display:\s*grid/.test(station?.body ?? '')]).toEqual(['grid', true]);
  });

  it('places nothing in the frame from a FOCUS rule', () => {
    const placed: string[] = [];
    for (const { selector, body } of focusRules) {
      for (const side of ['left', 'top'] as const) {
        const declaration = new RegExp(`(?:^|;)\\s*${side}:\\s*([^;]+)`).exec(body);
        const value = declaration?.[1] === undefined ? undefined : units(declaration[1].trim());
        if (value?.centred) placed.push(`${selector} { ${side} }`);
      }
    }
    expect(
      placed,
      'a FOCUS rule that measures from the centre of the frame is in the frame',
    ).toEqual([]);
  });

  it('changes no box the desk composition states', () => {
    const restingOnly = fixedBoxes(rules.filter((rule) => viewOf(rule.selector) === 'both'));
    for (const name of Object.keys(MUST_CONTAIN)) {
      expect(boxes.get(name), `.${name} is measured differently once FOCUS rules are read`).toEqual(
        restingOnly.get(name),
      );
    }
  });
});
