/**
 * The site map's arithmetic on an ungraded work order (DESIGN.md §11 A7).
 *
 * Every case here failed against the running app before the fix, and each is one of the three
 * defects `docs/FIX-UNGRADED.md` measured live: the points reduce paid nothing for a close, the
 * at-par reckoning could never count one, and the accessible name announced it as unfinished.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { Medal, isGraded } from '../../../game/score.ts';
import { emptySave } from '../../../game/save.ts';
import type { SaveFile } from '../../../game/save.ts';
import { levelsByWorld } from '../../../levels/index.ts';
import { buildRows, campaignTally, nodeLabel } from '../LevelSelect.tsx';

const UNGRADED = 'w1-01';
const GRADED = 'w1-05';

function close(save: SaveFile, id: string, medal: Medal): SaveFile {
  save.levels[id] = { completed: true, medal, stars: [], attempts: 1 };
  return save;
}

function rowFor(save: SaveFile, world: number) {
  const row = buildRows(save).find((candidate) => candidate.world.id === world);
  if (!row) throw new Error(`no world ${world}`);
  return row;
}

function nodeFor(save: SaveFile, id: string) {
  const node = buildRows(save)
    .flatMap((row) => row.nodes)
    .find((candidate) => candidate.id === id);
  if (!node) throw new Error(`no work order ${id}`);
  return node;
}

describe('the fixture the browser was driven against', () => {
  test('world 1 holds two ungraded work orders and one graded', () => {
    const world = levelsByWorld().find((entry) => entry.world.id === 1);
    const graded = (world?.levels ?? []).filter((level) => isGraded(level)).map((l) => l.id);
    const ungraded = (world?.levels ?? []).filter((level) => !isGraded(level)).map((l) => l.id);
    expect(ungraded).toEqual(['w1-01', 'w1-03']);
    expect(graded).toEqual(['w1-05']);
  });
});

describe('an ungraded close is worth a gold', () => {
  test('closing both ungraded orders in Boot Sector pays six, not nothing', () => {
    const save = close(close(emptySave(), 'w1-01', Medal.None), 'w1-03', Medal.None);
    const row = rowFor(save, 1);
    expect(row.closed).toBe(2);
    expect(row.points).toBe(6);
  });

  test('an ungraded order still on the bench is paid nothing', () => {
    const row = rowFor(emptySave(), 1);
    expect(row.points).toBe(0);
  });

  test('the ceiling does not move — a close can reach it', () => {
    const save = close(
      close(close(emptySave(), 'w1-01', Medal.None), 'w1-03', Medal.None),
      GRADED,
      Medal.Gold,
    );
    const row = rowFor(save, 1);
    expect(row.points).toBe(9);
    expect(row.maxPoints).toBeGreaterThanOrEqual(9);
  });

  test('the campaign total carries the same six', () => {
    const save = close(close(emptySave(), 'w1-01', Medal.None), 'w1-03', Medal.None);
    expect(campaignTally(buildRows(save)).points).toBe(6);
  });
});

describe('ALL AT PAR is attainable in a world holding an ungraded order', () => {
  test('a sector of ungraded closes and a gold is perfect', () => {
    const save = close(
      close(close(emptySave(), 'w1-01', Medal.None), 'w1-03', Medal.None),
      GRADED,
      Medal.Gold,
    );
    const row = rowFor(save, 1);
    expect(row.complete).toBe(true);
    expect(row.perfect).toBe(true);
  });

  test('a silver on the one graded order still withholds the stamp', () => {
    const save = close(
      close(close(emptySave(), 'w1-01', Medal.None), 'w1-03', Medal.None),
      GRADED,
      Medal.Silver,
    );
    expect(rowFor(save, 1).perfect).toBe(false);
  });

  test('an ungraded order left open is not counted at par', () => {
    expect(rowFor(emptySave(), 1).gold).toBe(0);
    expect(rowFor(close(emptySave(), UNGRADED, Medal.None), 1).gold).toBe(1);
  });

  test('the at-par aside counts the close; the medal columns do not', () => {
    const save = close(
      close(close(emptySave(), 'w1-01', Medal.None), 'w1-03', Medal.None),
      GRADED,
      Medal.Gold,
    );
    const tally = campaignTally(buildRows(save));
    expect(tally.atPar).toBe(3);
    expect(tally.gold).toBe(1);
    expect(tally.silver).toBe(0);
    expect(tally.bronze).toBe(0);
  });
});

describe('the accessible name does not announce finished work as unfinished', () => {
  /** The state the accessibility tree was pulled in: both ungraded orders closed, `w1-05` open. */
  function bootSectorInProgress(): SaveFile {
    return close(close(emptySave(), 'w1-01', Medal.None), 'w1-03', Medal.None);
  }

  test('a closed ungraded order is not read as a missing medal', () => {
    const label = nodeLabel(nodeFor(bootSectorInProgress(), UNGRADED));
    expect(label).toContain('Closed. Not graded.');
    expect(label).not.toContain('no medal');
  });

  test('an untouched graded order is still read as a missing medal', () => {
    const label = nodeLabel(nodeFor(bootSectorInProgress(), GRADED));
    expect(label).toContain('Open. no medal.');
  });

  test('a closed ungraded order and an untouched graded one no longer sound alike', () => {
    const save = bootSectorInProgress();
    const closed = nodeLabel(nodeFor(save, UNGRADED)).slice(-'no medal. 0 bonus stars.'.length);
    const open = nodeLabel(nodeFor(save, GRADED)).slice(-'no medal. 0 bonus stars.'.length);
    expect(closed).not.toBe(open);
  });

  test('a medal is still named where the level carries one', () => {
    const save = close(bootSectorInProgress(), GRADED, Medal.Gold);
    expect(nodeLabel(nodeFor(save, GRADED))).toContain('Closed. gold medal.');
  });
});

