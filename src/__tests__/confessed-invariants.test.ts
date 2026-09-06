/**
 * The comments that admit a duplicate, turned into tests.
 *
 * This codebase has an unusually good habit: where one value is written down twice, the second
 * copy usually says so — "mirrors `src/game/store.ts`", "verbatim from NARRATIVE.md §7", "the one
 * authoritative copy". `docs/AUDIT-CONSTANTS.md` found that grepping for those three words returns
 * a free, accurate index of exactly where the two-sources-of-truth bug class lives in this repo,
 * and that nobody had ever read it. Five of that audit's nine findings are in the index.
 *
 * So the index is the guard. Every hit has to be registered below, and every registration has to
 * name the test that holds it. Three dispositions are allowed and no fourth:
 *
 *  - **`guard: <test name>`** — a test in this file asserts the two copies agree.
 *  - **`guard: PROSE`** — the word is being used in its ordinary English sense and nothing is
 *    duplicated. "Safe to render verbatim" means *render it as-is*. These are the entries that
 *    made the index unreadable, and the fix for one is to reword the comment, not to guard it.
 *    A `PROSE` entry is a comment somebody has not got to yet.
 *  - **`guard: <a reason>`** — a real invariant that resists mechanical checking, with the reason
 *    written out. `Renderer.seek` and `Conductor.seek` duplicate an *algorithm*; there is no
 *    literal to compare.
 *
 * The registry is exact in both directions. A new confession fails until it is registered, and a
 * deleted one fails until it is unregistered, so the list cannot rot into a list of things that
 * used to be true.
 *
 * **What this does not cover.** Only the duplicates that confess. `docs/AUDIT-CONSTANTS.md` §3 —
 * the silver rule, wrong in three places at once on a shipping build — was never confessed by any
 * comment, and `silverRule` below had to be written against the rule's two halves rather than
 * against the index. A duplicate that says nothing is still invisible to this file.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { DEFAULT_LAYOUT } from '../game/save.ts';
import { REVIEW_TIERS } from '../game/score.ts';
import { Camera } from '../render/camera.ts';
import { DIRECTIONS } from '../render/theme.ts';
import { effectiveLayout } from '../ui/hooks/useWorkspaceLayout.ts';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SRC = join(ROOT, 'src');

const CONFESSION = /verbatim|mirrors|authoritative/i;
const SCANNED = /\.(ts|tsx|css)$/;

/** This file quotes every confession in the repo, so scanning it would find all of them twice. */
const SELF = 'src/__tests__/confessed-invariants.test.ts';

interface Confession {
  /** Repo-relative, POSIX separators. */
  file: string;
  /** A distinctive slice of the confessing line, matched as a substring. */
  says: string;
  guard: string;
}

const PROSE = 'PROSE';

