import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

import { COMPACT_QUERY } from '../breakpoints.ts';

const read = (path: string): string =>
  readFileSync(new URL(`../../../../${path}`, import.meta.url), 'utf8');

const SHEETS = [
  'workspace',
  'panel',
  'order',
  'telemetry',
  'deck',
  'drawer',
  'report',
  'banner',
  'library',
  'reflow',
] as const;

type Sheet = (typeof SHEETS)[number];

const CSS = Object.fromEntries(
  SHEETS.map((name) => [name, read(`src/ui/styles/workspace/${name}.css`)]),
) as Record<Sheet, string>;

const BREAKPOINTS = [1440, 1200, 900, 600] as const;
const ROOMY = 1920;

interface Block {
  ceiling: number | null;
  body: string;
}

interface Rule extends Block {
  sheet: Sheet;
  selector: string;
}

function closingBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error('unbalanced braces');
}

function blocksIn(css: string): Block[] {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const media: Block[] = [];
  let outside = '';
  let i = 0;
  while (i < bare.length) {
    const at = bare.indexOf('@media', i);
    if (at === -1) {
      outside += bare.slice(i);
      break;
    }
    outside += bare.slice(i, at);
    const open = bare.indexOf('{', at);
    const end = closingBrace(bare, open);
    const prelude = bare.slice(at, open);
    // Short-screen and reduced-motion tweaks sit outside the width model this suite measures.
    if (/height|prefers-/.test(prelude)) {
      i = end + 1;
      continue;
    }
    const width = /width\s*<=\s*(\d+)px|max-width:\s*(\d+)px/.exec(prelude);
    if (!width) throw new Error(`unreadable media query: ${prelude.trim()}`);
    media.push({ ceiling: Number(width[1] ?? width[2]), body: bare.slice(open + 1, end) });
    i = end + 1;
  }
  return [{ ceiling: null, body: outside }, ...media];
}

function rulesIn(block: Block, sheet: Sheet): Rule[] {
  const found: Rule[] = [];
  let i = 0;
  while (i < block.body.length) {
    const open = block.body.indexOf('{', i);
    if (open === -1) break;
    const end = closingBrace(block.body, open);
    const prelude = block.body.slice(i, open).trim();
    const body = block.body.slice(open + 1, end);
    if (!prelude.startsWith('@')) {
      for (const each of prelude.split(',')) {
        const selector = each.trim().replace(/\s+/g, ' ');
        if (selector) found.push({ sheet, ceiling: block.ceiling, selector, body });
      }
    }
    i = end + 1;
  }
  return found;
}

const RULES: Rule[] = SHEETS.flatMap((sheet) =>
  blocksIn(CSS[sheet]).flatMap((block) => rulesIn(block, sheet)),
);

