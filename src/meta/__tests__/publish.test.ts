import { describe, expect, test } from 'vitest';
import {
  isValidName,
  libraryExportNames,
  planPublication,
  publishableDeclarations,
  renameIdentifier,
  scanIdentifiers,
  withLibraryImport,
} from '../publish.ts';
import { LIBRARY_EMPTY_STARTER } from '../copy.ts';

/**
 * Publishing rewrites the player's own two files. The tests that matter are the ones that prove
 * nothing was lost on the way: a declaration that leaves the work order must arrive in `lib.ts`,
 * and a rename must not touch a word inside a string.
 */

const LEVEL = `import { Dir } from 'nothing';

const START = 3;

/** Walks the bot as far as it can go. */
function walk(n: number): void {
  for (let i = 0; i < n; i++) move(Dir.North);
}

function unused(): void {
  print('walk is a nice word');
}

walk(START);
`;

describe('finding publishable declarations', () => {
  test('names every top-level declaration with its kind and line span', () => {
    const found = publishableDeclarations(LEVEL);
    expect(found.map((each) => each.name)).toEqual(['START', 'walk', 'unused']);
    expect(found.find((each) => each.name === 'walk')?.kind).toBe('function');
    expect(found.find((each) => each.name === 'START')?.kind).toBe('const');
  });

  test('a doc comment travels with the declaration it documents', () => {
    const walk = publishableDeclarations(LEVEL).find((each) => each.name === 'walk');
    expect(walk?.text.startsWith('/** Walks the bot')).toBe(true);
    expect(walk?.text.trimEnd().endsWith('}')).toBe(true);
  });

  test('a declaration that leans on another one says so', () => {
    const source = 'const STEP = 2;\nfunction go(): void { move(STEP); }';
    const go = publishableDeclarations(source).find((each) => each.name === 'go');
    expect(go?.uses).toEqual(['STEP']);
  });

  test('bot hardware the declaration calls is reported', () => {
    const source = 'function dig(): void { mine(); move(); }';
    const [dig] = publishableDeclarations(source, ['mine', 'move', 'scan']);
    expect(dig?.hardware).toEqual(['mine', 'move']);
  });

  test('an import statement is not a declaration', () => {
    expect(publishableDeclarations(`import { pathTo } from 'lib';\n`)).toEqual([]);
  });

  test('a statement indented inside a function is left alone', () => {
    const source = 'function outer(): void {\n  const inner = 1;\n  print(inner);\n}';
    expect(publishableDeclarations(source).map((each) => each.name)).toEqual(['outer']);
  });
});

describe('scanning identifiers', () => {
  test('a word inside a string is not an identifier', () => {
    const names = scanIdentifiers(`print('walk');\nwalk();`).map((token) => token.name);
    expect(names).toEqual(['print', 'walk']);
  });

  test('a word inside a comment is not an identifier', () => {
    const names = scanIdentifiers('// walk\nmove();').map((token) => token.name);
    expect(names).toEqual(['move']);
  });

  test('a property access is marked as a member', () => {
    const found = scanIdentifiers('bot.walk();');
    expect(found.map((token) => [token.name, token.member])).toEqual([
      ['bot', false],
      ['walk', true],
    ]);
  });

  test('a template substitution is scanned as code', () => {
    const names = scanIdentifiers('print(`n is ${count}`);').map((token) => token.name);
    expect(names).toEqual(['print', 'count']);
  });
});

describe('renaming', () => {
  test('renames the binding and leaves the string alone', () => {
    const out = renameIdentifier(`function walk() {}\nprint('walk');\nwalk();`, 'walk', 'stride');
    expect(out).toBe(`function stride() {}\nprint('walk');\nstride();`);
  });

  test('a property of the same name is untouched', () => {
    expect(renameIdentifier('a.walk(); walk();', 'walk', 'go')).toBe('a.walk(); go();');
  });

  test('a name that is not an identifier is refused', () => {
    expect(isValidName('pathTo')).toBe(true);
    expect(isValidName('2fast')).toBe(false);
    expect(isValidName('class')).toBe(false);
  });
});

describe('planning a publication', () => {
  const declarations = publishableDeclarations(LEVEL);

  test('the declaration leaves the work order and arrives in the library', () => {
    const plan = planPublication({
      levelSource: LEVEL,
      librarySource: LIBRARY_EMPTY_STARTER,
      declarations,
      selection: [{ name: 'walk' }],
      levelId: 'w4-01',
    });
    expect(plan.librarySource).toContain('export /** Walks the bot');
    expect(plan.librarySource).toContain('function walk(n: number): void');
    expect(plan.levelSource).not.toContain('function walk(n: number)');
    expect(plan.levelSource).toContain("import { walk } from 'lib';");
    expect(plan.levelSource).toContain('walk(START);');
  });

  test('a dependency left behind is reported rather than silently broken', () => {
    const source = 'const STEP = 2;\nfunction go(): void { move(STEP); }';
    const plan = planPublication({
      levelSource: source,
      librarySource: '',
      declarations: publishableDeclarations(source),
      selection: [{ name: 'go' }],
      levelId: 'w4-01',
    });
    expect(plan.missing).toEqual(['STEP']);
  });

  test('publishing the dependency too clears the warning', () => {
    const source = 'const STEP = 2;\nfunction go(): void { move(STEP); }';
    const plan = planPublication({
      levelSource: source,
      librarySource: '',
      declarations: publishableDeclarations(source),
      selection: [{ name: 'go' }, { name: 'STEP' }],
      levelId: 'w4-01',
    });
    expect(plan.missing).toEqual([]);
    expect(plan.published.sort()).toEqual(['STEP', 'go']);
  });

  test('a rename publishes under the new name and imports it back under the old one', () => {
    const plan = planPublication({
      levelSource: LEVEL,
      librarySource: '',
      declarations,
      selection: [{ name: 'walk', publishAs: 'stride' }],
      levelId: 'w4-01',
    });
    expect(plan.librarySource).toContain('function stride(n: number): void');
    expect(plan.levelSource).toContain("import { stride as walk } from 'lib';");
  });

  test('a name the Repository already holds is refused, not overwritten', () => {
    const plan = planPublication({
      levelSource: LEVEL,
      librarySource: 'export function walk(): void {}\n',
      declarations,
      selection: [{ name: 'walk' }],
      levelId: 'w4-01',
    });
    expect(plan.conflicts).toEqual(['walk']);
  });

  test('the placeholder empty export does not survive the first publish', () => {
    const plan = planPublication({
      levelSource: LEVEL,
      librarySource: LIBRARY_EMPTY_STARTER,
      declarations,
      selection: [{ name: 'walk' }],
      levelId: 'w4-01',
    });
    expect(plan.librarySource).not.toMatch(/^\s*export\s*\{\s*\}/m);
  });
});

describe('reading what the library already publishes', () => {
  test('sees declarations and clauses alike', () => {
    const source = 'export function a() {}\nfunction b() {}\nexport { b as pathTo };';
    expect(libraryExportNames(source).sort()).toEqual(['a', 'pathTo']);
  });
});

describe('merging the import', () => {
  test('a second publish extends the existing import rather than adding a line', () => {
    const source = "import { pathTo } from 'lib';\nmove();";
    const out = withLibraryImport(source, ['sweep']);
    expect(out).toBe("import { pathTo, sweep } from 'lib';\nmove();");
  });

  test('a work order with no import gets one at the top', () => {
    expect(withLibraryImport('move();', ['pathTo'])).toBe(
      "import { pathTo } from 'lib';\n\nmove();",
    );
  });
});