const REGISTRY: readonly Confession[] = [
  // --- Class A: a real duplicated value, held by a test below. ---
  {
    file: 'src/game/score.ts',
    says: 'verbatim from NARRATIVE.md §7',
    guard: 'REVIEW_TIERS reproduces NARRATIVE.md §7',
  },
  {
    file: 'src/ui/screens/ReviewMemo.tsx',
    says: 'NARRATIVE.md §7 verbatim and live in `REVIEW_TIERS`',
    guard: 'REVIEW_TIERS reproduces NARRATIVE.md §7',
  },
  {
    file: 'src/ui/screens/Results.tsx',
    says: 'the renderer mirrors it',
    guard: 'a constant declared in two files has one value',
  },
  {
    file: 'src/audio/conductor.ts',
    says: 'Mirrors `src/game/store.ts`',
    guard: 'a constant declared in two files has one value',
  },
  {
    file: 'src/render/art/standard.ts',
    says: 'lifted verbatim from the old frozen records',
    guard: 'the palette is the same twelve colours everywhere it is written down',
  },
  {
    file: 'src/game/ports.ts',
    says: 'Mirrors `CelebrationKind` in `src/render/renderer.ts`',
    guard: 'CelebrationKind is spelled the same on both sides of the port',
  },
  {
    file: 'src/engine/verdict.ts',
    says: 'The one authoritative copy',
    guard: 'a constant that claims to be the only copy is the only copy',
  },
  {
    file: 'src/engine/sim.ts',
    says: '`FUEL_BURNING` in trace.ts mirrors this',
    guard: 'a constant that claims to be the only copy is the only copy',
  },

  // --- Class B: ordinary English. Reword, do not guard. ---
  {
    file: 'src/render/renderer.ts',
    says: 'Mirrors `settings.celebrations`. Default true',
    guard: PROSE,
  },
  {
    file: 'src/render/renderer.ts',
    says: 'Mirrors `settings.celebrations`. False makes',
    guard: PROSE,
  },
  { file: 'src/game/store.ts', says: 'the shell mirrors its position', guard: PROSE },

  // --- Class C: a real invariant with no literal to compare. ---
  {
    file: 'src/audio/conductor.ts',
    says: 'Mirrors `Renderer.seek`',
    guard:
      'Duplicates the step-past-the-playhead algorithm, not a value. Comparing it mechanically ' +
      'would mean running both seeks over the same trace, which needs a renderer and a canvas.',
  },
  {
    file: 'src/meta/copy.ts',
    says: 'Given verbatim in the brief',
    guard: 'The brief is not a file in this repo, so there is nothing to diff the line against.',
  },
  {
    file: 'src/levels/__tests__/finale.test.ts',
    says: 'verbatim in shape',
    guard: 'Says "in shape" — it is the playtester\'s approach rewritten, not their keystrokes.',
  },
];

// ---------------------------------------------------------------------------
// The index itself
// ---------------------------------------------------------------------------

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (SCANNED.test(entry.name)) out.push(full);
  }
  return out;
}

function repoPath(full: string): string {
  return relative(ROOT, full).split(sep).join('/');
}

function read(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}

interface Hit {
  file: string;
  line: string;
}

function confessions(): Hit[] {
  const hits: Hit[] = [];
  for (const full of sourceFiles(SRC)) {
    const file = repoPath(full);
    if (file === SELF) continue;
    for (const line of readFileSync(full, 'utf8').split('\n')) {
      if (CONFESSION.test(line)) hits.push({ file, line: line.trim() });
    }
  }
  return hits;
}

describe('the confessed-invariant index', () => {
  test('every confession in src/ is registered', () => {
    const unregistered = confessions().filter(
      (hit) => !REGISTRY.some((entry) => entry.file === hit.file && hit.line.includes(entry.says)),
    );
    expect(unregistered).toEqual([]);
  });

  test('every registration still confesses something', () => {
    const hits = confessions();
    const stale = REGISTRY.filter(
      (entry) => !hits.some((hit) => hit.file === entry.file && hit.line.includes(entry.says)),
    );
    expect(stale.map((entry) => `${entry.file}: ${entry.says}`)).toEqual([]);
  });

  test('every registration names a guard or says why it has none', () => {
    for (const entry of REGISTRY) {
      expect([entry.file, entry.guard.length > 3]).toEqual([entry.file, true]);
    }
  });
});

// ---------------------------------------------------------------------------
// Class A guards
// ---------------------------------------------------------------------------

/**
 * `REVIEW_TIERS` is the Performance Review memo the player is shown; NARRATIVE.md §7 is where the
 * writers edit it. The pair has drifted once already — `7b7acd5` fixed one sentence of tier 5 that
 * had been wrong in the code since it was written, and it was found by a human reading, because
 * the suite asserts grades and ranks and not one character of the prose that is the whole drift
 * surface.
 */
