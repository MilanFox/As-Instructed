/**
 * Every export in `src/` that nothing reads, written down so the list can only get shorter.
 *
 * `docs/AUDIT-CONSTANTS.md` §1 is the bug this file exists for. `BONUS_STAR_WEIGHT` was
 * `export const BONUS_STAR_WEIGHT = 1` in `src/engine/verdict.ts`, re-exported from
 * `src/engine/index.ts`, and named by `docs/ENGINE.md:132` as the number bonus stars are scored
 * with. Nothing read it. The constant that actually ran was `BONUS_STAR_POINTS` in
 * `src/game/score.ts` — and `score.ts` imports `Medal`, `MEDAL_WEIGHT`, `SILVER_FACTOR` and
 * `medalFor` out of `verdict.ts` while pointedly not importing that one. The failure mode is not
 * drift, it is an edit: an agent told "a bonus star is worth two now" greps, finds the copy in the
 * engine that the docs point at, changes it, and ships a suite of 1624 green tests that moves no
 * number on any screen. `SILVER_FACTOR` had been the same shape one fix earlier — exported, read by
 * nothing, sat next to a live inline `1.25`. Both have been fixed, so neither appears below. The
 * shape is what has to stay catchable.
 *
 * **The one rule the guard turns on.** A name counts as read only where it appears on a line that
 * is neither an import nor an export. Barrel plumbing is not a reader. That is not a shortcut, it
 * is the whole point: `src/engine/index.ts` re-exporting `BONUS_STAR_WEIGHT` is precisely what made
 * the decoy look alive, and a scan that treats a re-export as a read hands back the same green
 * tick. Run this file against a tree with the constant restored and it reports two entries, the
 * declaration in `verdict.ts` and the re-export in `index.ts`, which is the right answer twice.
 *
 * The second half of the rule aims the same idea inward: a name its own file never uses either,
 * anywhere but the line that declares it, is read by nothing at all. Without it the scan reports
 * 275 names and nobody reads a list that long. `BOT_ACCENTS` in `src/render/theme.ts` is imported
 * by no module, but `botAccent()` fifteen lines below indexes it — that is a wider public surface
 * than it needs and it is not a decoy. `glowStyle` in `src/render/fx.ts` is written exactly once,
 * on the line that declares it. Only the second kind is listed here.
 *
 * **What it cannot catch.** Anything where both copies are live. `scoreChars` and `countChars` were
 * two working implementations of one count with different answers; the two tick counters were both
 * running; the silver rule was wrong in `DESIGN.md`, in a docstring and in the in-game docs panel
 * while `medalFor` was right. Every one of those is invisible to a reachability scan, because
 * reachability is exactly the property they all have. `docs/AUDIT-CONSTANTS.md` G2 says so itself:
 * necessary, not sufficient. `confessed-invariants.test.ts` is where the both-copies-live half of
 * the class is held.
 *
 * **Known limits of a name-based scan.** A name reached only through a string literal, a computed
 * property or `export * as Namespace` looks dead here and is not; a comment is not a reader, so
 * block comments and whole-line `//` are stripped before the identifiers are collected, which is
 * what catches `toFragment` — mentioned nowhere in this repo but in the prose above its own
 * declaration. An aliased import is resolved back to the name it was imported under, because
 * `useLog as machineUseLog` in `src/levels/world-8/w8-05.ts` is a genuine read of `useLog` and was
 * the only false positive the first draft produced.
 *
 * A string literal cuts the other way and is the one known false *negative*. `--rig-w`, the CSS
 * custom property `src/ui/Workspace.tsx` sets inline, tokenises as `rig` and `w`, and `rig` is the
 * name of a fixture in `src/engine/__tests__/helpers.ts` — so a shipping file appears to read it
 * and it drops out of the test-only count below. Stripping string bodies would take real reads with
 * it, because a template literal's `${}` holds them, so the scan wears this instead.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SRC = join(ROOT, 'src');
const SCANNED = /\.tsx?$/;

/** The allowlist below quotes every dead name, so scanning this file would revive all of them. */
const SELF = 'src/__tests__/unused-exports.test.ts';

