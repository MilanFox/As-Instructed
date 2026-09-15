import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const read = (path: string): string =>
  readFileSync(new URL(`../../../../${path}`, import.meta.url), 'utf8');

const WORKSPACE = read('src/ui/workspace/Workspace.tsx');
const DRAWER = read('src/ui/workspace/Drawer.tsx');

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

interface Rule {
  sheet: string;
  ceiling: number | null;
  selector: string;
  body: string;
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

function rulesIn(css: string, sheet: string, ceiling: number | null = null): Rule[] {
  const bare = ceiling === null ? css.replace(/\/\*[\s\S]*?\*\//g, '') : css;
  const found: Rule[] = [];
  let i = 0;
  while (i < bare.length) {
    const open = bare.indexOf('{', i);
    if (open === -1) break;
    const end = closingBrace(bare, open);
    const prelude = bare.slice(i, open).trim();
    const body = bare.slice(open + 1, end);
    if (prelude.startsWith('@media')) {
      const width = /width\s*<=\s*(\d+)px|max-width:\s*(\d+)px/.exec(prelude);
      found.push(...rulesIn(body, sheet, Number(width?.[1] ?? width?.[2] ?? 0)));
    } else if (!prelude.startsWith('@')) {
      for (const each of prelude.split(',')) {
        const selector = each.trim().replace(/\s+/g, ' ');
        if (selector) found.push({ sheet, ceiling, selector, body });
      }
    }
    i = end + 1;
  }
  return found;
}

const RULES: Rule[] = SHEETS.flatMap((sheet) =>
  rulesIn(read(`src/ui/styles/workspace/${sheet}.css`), sheet),
);

function declared(selector: string, property: string): string | null {
  let value: string | null = null;
  for (const rule of RULES) {
    if (rule.selector !== selector) continue;
    const hits = [
      ...rule.body.matchAll(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;}]+)`, 'g')),
    ];
    const found = hits.at(-1)?.[1]?.trim();
    if (found !== undefined) value = found;
  }
  return value;
}

const QUOTES = new Set(["'", '"', '`']);

function skipLiteral(source: string, at: number): number {
  const quote = source[at];
  if (quote !== undefined && QUOTES.has(quote)) {
    let i = at + 1;
    while (i < source.length) {
      if (source[i] === '\\') i += 2;
      else if (source[i] === quote) return i + 1;
      else i += 1;
    }
    return source.length;
  }
  if (source.startsWith('//', at)) {
    const end = source.indexOf('\n', at);
    return end === -1 ? source.length : end;
  }
  if (source.startsWith('/*', at)) {
    const end = source.indexOf('*/', at);
    return end === -1 ? source.length : end + 2;
  }
  return at;
}

function functionBody(source: string, name: string): string {
  const at = source.search(new RegExp(`function\\s+${name}\\s*\\(`));
  if (at === -1) throw new Error(`no function ${name}`);
  let depth = 0;
  let i = source.indexOf('(', at);
  for (; i < source.length; i++) {
    if (source[i] === '(') depth += 1;
    else if (source[i] === ')') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  const brace = source.indexOf('{', i);
  return source.slice(brace + 1, closingBrace(source, brace));
}

interface Standing {
  tags: string[];
  wrappers: string[];
}

// Walks the JSX from the top of a component body down to one element, keeping the open tags
// and the open `{ … }` expressions it passes through.
function standingAt(body: string, needle: string): Standing {
  const returns = statementReturns(body);
  const root = body.indexOf('<', returns.at(-1) ?? 0);
  if (root === -1) throw new Error('no JSX in the body');
  const target = body.indexOf(needle, root);
  if (target === -1) throw new Error(`no ${needle} in the returned tree`);
  const tags: string[] = [];
  const braces: number[] = [];
  let i = root;
  while (i < target) {
    const skipped = skipLiteral(body, i);
    if (skipped !== i) {
      i = skipped;
      continue;
    }
    const here = body[i];
    if (here === '{') {
      braces.push(i);
      i += 1;
      continue;
    }
    if (here === '}') {
      braces.pop();
      i += 1;
      continue;
    }
    if (here === '<' && body[i + 1] === '/') {
      tags.pop();
      i = body.indexOf('>', i) + 1;
      continue;
    }
    const opening = /^<([A-Za-z][\w.]*)/.exec(body.slice(i, i + 40));
    if (here === '<' && opening) {
      let j = i + (opening[0] as string).length;
      let depth = 0;
      for (; j < body.length; j++) {
        const jumped = skipLiteral(body, j);
        if (jumped !== j) {
          j = jumped - 1;
          continue;
        }
        if (body[j] === '{') depth += 1;
        else if (body[j] === '}') depth -= 1;
        else if (body[j] === '>' && depth === 0) break;
      }
      if (body[j - 1] !== '/') tags.push(opening[1] as string);
      i = j + 1;
      continue;
    }
    i += 1;
  }
  return {
    tags,
    wrappers: braces.map((open) => body.slice(open + 1, target)),
  };
}

function conditionalsAround(standing: Standing): string[] {
  return standing.wrappers
    .map((text) => {
      let bare = '';
      let i = 0;
      while (i < text.length) {
        const skipped = skipLiteral(text, i);
        if (skipped !== i) {
          i = skipped;
          continue;
        }
        bare += text[i];
        i += 1;
      }
      const ternary = /\?(?![.?])/.test(bare);
      const guard = bare.includes('&&');
      if (!ternary && !guard) return '';
      return bare.trim().split('\n')[0]?.trim() ?? 'a conditional';
    })
    .filter((each) => each !== '');
}

function statementReturns(body: string): number[] {
  let depth = 0;
  const found: number[] = [];
  let i = 0;
  while (i < body.length) {
    const skipped = skipLiteral(body, i);
    if (skipped !== i) {
      i = skipped;
      continue;
    }
    const here = body[i];
    if (here === '{') depth += 1;
    else if (here === '}') depth -= 1;
    else if (depth === 0 && body.startsWith('return', i) && !/[\w$]/.test(body[i - 1] ?? ' ')) {
      found.push(i);
    }
    i += 1;
  }
  return found;
}

const countOf = (source: string, tag: string): number =>
  (source.match(new RegExp(`<${tag}\\b`, 'g')) ?? []).length;

describe('the feed canvas is hidden, never unmounted', () => {
  const body = functionBody(WORKSPACE, 'Workspace');
  const standing = standingAt(body, '<FeedCanvas');

  test('the screen renders the feed canvas exactly once', () => {
    expect(['<FeedCanvas> in Workspace.tsx', countOf(WORKSPACE, 'FeedCanvas')]).toEqual([
      '<FeedCanvas> in Workspace.tsx',
      1,
    ]);
  });

  test('no conditional stands between the feed canvas and the screen root', () => {
    expect(conditionalsAround(standing)).toEqual([]);
  });

  test('the feed canvas is outside every panel boundary, so a trip cannot unmount it', () => {
    expect(['tags above <FeedCanvas>', standing.tags.includes('PanelBoundary')]).toEqual([
      'tags above <FeedCanvas>',
      false,
    ]);
    expect(standing.tags).toEqual(['div', 'div']);
  });

  test('the screen has a single return, so no early one can skip the feed canvas', () => {
    expect(['statement returns in Workspace', statementReturns(body).length]).toEqual([
      'statement returns in Workspace',
      1,
    ]);
  });

  test('the map is a full-bleed layer and the HUD is drawn over it', () => {
    expect(['map position', declared('.workspace__map', 'position')]).toEqual([
      'map position',
      'absolute',
    ]);
    expect(['map inset', declared('.workspace__map', 'inset')]).toEqual(['map inset', '0']);

    const map = Number(declared('.workspace__map', 'z-index'));
    const panels = Number(declared('.overlay-panel', 'z-index'));
    expect(['map under the overlay panels', map < panels]).toEqual([
      'map under the overlay panels',
      true,
    ]);
  });
});

describe('Monaco keeps a box it can lay out into', () => {
  const body = functionBody(DRAWER, 'Drawer');
  const standing = standingAt(body, '<CodeEditor');

  test('the drawer renders the editor exactly once', () => {
    expect(['<CodeEditor> in Drawer.tsx', countOf(DRAWER, 'CodeEditor')]).toEqual([
      '<CodeEditor> in Drawer.tsx',
      1,
    ]);
  });

  test('the editor is gated on neither the drawer being open nor the active tab', () => {
    expect(conditionalsAround(standing)).toEqual([]);
    expect(['statement returns in Drawer', statementReturns(body).length]).toEqual([
      'statement returns in Drawer',
      1,
    ]);
  });

  test('the screen renders the drawer unconditionally', () => {
    const screen = functionBody(WORKSPACE, 'Workspace');
    expect(['<Drawer> in Workspace.tsx', countOf(WORKSPACE, 'Drawer')]).toEqual([
      '<Drawer> in Workspace.tsx',
      1,
    ]);
    expect(conditionalsAround(standingAt(screen, '<Drawer'))).toEqual([]);
  });

  test('the editor page carries both of the classes its box is built from', () => {
    expect(['the code page', DRAWER.includes('className="drawer-page drawer-page--code"')]).toEqual(
      ['the code page', true],
    );
  });

  const CHAIN = [
    ['.drawer', 'min-height'],
    ['.drawer__stack', 'min-height'],
    ['.drawer-page', 'min-height'],
  ] as const;

  for (const [selector, property] of CHAIN) {
    test(`${selector} carries ${property}: 0, so the chain can shrink without collapsing`, () => {
      expect([`${selector} ${property}`, declared(selector, property)]).toEqual([
        `${selector} ${property}`,
        '0',
      ]);
    });
  }

  test('the drawer is pinned top and bottom, so its height is definite', () => {
    expect(['drawer position', declared('.drawer', 'position')]).toEqual([
      'drawer position',
      'fixed',
    ]);
    expect(['drawer top', declared('.drawer', 'top')]).toEqual(['drawer top', '0']);
    expect(['drawer bottom', declared('.drawer', 'bottom')]).toEqual(['drawer bottom', '0']);
  });

  test('the page fills the stack, so the editor inherits a definite height', () => {
    expect(['stack flex', declared('.drawer__stack', 'flex')]).toEqual(['stack flex', '1 1 auto']);
    expect(['page position', declared('.drawer-page', 'position')]).toEqual([
      'page position',
      'absolute',
    ]);
    expect(['page inset', declared('.drawer-page', 'inset')]).toEqual(['page inset', '0']);
  });
});

const NEVER_UNBOXED = ['.drawer', '.drawer__stack', '.drawer-page'] as const;

const UNBOXING = [
  ['display: none', /(?:^|;)\s*display:\s*none/],
  ['visibility: hidden', /(?:^|;)\s*visibility:\s*hidden/],
] as const;

describe('a shut drawer is moved, not taken out of the layout', () => {
  for (const [name, pattern] of UNBOXING) {
    test(`no rule sets ${name} on the drawer, its stack or any of its pages`, () => {
      const offenders = RULES.filter((rule) => {
        const touches = NEVER_UNBOXED.some((base) =>
          new RegExp(`${base.replace('.', '\\.')}(?:--[\\w-]+)?(?:\\[[^\\]]*\\])?$`).test(
            rule.selector.split(' ').at(-1) ?? '',
          ),
        );
        return touches && pattern.test(rule.body);
      }).map(
        (rule) =>
          `${rule.sheet} @${rule.ceiling === null ? 'any' : String(rule.ceiling)} ${rule.selector}`,
      );

      expect(offenders).toEqual([]);
    });
  }

  test('the shut drawer is only slid off the edge', () => {
    expect(['drawer transform', declared('.drawer', 'transform')]).toEqual([
      'drawer transform',
      'translateX(-100%)',
    ]);
    expect([
      'open drawer transform',
      declared(".workspace[data-drawer='open'] .drawer", 'transform'),
    ]).toEqual(['open drawer transform', 'translateX(0)']);
  });

  test('a page that is not the one on top is faded, not removed', () => {
    expect([
      'hidden read page opacity',
      declared(".drawer-page--read[data-on='false']", 'opacity'),
    ]).toEqual(['hidden read page opacity', '0']);
    expect([
      'hidden read page display',
      declared(".drawer-page--read[data-on='false']", 'display'),
    ]).toEqual(['hidden read page display', null]);
  });
});

const WRAPPED_FIXTURE = `
function Screen(): React.ReactElement {
  const [open, setOpen] = useState<Tab>('program');
  if (!open) return <span />;
  return (
    <div className="workspace">
      {open ? (
        <PanelBoundary label="The feed">
          <div className="workspace__map">
            <FeedCanvas onReadout={setOpen} />
          </div>
        </PanelBoundary>
      ) : null}
    </div>
  );
}
`;

describe('the scan that holds those two facts can see a wrapper when there is one', () => {
  const body = functionBody(WRAPPED_FIXTURE, 'Screen');
  const standing = standingAt(body, '<FeedCanvas');

  test('a ternary above the element is reported', () => {
    expect(conditionalsAround(standing).length).toBe(1);
  });

  test('a boundary above the element is reported', () => {
    expect(standing.tags).toEqual(['div', 'PanelBoundary', 'div']);
  });

  test('an early return is counted as a second statement return', () => {
    expect(statementReturns(body).length).toBe(2);
  });
});