function narrativeTiers(): {
  rank: number;
  grade: string;
  min: number;
  body: string;
  dot: string;
  legal: string[];
}[] {
  const narrative = read('docs/NARRATIVE.md');
  const section = narrative.slice(
    narrative.indexOf('## 7. The Performance Review Memo'),
    narrative.indexOf('## 8. Glossary'),
  );
  const heading = /### Tier (\d) — ([^·]+)· "([^"]+)"\s*```\n([\s\S]*?)```\s*((?:>[^\n]*\n)*)/g;
  const tiers = [];
  for (const found of section.matchAll(heading)) {
    const [, rank, band, grade, block, quoted] = found as unknown as string[];
    const lines = (block as string).split('\n');
    const graded = lines.findIndex((line) => line.startsWith('GRADE:'));
    const body = lines
      .slice(graded + 1)
      .join('\n')
      .trim()
      .split(/\n\s*\n/)
      .map((paragraph) =>
        paragraph
          .split('\n')
          .map((line) => line.trim())
          .join(' '),
      )
      .join('\n\n');
    const asides = (quoted as string)
      .split('\n')
      .filter((line) => line.startsWith('>'))
      .map((line) => line.replace(/^>\s*/, ''));
    const dot = (asides.find((line) => line.startsWith('dot:')) ?? '').replace(/^dot:\s*/, '');
    const legal = asides
      .filter((line) => !line.startsWith('dot:'))
      .map((line) => line.replace(/^[\u2070-\u209f\u00b9\u00b2\u00b3]+\s*/, ''));
    tiers.push({
      rank: Number(rank),
      grade: grade as string,
      min: Number(/\d+/.exec(band as string)?.[0]),
      body,
      dot,
      legal,
    });
  }
  return tiers;
}

test('REVIEW_TIERS reproduces NARRATIVE.md §7', () => {
  const doc = narrativeTiers();
  expect(doc.length).toBe(REVIEW_TIERS.length);
  expect(doc.length).toBeGreaterThan(0);
  for (const [index, tier] of REVIEW_TIERS.entries()) {
    const written = doc[index];
    expect([tier.grade, 'rank', written?.rank]).toEqual([tier.grade, 'rank', tier.rank]);
    expect([tier.grade, 'grade', written?.grade]).toEqual([tier.grade, 'grade', tier.grade]);
    expect([tier.grade, 'min', written?.min]).toEqual([tier.grade, 'min', tier.min]);
    expect([tier.grade, 'body', written?.body]).toEqual([tier.grade, 'body', tier.body]);
    expect([tier.grade, 'dot', written?.dot]).toEqual([tier.grade, 'dot', tier.dot]);
    expect([tier.grade, 'legal', written?.legal]).toEqual([tier.grade, 'legal', tier.legal ?? []]);
  }
});

/**
 * `MEDAL_BEAT` and `BASE_TICKS_PER_SECOND` are each written down twice, in modules that must not
 * import each other — `src/render/` may not depend on `src/audio/`, and the conductor needs a
 * ticks-per-second before the store has told it one. Both duplications are admitted in a comment,
 * and `renderer.ts:107` goes as far as calling `MEDAL_BEAT` "the one number the two must agree
 * on". A layering rule that forbids an import does not forbid a test from reading both files.
 *
 * The sweep only considers a name once **some** module exports it, because that is what makes a
 * name a shared source of truth rather than a local. Every level file declares its own private
 * `WIDTH`, `HEIGHT` and `PAR_TICKS`, and those have no business agreeing across levels — a sweep
 * that flagged them would be turned off within a day. The cost of the rule is that two private
 * constants of the same name are invisible to it, so the two the comments actually name are also
 * asserted by name below.
 */
test('a constant declared in two files has one value', () => {
  const declaration = /^\s*(export\s+)?const ([A-Z][A-Z0-9_]*) = (-?\d+(?:\.\d+)?);/gm;
  const byName = new Map<string, Map<string, string>>();
  const exported = new Set<string>();
  for (const full of sourceFiles(SRC)) {
    if (!/\.tsx?$/.test(full)) continue;
    const file = repoPath(full);
    for (const [, exports, name, value] of readFileSync(full, 'utf8').matchAll(declaration)) {
      if (exports) exported.add(name as string);
      const seen = byName.get(name as string) ?? new Map<string, string>();
      seen.set(file, value as string);
      byName.set(name as string, seen);
    }
  }

  const disagreeing = [...byName]
    .filter(([name, seen]) => exported.has(name) && new Set(seen.values()).size > 1)
    .map(([name, seen]) => `${name}: ${[...seen].map(([f, v]) => `${f}=${v}`).join(', ')}`);
  expect(disagreeing).toEqual([]);

  /* The two the comments name, asserted by name as well as by the sweep: a rename would take them
     out of the sweep silently, and the sweep passing over an empty set proves nothing. */
  for (const name of ['MEDAL_BEAT', 'BASE_TICKS_PER_SECOND']) {
    expect([name, byName.get(name)?.size]).toEqual([name, 2]);
  }
});

