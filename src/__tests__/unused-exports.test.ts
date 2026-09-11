import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SRC = join(ROOT, 'src');
const SCANNED = /\.tsx?$/;

const SELF = 'src/__tests__/unused-exports.test.ts';

const PLUMBING = /^\s*(?:import\b|export\s+(?:type\s+)?\{|export\s+\*)/;
const DECLARATION =
  /^\s*export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:const\s+enum|const|let|var|function\*?|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/;
const SPECIFIER = /^(?:type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/;
const IDENTIFIER = /[A-Za-z_$][\w$]*/g;

const KNOWN_DEAD: readonly string[] = [
  'src/levels/world-1/shared.ts noBlockedMoves',
  'src/levels/world-1/shared.ts shortestRoute',
  'src/levels/world-2/shared.ts clearedEveryRipeTile',
  'src/levels/world-2/shared.ts harvestedNothingTwice',
  'src/levels/world-2/shared.ts leftUnripeStanding',
  'src/levels/world-2/shared.ts noFailedHarvests',
  'src/levels/world-2/shared.ts parkedOnRipestCrop',
  'src/levels/world-2/shared.ts parkedWithoutOvershoot',
  'src/levels/world-4/caves.ts floorGraphSummary',
  'src/levels/world-4/caves.ts gridExtent',
  'src/levels/world-4/caves.ts spreadCells',
  'src/levels/world-4/caves.ts tileCell',
  'src/levels/world-8/shared.ts followPath',
  'src/levels/world-8/shared.ts moveCount',
  'src/levels/world-8/shared.ts pickupLog',

  'src/levels/world-3/__solutions__/driver.ts nearestNeighbourTour',
  'src/levels/world-3/__solutions__/driver.ts twoOpt',
  'src/levels/world-7/__solutions__/fleet.ts holdUntil',
  'src/levels/world-7/__solutions__/fleet.ts runDir',

  'src/engine/index.ts hasTerrain',
  'src/engine/objectives.ts allTilesAre',
  'src/engine/objectives.ts hasTerrain',
  'src/engine/objectives.ts itemsDelivered',
  'src/engine/objectives.ts machinesAllIn',

  'src/game/score.ts LevelScore',
  'src/game/store.ts progressFor',
  'src/render/fx.ts glowStyle',
  'src/render/theme.ts PaletteKey',
  'src/runtime/modules.ts MODULE_PREAMBLE_LINES',
  'src/runtime/modules.ts SOURCE_URLS',
  'src/ui/components/Icons.tsx IconTarget',
  'src/ui/components/Icons.tsx IconBook',
  'src/ui/components/Icons.tsx IconClear',
  'src/ui/components/Icons.tsx IconClose',
  'src/ui/components/Icons.tsx IconPause',
  'src/ui/components/Icons.tsx IconPlay',
  'src/ui/components/Icons.tsx IconSkipEnd',
  'src/ui/components/Icons.tsx IconSkipStart',
  'src/ui/components/Icons.tsx IconStepBack',
  'src/ui/components/Icons.tsx IconStepForward',
  'src/ui/hooks/useOverlay.ts useOverlayRequests',
  'src/ui/copy.ts seedFailureLine',

  'src/meta/index.ts ProgressFacts',
  'src/meta/index.ts PublishRefusal',
  'src/meta/index.ts toFragment',
  'src/meta/save.ts toFragment',
  'src/meta/types.ts ProgressFacts',
];

const KNOWN_TEST_ONLY: readonly [number, number] = [71, 32];

const SCANNED_EXPORTS_AT_LEAST = 1500;

interface CodeLine {
  declares: string | null;
  words: readonly string[];
}

interface Module {
  exported: readonly string[];
  aliases: ReadonlyMap<string, readonly string[]>;
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

function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

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

test('the exports that only a test reads are pinned at a count', () => {
  const { testOnly, scanned } = survey();
  const shipping = testOnly.filter((entry) => !isTest(entry.slice(0, entry.indexOf(' '))));
  const counts: [number, number] = [testOnly.length, shipping.length];

  expect([counts, counts[0] === KNOWN_TEST_ONLY[0] ? [] : testOnly]).toEqual([KNOWN_TEST_ONLY, []]);
  expect(scanned).toBeGreaterThan(SCANNED_EXPORTS_AT_LEAST);
});