function declared(body: string, property: string): string | null {
  const hits = [...body.matchAll(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;}]+)`, 'g'))];
  return hits.at(-1)?.[1]?.trim() ?? null;
}

function resolve(selector: string, property: string, viewport: number): string | null {
  let value: string | null = null;
  for (const rule of RULES) {
    if (rule.selector !== selector) continue;
    if (rule.ceiling !== null && viewport > rule.ceiling) continue;
    const found = declared(rule.body, property);
    if (found !== null) value = found;
  }
  return value;
}

const OPEN = ".workspace[data-flyout='open']";

// The attribute selector outranks the bare class, so an open flyout takes its value first
// whichever sheet declared it.
function custom(name: string, viewport: number, open: boolean): string | null {
  const scoped = open ? resolve(OPEN, name, viewport) : null;
  return scoped ?? resolve('.workspace', name, viewport);
}

function commas(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === '(') depth += 1;
    else if (inner[i] === ')') depth -= 1;
    else if (inner[i] === ',' && depth === 0) {
      parts.push(inner.slice(from, i));
      from = i + 1;
    }
  }
  parts.push(inner.slice(from));
  return parts;
}

function px(value: string, viewport: number, open: boolean): number {
  const text = value.trim();
  if (text.startsWith('calc(')) {
    const inner = text.slice(5, -1);
    const split = /^(.+?)\s([+-])\s(.+)$/.exec(inner);
    if (!split) throw new Error(`cannot measure ${text}`);
    const left = px(split[1] as string, viewport, open);
    const right = px(split[3] as string, viewport, open);
    return split[2] === '+' ? left + right : left - right;
  }
  if (text.startsWith('min(')) {
    return Math.min(...commas(text.slice(4, -1)).map((part) => px(part, viewport, open)));
  }
  if (text.startsWith('max(')) {
    return Math.max(...commas(text.slice(4, -1)).map((part) => px(part, viewport, open)));
  }
  const variable = /^var\(\s*(--[\w-]+)\s*\)$/.exec(text);
  if (variable) {
    const found = custom(variable[1] as string, viewport, open);
    if (found === null) throw new Error(`no value for ${text}`);
    return px(found, viewport, open);
  }
  if (/^-?[\d.]+px$/.test(text)) return Number.parseFloat(text);
  if (/^-?[\d.]+vw$/.test(text)) return (Number.parseFloat(text) / 100) * viewport;
  if (/^-?[\d.]+$/.test(text)) return Number.parseFloat(text);
  throw new Error(`cannot measure ${text}`);
}

describe('the workspace reflows at every width it declares', () => {
  test('the reflow sheet declares exactly the breakpoints this suite holds', () => {
    const declaredWidths = blocksIn(CSS.reflow)
      .map((block) => block.ceiling)
      .filter((ceiling): ceiling is number => ceiling !== null);

    expect(declaredWidths).toEqual([...BREAKPOINTS]);
  });

  test('the cascade this suite reads is the order the screen imports the sheets in', () => {
    const imported = [
      ...read('src/ui/workspace/Workspace.tsx').matchAll(
        /import '\.\.\/styles\/workspace\/([\w-]+)\.css'/g,
      ),
    ].map((match) => match[1]);

    expect(imported).toEqual([...SHEETS]);
  });

  test('COMPACT_QUERY names the same width as the block that folds the screen down', () => {
    const compact = blocksIn(CSS.reflow).find((block) =>
      block.body.includes(`${OPEN} .work-order`),
    );
    const named = /(\d+)px/.exec(COMPACT_QUERY)?.[1];

    expect(['the query carries a width', named !== undefined]).toEqual([
      'the query carries a width',
      true,
    ]);
    expect(['compact block width', compact?.ceiling]).toEqual([
      'compact block width',
      Number(named),
    ]);
  });
});

const COMPACT = Number(/(\d+)px/.exec(COMPACT_QUERY)?.[1] ?? 0);

const FOLDED_DOWN = BREAKPOINTS.filter((width) => width <= COMPACT);

const PUSHED_ASIDE = [
  ['the work order', '.work-order'],
  ['the telemetry panel', '.telemetry'],
  ['the transport deck', '.transport-deck'],
] as const;

describe('an open drawer is never covered by the HUD', () => {
  test('the compact widths are a set this suite actually visits', () => {
    expect(FOLDED_DOWN.length).toBeGreaterThan(0);
  });

  for (const width of FOLDED_DOWN) {
    for (const [name, selector] of PUSHED_ASIDE) {
      test(`${name} translates out of the drawer's way at ${String(width)}px`, () => {
        const transform = resolve(`${OPEN} ${selector}`, 'transform', width);
        const moved =
          transform !== null &&
          /\btranslate[XY]?\(/.test(transform) &&
          !/\btranslate[XY]?\(\s*0(?:px|%)?\s*\)/.test(transform);

        expect([`${name} at ${String(width)}px`, transform ?? 'no transform']).toEqual([
          `${name} at ${String(width)}px`,
          moved ? transform : 'a transform that moves it clear',
        ]);
      });
    }
  }
});

const FLAPS = [
  ['the workbench flap', '.drawer-handle'],
  ['the subroutines flap', '.library-handle'],
] as const;

const RIDE = 'translateX(var(--ws-handle-x))';

describe('the flaps stay reachable', () => {
  for (const [name, selector] of FLAPS) {
    test(`${name} is pinned to the viewport and rides the one edge the flyout has`, () => {
      expect(['position', resolve(selector, 'position', ROOMY)]).toEqual(['position', 'fixed']);
      expect(['left', resolve(selector, 'left', ROOMY)]).toEqual(['left', '0']);
      expect(['transform', resolve(selector, 'transform', ROOMY)]).toEqual(['transform', RIDE]);
    });
  }

  for (const width of [ROOMY, ...BREAKPOINTS]) {
    for (const [name, selector] of FLAPS) {
      test(`an open flyout leaves ${name} on screen at ${String(width)}px`, () => {
        const offset = px(custom('--ws-handle-x', width, true) ?? '0px', width, true);
        const box = {
          w: px(resolve(selector, 'width', width) ?? '0px', width, true),
          h: px(resolve(selector, 'height', width) ?? '0px', width, true),
        };

        expect([`${name} box at ${String(width)}px`, box.w > 0 && box.h > 0]).toEqual([
          `${name} box at ${String(width)}px`,
          true,
        ]);
        expect([
          `${name} right edge at ${String(width)}px`,
          offset > 0 && offset + box.w <= width,
        ]).toEqual([`${name} right edge at ${String(width)}px`, true]);
      });

      test(`a shut flyout leaves ${name} on screen at ${String(width)}px`, () => {
        const offset = px(custom('--ws-handle-x', width, false) ?? '0px', width, false);
        const flap = px(resolve(selector, 'width', width) ?? '0px', width, false);

        expect([`${name} at ${String(width)}px`, offset >= 0 && offset + flap <= width]).toEqual([
          `${name} at ${String(width)}px`,
          true,
        ]);
      });
    }
  }
});

