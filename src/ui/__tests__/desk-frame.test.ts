/**
 * The frame must contain the furniture it frames — and the other view must contain the way out.
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
 *
 * **The desk is one composition fitted to a frame. FOCUS is a second view, and it is not in the
 * frame at all** — `.station` becomes a grid against the window and the two machines are sized by
 * it rather than placed in design units. So the two halves of this file guard different kinds of
 * thing, deliberately:
 *
 * - **The desk is guarded by extent.** Every assertion below the resting `describe` is the one it
 *   always was, measured off the rules that carry no `[data-focus=…]` predicate. That is also the
 *   first thing FOCUS could have broken and did not: a stray override that widened
 *   `.display--term` in *both* views would move the resting geometry these assertions measure, so
 *   the parser buckets by the predicate and the resting bucket is the un-predicated rules alone.
 *   `no FOCUS rule places anything in the frame` states the other half out loud.
 * - **FOCUS is guarded by presence and by the way out.** Extent is meaningless for a grid whose
 *   column is `1fr` of an unknown window, and asserting it would be asserting nothing. What can go
 *   wrong in this view is different in kind: an object leaking in that has no business in it, or —
 *   far worse — the bezel plate going out with the furniture. That plate carries the FOCUS switch,
 *   which is the only way back to the reference, the Repository, the paperwork and the stamp block.
 *   A view with no way out of it is the soft-lock DESIGN §10.6 forbids, wearing a stylesheet.
 *
 * So every object the desk places is on exactly one of two roll-calls, `FOCUS_KEEPS` or
 * `FOCUS_HIDES`, each entry with its reason. A new piece of deskware fails this file until somebody
 * decides which view it belongs to, which is the point: the alternative is that it leaks silently
 * into a view that was designed to be two objects and nothing else.
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
  binder: 'the COMMENDATION BOOK. a door',
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
  'binder-open': 'a full-bleed spread when the commendation book is open',
  room: 'the room is the viewport',
};

/**
 * On screen in FOCUS. Two machines and the player's own code, and that is the whole view.
 *
 * `routines` is the only entry here that is not a machine, and it earns its place: `~/lib.ts` is
 * the player's own subroutines drawn on the terminal's own glass, and this is the view for looking
 * at code. Its door is the file rail on the terminal bar, which is inside the glass and therefore
 * survives with it, so hiding the panel while leaving the key that opens it would be a door onto
 * nothing.
 */
const FOCUS_KEEPS: Record<string, string> = {
  'display--term': 'the program. the view exists for it',
  'display--feed': 'the site, as a preview. a run you cannot watch is a run you cannot debug',
  routines: 'lib.ts — the player’s own code, on the terminal glass. reached from the file rail',
};

/**
 * Off screen in FOCUS, with what the player gives up and how they get it back.
 *
 * Every one of these is reachable by throwing the switch, and the player asked for it in those
 * terms. Two of them are DESIGN §11 obligations rather than conveniences and are answered in copy
 * on the terminal's status strip rather than by being kept: `dispatch`, because `ctrl+enter` has to
 * be the announced way to run, and `stampblock`, because a passing verdict must not land on a
 * surface nobody can see.
 */
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

interface Rule {
  selector: string;
  body: string;
}

/** Every `.desk … { }` rule, in source order, because a later rule overrides an earlier one. */
function deskRules(css: string): Rule[] {
  const found: Rule[] = [];
  const pattern = /\.desk([^{}]*)\{([^}]*)\}/g;
  let rule: RegExpExecArray | null;
  while ((rule = pattern.exec(css)) !== null) {
    found.push({ selector: (rule[1] ?? '').trim(), body: rule[2] ?? '' });
  }
  return found;
}

/** The view a rule belongs to: the one its `[data-focus=…]` predicate names, or both. */
function viewOf(selector: string): 'desk' | 'program' | 'both' {
  const named = /\[data-focus=['"]?([\w-]+)['"]?\]/.exec(selector)?.[1];
  if (named === undefined) return 'both';
  return named === 'program' ? 'program' : 'desk';
}

/** Every class in a selector list, deduplicated — `.a, .b .c` -> `a`, `b`, `c`. */
function classesIn(selector: string): string[] {
  return [...new Set((selector.match(/\.[\w-]+/g) ?? []).map((each) => each.slice(1)))];
}

/**
 * Every class the desk positions with `position: fixed`, with whatever box it declares.
 *
 * Only the rules that place the resting composition are read. A FOCUS rule is a different view's
 * business and mixing the two would be measuring a composition that never exists.
 */
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

/** Whether a rule takes its subject off screen outright. */
function hides(body: string): boolean {
  return /(?:^|;)\s*display:\s*none/.test(body);
}

const css = readDeskCss();
const rules = deskRules(css);
const boxes = fixedBoxes(rules);
const focusRules = rules.filter((rule) => viewOf(rule.selector) === 'program');

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
    /* `slot` is already `display: none` at rest, so a FOCUS rule for it would be dead weight. */
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

  /**
   * The way out, and the only one.
   *
   * With the desk gone, the bezel plate is the whole of the game's navigation: the FOCUS switch on
   * it is how the player reaches the reference, the Repository, the site plan, the paperwork and
   * the stamp block again. A stylesheet that took the plate out with the furniture would be a
   * soft-lock, which DESIGN §10.6 forbids outright, and it would look like a tidy-up.
   */
  it('keeps the bezel plate, which carries the switch back', () => {
    const gone = focusRules
      .filter((rule) => hides(rule.body))
      .flatMap((rule) => classesIn(rule.selector))
      .filter((name) => name === 'bezel-foot' || name === 'focussw' || name === 'bezel');
    expect(gone, 'this is the only way out of the FOCUS view').toEqual([]);

    const switchRule = rules.some((rule) => rule.selector.includes('.focussw'));
    expect(switchRule, 'the FOCUS switch has no rule in src/ui/styles/desk/').toBe(true);
  });

  /**
   * `~/lib.ts` is still exactly the glass — established by measurement rather than by arithmetic.
   *
   * On the desk the panel's box is stated in design units and the assertion above recomputes it. In
   * this view the glass is whatever the window left it after the station's grid, so no `calc()` in
   * `--u` can name it: `Terminal.tsx` observes the screen and publishes its box as `--glass-x/-y/
   * -w/-h`, and the panel is those four numbers and nothing else. The identity is unchanged —
   * `.routines` still cannot reach the desk, the paper or the site feed — so what is checked here is
   * that it is taken from the glass and not re-derived from something that will drift.
   */
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

  /**
   * The station is laid against the window, and that is the difference between the two views.
   *
   * If this ever reverts to centred coordinates the view is back inside `DESK_FRAME`, the terminal
   * is back to the 1160u the copy stand allows it, and the whole reason for the second view is
   * gone — quietly, because everything would still render.
   */
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

  /**
   * And the resting composition is untouched by all of it.
   *
   * Every assertion in the first `describe` reads the un-predicated rules, so a FOCUS override
   * cannot reach them — this states the guarantee rather than trusting the parser to have it. A
   * rule that widened `.display--term` without a predicate would move the desk, and the desk is
   * approved.
   */
  it('changes no box the desk composition states', () => {
    const restingOnly = fixedBoxes(rules.filter((rule) => viewOf(rule.selector) === 'both'));
    for (const name of Object.keys(MUST_CONTAIN)) {
      expect(boxes.get(name), `.${name} is measured differently once FOCUS rules are read`).toEqual(
        restingOnly.get(name),
      );
    }
  });
});