const PLUMBING = /^\s*(?:import\b|export\s+(?:type\s+)?\{|export\s+\*)/;
const DECLARATION =
  /^\s*export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:const\s+enum|const|let|var|function\*?|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/;
const SPECIFIER = /^(?:type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/;
const IDENTIFIER = /[A-Za-z_$][\w$]*/g;

/**
 * Dead today, in `<repo-relative file> <exported name>` form.
 *
 * A ratchet, in both directions. The assertion is set equality, so a newly dead export fails
 * immediately *and* deleting one of these fails until its line here goes with it. A list that can
 * only grow is how `docs/ENGINE.md` came to advertise a constant nobody had called in months.
 *
 * Three names appear twice. `hasTerrain`, `toFragment` and `ProgressFacts` are dead at the
 * declaration and dead again at the barrel that re-exports them, and both entries are worth having:
 * the barrel line is the one a reader greps into, and it is the line `docs/ENGINE.md:132` pointed
 * at for `BONUS_STAR_WEIGHT`.
 */
const KNOWN_DEAD: readonly string[] = [
  'src/levels/world-2/shared.ts parkedOnRipestCrop',
  'src/levels/world-2/shared.ts parkedWithoutOvershoot',
  // --- Level-authoring helpers under `src/levels/*/shared.ts` and `caves.ts`. Bonus objectives
  // and terrain queries for levels that were folded away; `docs/FIX-BONUSES.md:86` still credits
  // `noBlockedMoves` / `shortestRoute` to `w1-02` and `w1-04`, and neither level exists. ---
  'src/levels/world-1/shared.ts noBlockedMoves',
  'src/levels/world-1/shared.ts shortestRoute',
  'src/levels/world-2/shared.ts clearedEveryRipeTile',
  'src/levels/world-2/shared.ts harvestedNothingTwice',
  'src/levels/world-2/shared.ts leftUnripeStanding',
  'src/levels/world-2/shared.ts noFailedHarvests',
  'src/levels/world-4/caves.ts floorGraphSummary',
  'src/levels/world-4/caves.ts gridExtent',
  'src/levels/world-4/caves.ts spreadCells',
  'src/levels/world-4/caves.ts tileCell',
  'src/levels/world-8/shared.ts followPath',
  'src/levels/world-8/shared.ts moveCount',
  'src/levels/world-8/shared.ts pickupLog',

  // --- Reference-solution helpers no reference solution calls. ---
  'src/levels/world-3/__solutions__/driver.ts nearestNeighbourTour',
  'src/levels/world-3/__solutions__/driver.ts twoOpt',
  'src/levels/world-7/__solutions__/fleet.ts holdUntil',
  'src/levels/world-7/__solutions__/fleet.ts runDir',

  // --- Objective builders `docs/ENGINE.md:236-238` lists as available to level authors, that no
  // level ever built. The closest thing in this repo to the `BONUS_STAR_WEIGHT` shape: documented,
  // reachable, never called. ---
  'src/engine/index.ts hasTerrain',
  'src/engine/objectives.ts allTilesAre',
  'src/engine/objectives.ts hasTerrain',
  'src/engine/objectives.ts itemsDelivered',
  'src/engine/objectives.ts machinesAllIn',

  // --- The decoys `docs/AUDIT-CONSTANTS.md` §10 named by hand. `progressFor` has a live structural
  // twin in `progressOf` (`LevelSelect.tsx:61`); `SOURCE_URLS` and `MODULE_PREAMBLE_LINES` are
  // aliases of the one real constant rather than re-typed literals, so they cannot disagree. ---
  'src/game/score.ts LevelScore',
  'src/game/store.ts progressFor',
  'src/render/fx.ts glowStyle',
  'src/render/theme.ts PaletteKey',
  'src/runtime/modules.ts MODULE_PREAMBLE_LINES',
  'src/runtime/modules.ts SOURCE_URLS',
  'src/ui/components/Icons.tsx IconTarget',
  'src/ui/copy.ts failureLine',
  'src/ui/copy.ts seedFailureLine',

  // --- The write half of a read/write pair over one `localStorage` key. `storedArt()` is read at
  // module load; `chooseArt()` is what a direction picker would call and no picker has been built,
  // so which direction ships is decided by editing `DEFAULT_ART`. Listed rather than deleted
  // because it is not the `BONUS_STAR_WEIGHT` shape: there is no live twin doing the job instead,
  // so no edit to it can silently no-op, and deleting half the pair leaves a key that can be read
  // and never written. It comes off this list the day something calls it. ---
  'src/ui/art.ts chooseArt',

  // --- Dead behind a barrel: the declaration and the re-export that carries it out of the module.
  // `docs/LIBRARY.md:129,166` documents `toFragment` as part of the library's public surface. ---
  'src/meta/index.ts ProgressFacts',
  'src/meta/index.ts toFragment',
  'src/meta/save.ts toFragment',
  'src/meta/types.ts ProgressFacts',
];

/** Exports whose only readers are tests, split as `[every file, files outside `__tests__`]`. */
const KNOWN_TEST_ONLY: readonly [number, number] = [69, 32];

/** A floor under the scan itself: a regex that quietly stops matching passes every set test. */
const SCANNED_EXPORTS_AT_LEAST = 1500;

interface CodeLine {
  /** The name this line declares, which is not a read of it. */
  declares: string | null;
  words: readonly string[];
}

interface Module {
  exported: readonly string[];
  /** Local name → the names it was imported under, for `import { a as b }`. */
  aliases: ReadonlyMap<string, readonly string[]>;
  /** Every line that is not import/export plumbing. */
  code: readonly CodeLine[];
}

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

function isTest(file: string): boolean {
  return file.includes('/__tests__/') || /\.test\.tsx?$/.test(file);
}

/** Prose is not a reader. Only whole-line `//` is cut, so a `//` inside a string is left alone. */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/**
 * Split one file into the names it exports, the aliases it imports under, and its remaining lines.
 *
 * An import or export statement runs from the line that opens it to the first line carrying a `;`.
 * Multi-line is the common case in this repo — every barrel wraps its specifiers one per line — and
 * a per-line test would read `  BONUS_STAR_WEIGHT,` as ordinary code and call the decoy alive. The
 * `;` terminator is safe because prettier is configured `"semi": true` and formats all of `src/`.
 */
function parse(text: string): Module {
  const exported: string[] = [];
  const aliases = new Map<string, string[]>();
  const code: CodeLine[] = [];
  let statement: string | null = null;

  for (const line of withoutComments(text).split('\n')) {
    if (statement === null && !PLUMBING.test(line)) {
      const declared = DECLARATION.exec(line)?.[1] ?? null;
      if (declared) exported.push(declared);
      code.push({ declares: declared, words: line.match(IDENTIFIER) ?? [] });
      continue;
    }
    statement = (statement ?? '') + line + '\n';
    if (!line.includes(';')) continue;

    const importing = /^\s*import/.test(statement);
    const specifiers = /\{([\s\S]*?)\}/.exec(statement)?.[1] ?? '';
    for (const raw of specifiers.split(',')) {
      const found = SPECIFIER.exec(raw.trim());
      const name = found?.[1];
      const alias = found?.[2];
      if (!name || name === 'default') continue;
      if (importing) {
        if (alias) aliases.set(alias, [...(aliases.get(alias) ?? []), name]);
      } else {
        exported.push(alias ?? name);
      }
    }
    statement = null;
  }

  return { exported: [...new Set(exported)], aliases, code };
}

/**
 * For every identifier in `src/`, the files that read it — where reading excludes the line that
 * declares it and every line of import/export plumbing. This map is the guard.
 */
function readersByName(modules: ReadonlyMap<string, Module>): Map<string, Set<string>> {
  const readers = new Map<string, Set<string>>();
  for (const [file, module] of modules) {
    for (const { declares, words } of module.code) {
      for (const word of words) {
        if (word === declares) continue;
        for (const name of [word, ...(module.aliases.get(word) ?? [])]) {
          const seen = readers.get(name) ?? new Set<string>();
          seen.add(file);
          readers.set(name, seen);
        }
      }
    }
  }
  return readers;
}

interface Survey {
  dead: string[];
  testOnly: string[];
  scanned: number;
}

function survey(): Survey {
  const modules = new Map<string, Module>();
  for (const full of sourceFiles(SRC)) {
    const file = repoPath(full);
    if (file === SELF) continue;
    modules.set(file, parse(readFileSync(full, 'utf8')));
  }

  const readers = readersByName(modules);
  const dead: string[] = [];
  const testOnly: string[] = [];
  let scanned = 0;
  for (const [file, module] of modules) {
    for (const name of module.exported) {
      scanned += 1;
      const seen = [...(readers.get(name) ?? [])];
      if (seen.length === 0) dead.push(`${file} ${name}`);
      else if (seen.every(isTest)) testOnly.push(`${file} ${name}`);
    }
  }
  return { dead: dead.sort(), testOnly: testOnly.sort(), scanned };
}

test('every export in src/ is read somewhere, or is on the list of ones that are not', () => {
  expect(survey().dead).toEqual([...KNOWN_DEAD].sort());
});

/**
 * Reported, not enforced — and the number that should worry a reader more than the one above.
 *
 * `docs/AUDIT-CONSTANTS.md` G2 ranks this class higher than the outright dead: a constant read only
 * by a test, sitting beside a live inline copy, is a decoy with an alibi. The test that imports it
 * is what makes it look load-bearing, and `score.test.ts:60` shows the alibi can be worthless —
 * `expect(levelPoints(Medal.Gold, 2)).toBe(3 + 2 * BONUS_STAR_POINTS)` puts the constant on both
 * sides and passes for every value it could hold.
 *
 * A per-entry allowlist was the wrong instrument here. Two thirds of these are `offline.ts`,
 * `helpers.ts`, `naive.ts` and `fake-monaco.ts` — fixtures whose readers are tests by construction,
 * and listing sixty-seven lines of mostly-fine would bury the thirty-two that live in shipping
 * modules. So the pair is pinned instead: total first, then the count declared outside `__tests__`,
 * which is the half worth reading. It fails in both directions like the allowlist does, and the
 * failure prints the whole list rather than a bare number so the diff is one grep away.
 */
test('the exports that only a test reads are pinned at a count', () => {
  const { testOnly, scanned } = survey();
  const shipping = testOnly.filter((entry) => !isTest(entry.slice(0, entry.indexOf(' '))));
  const counts: [number, number] = [testOnly.length, shipping.length];

  expect([counts, counts[0] === KNOWN_TEST_ONLY[0] ? [] : testOnly]).toEqual([KNOWN_TEST_ONLY, []]);
  expect(scanned).toBeGreaterThan(SCANNED_EXPORTS_AT_LEAST);
});