/**
 * The rule the whole game is scored on, in the four places it is written out in prose.
 *
 * `docs/FIX-PAR.md` §7 widened the silver band to `max(par + 1, par * 1.25)` so a par below four
 * still has a reachable rung. The amendment landed in `medalFor` and in nothing else, so DESIGN.md
 * §7, the function's own docstring and the docs panel the player reads in-game all went on stating
 * the bare multiplier — on a build shipping two levels with a par under four, which meant the game
 * documented a medal it hands out. Every stale copy failed the same way: it named the multiplier
 * and not the floor. So that is what is checked, in both directions, everywhere the rule is
 * spelled out for a human.
 */
test('every prose copy of the silver rule states both halves of it', () => {
  const multiplier = /1\.25|SILVER_FACTOR|quarter/i;
  const floor = /par \+ 1|parTicks \+ 1|one tick/i;

  const verdict = read('src/engine/verdict.ts');
  const docstring = verdict.slice(0, verdict.indexOf('export function medalFor'));
  const copies: [string, string][] = [
    ['src/engine/verdict.ts medalFor()', docstring.slice(docstring.lastIndexOf('/**'))],
    [
      'docs/DESIGN.md §7',
      (() => {
        const design = read('docs/DESIGN.md');
        const start = design.indexOf('**Medals are ticks-only.**');
        return design.slice(start, design.indexOf('\n\n', start));
      })(),
    ],
    [
      'src/ui/panels/DocsPanel.tsx',
      read('src/ui/panels/DocsPanel.tsx')
        .split('\n')
        .filter((line) => /silver/i.test(line))
        .join('\n'),
    ],
    /*
     * The fourth copy, and the one this guard was written to catch: `medalThresholds` is what the
     * Refactor screen projects a "silver to gold" rung from, so a copy of the rule that drops the
     * floor offers the player a rung the engine does not award. It was live on `w6-01` (par 1) and
     * `w5-02` (par 2) and was carried here as a `KNOWN_OPEN` breach; `docs/FIX-DISCREPANCY.md` §5
     * fixed it, and it is now held to the same standard as the other three.
     */
    [
      'src/meta/profile.ts medalThresholds()',
      (() => {
        const profile = read('src/meta/profile.ts');
        const end = profile.indexOf('export function medalThresholds');
        return profile.slice(profile.lastIndexOf('/**', end), end);
      })(),
    ],
  ];

  for (const [where, text] of copies) {
    expect([where, 'found', text.length > 0]).toEqual([where, 'found', true]);
    expect([where, 'multiplier', multiplier.test(text)]).toEqual([where, 'multiplier', true]);
    expect([where, 'the par + 1 floor', floor.test(text)]).toEqual([
      where,
      'the par + 1 floor',
      true,
    ]);
  }
});

/**
 * A constant whose comment says it is the only one has to be the only one. `SILVER_FACTOR` earned
 * this the hard way: it was already a decorative duplicate of an inline `1.25` once, and
 * `FUEL_BURNING` is the one thing keeping a live run and its replay from disagreeing about fuel.
 */