// The deck used to reflow for the workbench and not for lib.ts, which left lib.ts standing on
// top of the scrubber. One open state and one width is what makes that unstateable.
describe('an open flyout never stands on the transport deck', () => {
  test('the deck is pushed by the flyout own width rather than by a fixed number', () => {
    expect(['--ws-shift while open', resolve(OPEN, '--ws-shift', ROOMY)]).toEqual([
      '--ws-shift while open',
      'var(--ws-flyout)',
    ]);
  });

  for (const width of [ROOMY, ...BREAKPOINTS]) {
    test(`the deck starts past the flyout edge at ${String(width)}px`, () => {
      const flyout = px(custom('--ws-flyout', width, true) ?? '0px', width, true);
      const left = px(resolve('.workspace .transport-deck', 'left', width) ?? '0px', width, true);
      const folded = resolve(`${OPEN} .transport-deck`, 'transform', width);
      const clear = left >= flyout || (folded !== null && /\btranslateY?\(/.test(folded));

      expect([`deck at ${String(width)}px`, clear]).toEqual([`deck at ${String(width)}px`, true]);
    });
  }
});

const HIDDEN_BY = [
  ['display: none', /(?:^|;)\s*display:\s*none/],
  ['visibility: hidden', /(?:^|;)\s*visibility:\s*hidden/],
  ['opacity: 0', /(?:^|;)\s*opacity:\s*0(?![.\d])/],
  ['width: 0', /(?:^|;)\s*width:\s*0(?![.\d])/],
  ['height: 0', /(?:^|;)\s*height:\s*0(?![.\d])/],
] as const;

// The compact block folds the work order's own body away behind its Order button; the map is
// not among the children it collapses.
const FOLDED_AWAY_AT_COMPACT = [
  "reflow @900 .work-order[data-open='false'] .work-order__head",
  "reflow @900 .work-order[data-open='false'] .work-order__objectives",
  "reflow @900 .work-order[data-open='false'] .stat-grid",
] as const;

const carriesTheMap = (selector: string): boolean => {
  const last = selector.split(' ').at(-1) ?? '';
  return /^(?:\.workspace(?:\[[^\]]*\])?|\.workspace__map|#board|canvas)$/.test(last);
};

const where = (rule: Rule): string =>
  `${rule.sheet} @${rule.ceiling === null ? 'any' : String(rule.ceiling)} ${rule.selector}`;

describe('the map is never taken off the screen', () => {
  for (const [name, pattern] of HIDDEN_BY) {
    test(`no rule sets ${name} on the map, its canvas or the screen around them`, () => {
      const offenders = RULES.filter(
        (rule) => carriesTheMap(rule.selector) && pattern.test(rule.body),
      ).map(where);

      expect(offenders).toEqual([]);
    });
  }

  test('the only display: none in the promoted sheets is the folded-away work order', () => {
    const hidden = RULES.filter((rule) => HIDDEN_BY[0][1].test(rule.body)).map(where);

    expect(hidden).toEqual([...FOLDED_AWAY_AT_COMPACT]);
  });

  test('the map is a full-bleed layer underneath every overlay', () => {
    expect(['map position', resolve('.workspace__map', 'position', ROOMY)]).toEqual([
      'map position',
      'absolute',
    ]);
    expect(['map inset', resolve('.workspace__map', 'inset', ROOMY)]).toEqual(['map inset', '0']);

    const mapLayer = Number(resolve('.workspace__map', 'z-index', ROOMY));
    const over = [
      ['the overlay panels', '.overlay-panel'],
      ['the flyout', '.flyout'],
      ['the workbench flap', '.drawer-handle'],
      ['the subroutines flap', '.library-handle'],
      ['the run report', '.report-sheet'],
      ['the postings', '.postings'],
      ['the closing banner', '.closed-banner'],
    ] as const;

    for (const [name, selector] of over) {
      const layer = Number(resolve(selector, 'z-index', ROOMY));
      expect([`${name} sits over the map`, layer > mapLayer]).toEqual([
        `${name} sits over the map`,
        true,
      ]);
    }
  });
});