/*
 * The header band and the work orders under it are one column, and the stylesheet may only say so
 * once.
 *
 * A player on a 1855px window photographed the split: the header took `--screen-gutter` alone
 * while the route was additionally capped at 1680px and centred, so above the cap plus two gutters
 * the header's right-hand group — the campaign bar and its caption — drifted 37px past the rows it
 * describes and ran at the window edge. The fix is not a matching padding on the header; it is one
 * inset both of them read, because a second hand-tuned number is the same bug again. These cases
 * hold the single source rather than the pixels: measured boxes belong in a browser, but "the
 * header does not carry a gutter of its own" is a property of the file.
 */
const CSS = readFileSync(new URL('../../styles/screens.css', import.meta.url), 'utf8');
const DEEPSITE = readFileSync(new URL('../../styles/art/deepsite.css', import.meta.url), 'utf8');
const SIGNAL = readFileSync(new URL('../../styles/art/signal.css', import.meta.url), 'utf8');
const MARKUP = readFileSync(new URL('../LevelSelect.tsx', import.meta.url), 'utf8');

const rule = (selector: string, sheet = CSS): string => {
  const found = new RegExp(`\\${selector}\\s*\\{[^}]*\\}`).exec(sheet)?.[0];
  if (!found) throw new Error(`no ${selector} rule in the stylesheet`);
  return found;
};

const value = (property: string, source: string): string => {
  const found = new RegExp(`${property}:\\s*([^;]+);`).exec(source)?.[1];
  if (!found) throw new Error(`no ${property} declaration`);
  return found.trim();
};

describe('the site map header stays in the content column', () => {
  test('the column is defined once, on the screen root', () => {
    const root = rule('.sitemap');
    expect(['--content-max', /--content-max:\s*\d+px/.test(root)]).toEqual(['--content-max', true]);
    expect([
      '--content-inset',
      /--content-inset:\s*max\(var\(--screen-gutter\),\s*calc\(\(100% - var\(--content-max\)\) \/ 2\)\)/.test(
        root,
      ),
    ]).toEqual(['--content-inset', true]);
  });

  test('the header and the scrolling body take the same inset', () => {
    for (const selector of ['.sitemap__header', '.sitemap__scroll']) {
      expect([selector, /padding:[^;]*var\(--content-inset\)/.test(rule(selector))]).toEqual([
        selector,
        true,
      ]);
      expect([`${selector} has no gutter of its own`, rule(selector).includes('--screen-gutter')]).toEqual(
        [`${selector} has no gutter of its own`, false],
      );
    }
  });

  test('the route no longer sets a width the header cannot see', () => {
    const route = rule('.sitemap__route');
    expect(['max-width', /max-width/.test(route)]).toEqual(['max-width', false]);
    expect(['margin-inline', /margin-inline/.test(route)]).toEqual(['margin-inline', false]);
  });
});

/*
 * A box that cannot hold its own text.
 *
 * `.world__num` was a flat 42px while the deepsite direction set the numeral at `clamp(28px, 3vw,
 * 46px)`. At 1920 that is 46px of JetBrains Mono, and two digits of it measure 57px, so `08` sat
 * 16px outside its own right-hand border and touched THE KESSLER CONTRACT beside it. The width of
 * two characters of a monospace face at a stated size is arithmetic, not taste, so the sheet does
 * the multiplication and this recomputes it against every size any direction hands the numeral.
 */