test('a constant that claims to be the only copy is the only copy', () => {
  const expected: Record<string, string[]> = {
    SILVER_FACTOR: ['src/engine/verdict.ts'],
    FUEL_BURNING: ['src/engine/trace.ts'],
  };
  for (const [name, sites] of Object.entries(expected)) {
    const declaration = new RegExp(`^\\s*(?:export\\s+)?const ${name}\\b`, 'm');
    const found = sourceFiles(SRC)
      .filter((full) => /\.tsx?$/.test(full))
      .filter((full) => declaration.test(readFileSync(full, 'utf8')))
      .map(repoPath)
      .sort();
    expect([name, found]).toEqual([name, [...sites].sort()]);
  }
});

/**
 * Twelve colours, written down three times: `DESIGN.md` §8 is named as the place to change them
 * first, `tokens.css` is what the DOM renders, and the `standard` art direction is what Canvas2D
 * renders. The third copy is deliberate and the reason given for it is sound — Canvas2D cannot read
 * a CSS custom property without a layout round-trip per frame — but the trail, the bot colours and
 * the medal rings still have to match the panels and badges drawn around them.
 *
 * The direction registry moved the canvas copy out of `theme.ts` and into `art/standard.ts`, whose
 * own docstring says its values were lifted verbatim from the records that used to live there. That
 * is the copy this reads, by name rather than through `theme.ts`'s live binding: the other three
 * directions are *meant* to differ, they overwrite the tokens at runtime from their own palettes,
 * and which of the four ships as the default is not this test's business.
 */
test('the palette is the same twelve colours everywhere it is written down', () => {
  const tokens = read('src/ui/styles/tokens.css');
  const design = read('docs/DESIGN.md');
  const section = design.slice(design.indexOf('## 8. Visual Language'));

  const kebab = (key: string): string => `--${key.replace(/([A-Z0-9])/g, '-$1').toLowerCase()}`;
  const cssValue = (text: string, name: string): string | undefined =>
    new RegExp(`${name}:\\s*(#[0-9a-f]{3,8})`, 'i').exec(text)?.[1]?.toLowerCase();

  const baseline = DIRECTIONS.standard.palette;
  const keys = Object.keys(baseline);
  expect(keys.length).toBe(12);
  for (const key of keys) {
    const name = kebab(key);
    const canvas = baseline[key as keyof typeof baseline].toLowerCase();
    expect([name, 'tokens.css', cssValue(tokens, name)]).toEqual([name, 'tokens.css', canvas]);
    expect([name, 'DESIGN.md §8', cssValue(section, name)]).toEqual([name, 'DESIGN.md §8', canvas]);
  }
});

/**
 * `CelebrationKind` is spelled out in `src/game/ports.ts` rather than imported so the shell still
 * compiles against the ports alone. The two unions are the contract across that seam; a member
 * added to one and not the other is a flourish the renderer will never be asked for, or one it is
 * asked for and cannot draw.
 */
test('CelebrationKind is spelled the same on both sides of the port', () => {
  const union = (path: string): string[] => {
    const found = /export type CelebrationKind = ([^;]+);/.exec(read(path))?.[1];
    return (found ?? '').split('|').map((member) => member.trim());
  };
  const port = union('src/game/ports.ts');
  expect(port.length).toBeGreaterThan(1);
  expect(union('src/render/renderer.ts')).toEqual(port);
});

/**
 * The objective read-out against the board it floats over.
 *
 * This guard used to compare `HUD_GUTTER` against `.hud-card`'s width in `app.css` and say, in so
 * many words, that widening the card alone would put the read-out back over the grid. Both numbers
 * were 232, the guard was green, and the read-out was over the grid on `w1-01` — the game's first
 * work order — at the default split on a 1920px window. `docs/FIX-HUD-OVERLAP.md` has the numbers.
 *
 * The equality was never the mechanism. What put the card on the grid was the *reservation being a
 * preference*: it was discarded whenever `RIG_MIN` bound or the player dragged the splitter, and it
 * said nothing about where the camera actually drew the grid inside the space that was left. Two
 * rectangles, four independent variables, and a scalar comparison could not see any of them.
 *
 * So this asserts the property instead. Every workspace size, every grid shape the campaign ships
 * and every splitter position the player can reach, fitted with the real `Camera` — the zoom
 * ladder, the fit padding and the step-back-up rung all count — and the card's right edge is never
 * allowed past the grid's left edge. It is stated horizontally on purpose: how *tall* the card is
 * depends on how many objectives a level has and how their labels wrap, which is the variable that
 * made the bug read as "sometimes", and a guarantee that does not depend on it is a better one.
 */