describe('the world numeral fits inside its own plate', () => {
  /** JetBrains Mono advances 0.6em a character. The numerals are always zero-padded to two. */
  const MONO_ADVANCE = 0.6;
  const DIGITS = 2;

  const numeral = rule('.world__num');
  const tracking = Number(/([\d.]+)em/.exec(value('letter-spacing', numeral))?.[1]);
  const root = rule('.sitemap');
  const scale = (property: string): number =>
    Number(/([\d.]+)\s*\*/.exec(value(property, root))?.[1]);
  const glyphRatio = scale('--num-glyph');
  const padRatio = scale('--num-pad');
  const floor = Number(/max\(\s*([\d.]+)px/.exec(value('--num-box', root))?.[1]);

  /** Every type size the base sheet or an art direction hands the numeral, in px. */
  const sizes = (): number[] => {
    const found: number[] = [];
    for (const sheet of [CSS, DEEPSITE, SIGNAL]) {
      for (const [, declared] of sheet.matchAll(/--num-size:\s*([^;]+);/g)) {
        const indirect = /var\((--[\w-]+)\)/.exec(declared ?? '');
        const source = indirect?.[1] ? value(indirect[1], sheet) : (declared ?? '');
        for (const [, px] of source.matchAll(/([\d.]+)px/g)) found.push(Number(px));
      }
    }
    return found;
  };

  test('the declared glyph width is what two digits of the face actually measure', () => {
    expect(glyphRatio).toBeGreaterThanOrEqual(DIGITS * (MONO_ADVANCE + tracking));
  });

  test('the plate holds the numeral at every size a direction sets', () => {
    const every = sizes();
    expect(every.length).toBeGreaterThan(1);
    for (const size of every) {
      const glyph = DIGITS * (MONO_ADVANCE + tracking) * size;
      const box = Math.max(floor, glyphRatio * size + 2 * padRatio * size + 2);
      expect([size, box - 2 >= glyph]).toEqual([size, true]);
    }
  });

  test('the plate states no width of its own, and clips nothing', () => {
    expect(['derived width', /width:\s*var\(--num-box\)/.test(numeral)]).toEqual([
      'derived width',
      true,
    ]);
    expect(['no literal width', /width:\s*[\d.]+px/.test(numeral)]).toEqual([
      'no literal width',
      false,
    ]);
    expect(['no clipping', /overflow/.test(numeral)]).toEqual(['no clipping', false]);
  });

  test('what has to line up with the plate reads its width rather than restating it', () => {
    expect(['the meta indent', value('padding-left', rule('.world__meta'))]).toEqual([
      'the meta indent',
      'calc(var(--num-box) + var(--num-gap))',
    ]);
    expect(['the spine', value('left', rule('.sitemap__worlds::before'))]).toEqual([
      'the spine',
      'calc(var(--num-box) / 2)',
    ]);
  });
});

/*
 * The spine means "these eight worlds are one run of track", and the commendation shelf is not a
 * stop on it.
 *
 * The rule used to hang off `.sitemap__route`, which is the shelf's parent as well as the worlds',
 * so it spanned the route's whole height and ran down the side of the panel. The fix is the
 * container, not a `bottom:` tuned to clear a shelf of today's length — so what this holds is the
 * ownership: whatever element the spine measures must not contain the shelf.
 */
describe('the route spine ends with the last world', () => {
  const worlds = (): string => {
    const lines = MARKUP.split('\n');
    const open = lines.findIndex((line) => line.includes('className="sitemap__worlds"'));
    if (open < 0) throw new Error('no worlds container in LevelSelect.tsx');
    const line = lines[open] ?? '';
    const closing = `${' '.repeat(line.length - line.trimStart().length)}</div>`;
    const close = lines.findIndex((candidate, at) => at > open && candidate.startsWith(closing));
    if (close < 0) throw new Error('the worlds container never closes');
    return lines.slice(open, close + 1).join('\n');
  };

  test('the spine hangs off the worlds, in every direction', () => {
    for (const [name, sheet] of [
      ['screens.css', CSS],
      ['signal.css', SIGNAL],
      ['deepsite.css', DEEPSITE],
    ] as const) {
      expect([name, sheet.includes('.sitemap__route::before')]).toEqual([name, false]);
    }
    expect(CSS).toContain('.sitemap__worlds::before');
  });

  test('the container the spine measures does not hold the commendation shelf', () => {
    expect(worlds()).toContain('className={row.complete');
    expect(worlds()).not.toContain('<CommendationShelf');
    expect(MARKUP).toContain('<CommendationShelf');
  });

  test('the spine is inset evenly, not cleared past a panel', () => {
    const spine = rule('.sitemap__worlds::before');
    expect(value('bottom', spine)).toBe(value('top', spine));
  });
});