/** Grid shapes at the extremes the campaign ships: a corridor, a slab, a square, a small room. */
const GRID_SHAPES: readonly (readonly [number, number])[] = [
  [30, 3],
  [22, 5],
  [25, 14],
  [14, 8],
  [5, 4],
  [30, 24],
  [48, 40],
  [40, 40],
];

/** Workspace boxes: window width, and window height less the top bar. */
const WORKSPACE_BOXES: readonly { width: number; height: number }[] = [
  { width: 1024, height: 600 },
  { width: 1280, height: 674 },
  { width: 1440, height: 854 },
  { width: 1680, height: 734 },
  { width: 1920, height: 726 },
  { width: 2560, height: 1394 },
];

/** Every splitter position the player can reach, plus the untouched default. */
const SPLITS = [DEFAULT_LAYOUT.editorFraction, 0.2, 0.3, 0.5, 0.58, 0.68];

test('the objective read-out is never over the drawn grid', () => {
  const failures: string[] = [];
  for (const box of WORKSPACE_BOXES) {
    for (const [cols, rows] of GRID_SHAPES) {
      for (const editorFraction of SPLITS) {
        for (const railOpen of [true, false]) {
          const layout = effectiveLayout(
            { ...DEFAULT_LAYOUT, editorFraction },
            box,
            cols / rows,
            railOpen,
          );
          const rig = box.width * layout.editorFraction;
          const canvasLeft = rig + layout.gutter;
          const camera = new Camera();
          camera.setViewport(Math.max(1, box.width - canvasLeft), box.height, 1);
          camera.setBounds({ cols, rows });
          camera.fit();
          const gridLeft = canvasLeft + camera.originX();
          const cardRight = rig + layout.cardInset + layout.cardWidth;
          if (cardRight > gridLeft) {
            failures.push(
              `${cols}x${rows} at ${box.width}x${box.height} split ${editorFraction} ` +
                `rail ${railOpen ? 'open' : 'shut'}: card ends at ${Math.round(cardRight)}, ` +
                `grid starts at ${Math.round(gridLeft)}`,
            );
          }
        }
      }
    }
  }
  expect(failures).toEqual([]);
});

/**
 * The other half: the stylesheet has to take the strip and the card from the layout rather than
 * from literals of its own. The geometry above is arithmetic on `WorkspaceLayout`, and it proves
 * nothing at all if `app.css` goes back to writing `232px` next to a canvas that fills its box.
 */
test('the stylesheet takes the strip and the card from the layout', () => {
  const css = read('src/ui/styles/app.css');
  const rule = (selector: string): string =>
    new RegExp(`\\${selector}\\s*\\{[^}]*\\}`).exec(css)?.[0] ?? '';

  const canvas = rule('.viewport__canvas');
  expect(['canvas inset', /margin-left:\s*var\(--hud-gutter/.test(canvas)]).toEqual([
    'canvas inset',
    true,
  ]);
  expect(['canvas width', /width:\s*calc\(100% - var\(--hud-gutter/.test(canvas)]).toEqual([
    'canvas width',
    true,
  ]);

  const card = rule('.hud-card');
  expect(['card width', /width:\s*var\(--hud-card-w/.test(card)]).toEqual(['card width', true]);
  expect(['card offset', /left:\s*calc\([^;]*var\(--hud-card-inset/.test(card)]).toEqual([
    'card offset',
    true,
  ]);

  const workspace = read('src/ui/Workspace.tsx');
  for (const property of ['--hud-gutter', '--hud-card-w', '--hud-card-inset']) {
    expect([property, workspace.includes(property)]).toEqual([property, true]);
  }
});
