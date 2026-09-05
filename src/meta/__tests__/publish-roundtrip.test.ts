import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import { linkProgram } from '../../runtime/index.ts';
import { LIBRARY_EMPTY_STARTER, PUBLISH, REGRESSION } from '../copy.ts';
import type { Declaration } from '../publish.ts';
import { closureOf, planPublication, publishableDeclarations } from '../publish.ts';

/**
 * The corpus. One entry per shape a player can write, and the contract is the same for all of them:
 * publish it, and the Repository holds a file that parses and a subroutine that still does what it
 * did before it moved.
 *
 * The specific defect — an expression-bodied arrow whose body is on the next line, cut to its first
 * line and committed as a syntax error — is one row in this table. It was never a bug about arrows.
 * The extractor decided where a declaration ended by looking for a newline, so every shape that
 * carries an expression across one was cut in the same place. Adding rows is how this stops being
 * true one shape at a time.
 */

const TARGET: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
};

/** Emitted JavaScript, and the syntax errors the compiler found on the way. */
function compile(source: string): { js: string; errors: string[] } {
  const output = ts.transpileModule(source, {
    compilerOptions: TARGET,
    reportDiagnostics: true,
  });
  return {
    js: output.outputText,
    errors: (output.diagnostics ?? []).map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
    ),
  };
}

/** Runs a work order against a library and returns everything `record()` was handed. */
function run(programJs: string, libraryJs: string): { log: unknown[]; exports: string[] } {
  const log: unknown[] = [];
  const linked = linkProgram({
    programJs,
    libraryJs,
    scope: { api: { record: (value: unknown) => log.push(value) }, values: {} },
    meter: { now: () => 0 },
  });
  linked.run();
  return { log, exports: linked.exports };
}

interface Shape {
  title: string;
  /** The routine the player would tick. */
  publish: string;
  /** The whole work order, exactly as it would sit in the editor. */
  source: string;
}

const SHAPES: Shape[] = [
  {
    title: 'an expression-bodied arrow whose body is on the next lines',
    publish: 'ahead',
    source: [
      'const ahead = (d: number, p: { x: number; y: number }) =>',
      '  d === 0 ? { x: p.x, y: p.y - 1 } :',
      '  d === 1 ? { x: p.x + 1, y: p.y } :',
      '  d === 2 ? { x: p.x, y: p.y + 1 } :',
      '  { x: p.x - 1, y: p.y };',
      '',
      'record(ahead(0, { x: 2, y: 2 }).y);',
      'record(ahead(1, { x: 2, y: 2 }).x);',
      '',
    ].join('\n'),
  },
  {
    title: 'a function declaration',
    publish: 'walk',
    source: [
      'function walk(n: number): number {',
      '  let total = 0;',
      '  for (let i = 0; i < n; i++) total += i;',
      '  return total;',
      '}',
      '',
      'record(walk(4));',
      '',
    ].join('\n'),
  },
  {
    title: 'a generic function constrained by an object type',
    publish: 'firstOf',
    source: [
      'function firstOf<T extends { id: number }>(items: T[]): T {',
      '  return items[0] as T;',
      '}',
      '',
      'record(firstOf([{ id: 7 }, { id: 9 }]).id);',
      '',
    ].join('\n'),
  },
  {
    title: 'a generic arrow',
    publish: 'pick',
    source: [
      'const pick = <T,>(items: T[], at: number): T => items[at] as T;',
      '',
      'record(pick([3, 5, 8], 2));',
      '',
    ].join('\n'),
  },
  {
    title: 'a function whose return type is an object type',
    publish: 'bounds',
    source: [
      'function bounds(cells: { x: number; y: number }[]): { min: number; max: number } {',
      '  const xs = cells.map((cell) => cell.x);',
      '  return { min: Math.min(...xs), max: Math.max(...xs) };',
      '}',
      '',
      'record(bounds([{ x: 4, y: 0 }, { x: 1, y: 0 }]).min);',
      '',
    ].join('\n'),
  },
  {
    title: 'destructured parameters, one of them defaulted',
    publish: 'offset',
    source: [
      'function offset(',
      '  { x, y }: { x: number; y: number },',
      '  { dx = 1, dy = 0 }: { dx?: number; dy?: number } = {},',
      '): number {',
      '  return x + dx + y + dy;',
      '}',
      '',
      'record(offset({ x: 2, y: 3 }));',
      '',
    ].join('\n'),
  },
  {
    title: 'a template literal that spans lines and holds a brace',
    publish: 'label',
    source: [
      'const label = (x: number, y: number): string => `tile',
      '${x},${y} { still one string }`;',
      '',
      'record(label(1, 2));',
      '',
    ].join('\n'),
  },
  {
    title: 'a trailing comment on the declaration line',
    publish: 'twice',
    source: [
      'const twice = (n: number): number => n * 2; // north is negative y',
      '',
      'record(twice(21));',
      '',
    ].join('\n'),
  },
  {
    title: 'an async arrow with its body on the next line',
    publish: 'settle',
    source: [
      'const settle = async (n: number): Promise<void> =>',
      '  record(n * 3);',
      '',
      'void settle(4);',
      '',
    ].join('\n'),
  },
  {
    title: 'a class',
    publish: 'Counter',
    source: [
      'class Counter {',
      '  private n = 0;',
      '',
      '  bump(by = 1): number {',
      '    this.n += by;',
      '    return this.n;',
      '  }',
      '}',
      '',
      'const counter = new Counter();',
      'record(counter.bump(2));',
      '',
    ].join('\n'),
  },
  {
    title: 'a method chain continued on the following lines',
    publish: 'evens',
    source: [
      'const evens = (xs: number[]): number[] =>',
      '  xs',
      '    .filter((n) => n % 2 === 0)',
      '    .map((n) => n * 10);',
      '',
      'record(evens([1, 2, 3, 4]).join(","));',
      '',
    ].join('\n'),
  },
  {
    title: 'a regular expression holding a brace',
    publish: 'isCoord',
    source: [
      'const isCoord = (text: string): boolean => /^\\{?\\d+,\\d+\\}?$/.test(text);',
      '',
      'record(isCoord("{1,2}"));',
      'record(isCoord("nope"));',
      '',
    ].join('\n'),
  },
  {
    title: 'a doc comment above a block-bodied arrow',
    publish: 'stride',
    source: [
      '/**',
      ' * Walks the bot forward.',
      ' */',
      'const stride = (n: number): number => {',
      '  let total = 0;',
      '  for (let i = 0; i < n; i++) total += 2;',
      '  return total;',
      '};',
      '',
      'record(stride(3));',
      '',
    ].join('\n'),
  },
  {
    title: 'a routine closing over a multi-line object literal',
    publish: 'price',
    source: [
      'const COSTS = {',
      '  move: 1,',
      '  scan: 0,',
      '};',
      '',
      'const price = (kind: "move" | "scan"): number => COSTS[kind];',
      '',
      'record(price("move"));',
      '',
    ].join('\n'),
  },
  {
    title: 'declarations with no semicolons at all',
    publish: 'scaled',
    source: [
      'const base = 10',
      'const scaled = (n: number): number => n * base',
      '',
      'record(scaled(3))',
      '',
    ].join('\n'),
  },
  {
    title: 'a routine calling another routine below it',
    publish: 'total',
    source: [
      'const total = (xs: number[]): number =>',
      '  xs.reduce((sum, n) => sum + double(n), 0);',
      '',
      'const double = (n: number): number =>',
      '  n * 2;',
      '',
      'record(total([1, 2, 3]));',
      '',
    ].join('\n'),
  },
];

describe('every declaration shape round-trips through a publish', () => {
  for (const shape of SHAPES) {
    test(shape.title, () => {
      const declarations = publishableDeclarations(shape.source);
      const declaration = declarations.find((each) => each.name === shape.publish);
      expect(declaration, `${shape.publish} was not found at all`).toBeDefined();

      const before = compile(shape.source);
      expect(before.errors).toEqual([]);
      const baseline = run(before.js, LIBRARY_EMPTY_STARTER);
      expect(baseline.log.length).toBeGreaterThan(0);

      const plan = planPublication({
        levelSource: shape.source,
        librarySource: LIBRARY_EMPTY_STARTER,
        declarations,
        selection: closureOf(declarations, [shape.publish]).map((name) => ({ name })),
        levelId: 'w4-01',
      });
      expect(plan.refusals).toEqual([]);
      expect(plan.published).toContain(shape.publish);

      /* The declaration arrived whole: its last line came with its first. */
      const tail = (declaration as Declaration).text.trimEnd().split('\n').pop() as string;
      expect(plan.librarySource).toContain(tail.trim());
      expect(plan.levelSource).toContain(`from 'lib'`);

      const library = compile(plan.librarySource);
      expect(library.errors, 'lib.ts does not parse').toEqual([]);
      const level = compile(plan.levelSource);
      expect(level.errors, 'the work order does not parse').toEqual([]);

      const after = run(level.js, library.js);
      expect(after.exports).toContain(shape.publish);
      expect(after.log).toEqual(baseline.log);
    });
  }
});

describe('a publish that would corrupt the Repository is refused', () => {
  const SOLVED = 'function walk(n) {\n  for (let i = 0; i < n; i++) record(i);\n}\n\nwalk(3);\n';

  test('a truncated declaration is named, and neither file is written', () => {
    const truncated: Declaration = {
      name: 'walk',
      kind: 'function',
      start: 0,
      end: 18,
      startLine: 1,
      endLine: 1,
      text: 'function walk(n) {',
      uses: [],
      hardware: [],
      callable: true,
    };

    const plan = planPublication({
      levelSource: SOLVED,
      librarySource: LIBRARY_EMPTY_STARTER,
      declarations: [truncated],
      selection: [{ name: 'walk' }],
      levelId: 'w4-01',
    });

    expect(plan.refusals.map((each) => each.name)).toEqual(['walk']);
    expect(plan.refusals[0]?.message).toBe(PUBLISH.refusedDeclaration('walk'));
    expect(plan.librarySource).toBe(LIBRARY_EMPTY_STARTER);
    expect(plan.levelSource).toBe(SOLVED);
  });

  test('a Repository that does not close is not appended to', () => {
    const broken = 'function half() {\n  record(1);\n';
    const plan = planPublication({
      levelSource: SOLVED,
      librarySource: broken,
      declarations: publishableDeclarations(SOLVED),
      selection: [{ name: 'walk' }],
      levelId: 'w4-01',
    });

    expect(plan.refusals).toHaveLength(1);
    expect(plan.refusals[0]?.message).toBe(PUBLISH.refusedLibrary(1));
    expect(plan.librarySource).toBe(broken);
  });

  test('a Repository whose last line would swallow the newcomer names the newcomer', () => {
    const plan = planPublication({
      levelSource: SOLVED,
      librarySource: 'export const tail = 1 +',
      declarations: publishableDeclarations(SOLVED),
      selection: [{ name: 'walk' }],
      levelId: 'w4-01',
    });

    expect(plan.refusals.map((each) => each.name)).toEqual(['walk']);
    expect(plan.librarySource).toBe('export const tail = 1 +');
  });

  test('a refused publish is the only outcome that leaves lib.ts unparseable-free', () => {
    const plan = planPublication({
      levelSource: SOLVED,
      librarySource: LIBRARY_EMPTY_STARTER,
      declarations: publishableDeclarations(SOLVED),
      selection: [{ name: 'walk' }],
      levelId: 'w4-01',
    });
    expect(plan.refusals).toEqual([]);
    expect(compile(plan.librarySource).errors).toEqual([]);
  });
});

describe('removing a declaration leaves its neighbours alone', () => {
  const SOURCE = [
    'const first = (n: number): number =>',
    '  n + 1;',
    '',
    'const middle = (n: number): number =>',
    '  n * 2;',
    '',
    'const last = (n: number): number =>',
    '  n - 1;',
    '',
    'record(first(1));',
    'record(middle(2));',
    'record(last(3));',
    '',
  ].join('\n');

  test('the two either side of it still parse and still run', () => {
    const declarations = publishableDeclarations(SOURCE);
    const plan = planPublication({
      levelSource: SOURCE,
      librarySource: LIBRARY_EMPTY_STARTER,
      declarations,
      selection: [{ name: 'middle' }],
      levelId: 'w4-01',
    });

    expect(plan.refusals).toEqual([]);
    expect(plan.levelSource).toContain('n + 1;');
    expect(plan.levelSource).toContain('n - 1;');
    expect(plan.levelSource).not.toContain('n * 2;');

    const level = compile(plan.levelSource);
    const library = compile(plan.librarySource);
    expect(level.errors).toEqual([]);
    expect(library.errors).toEqual([]);
    expect(run(level.js, library.js).log).toEqual([2, 4, 2]);
  });
});

describe('the offer is routines, not declarations', () => {
  const SOURCE = [
    'const seen = new Map<string, boolean>();',
    'let bestCost = Infinity;',
    'const key = (x: number, y: number): string => `${x},${y}`;',
    'function remember(x: number, y: number): void {',
    '  seen.set(key(x, y), true);',
    '}',
    'const budget = 12;',
    '',
    'remember(1, 2);',
    'record(seen.size);',
    'record(bestCost + budget);',
    '',
  ].join('\n');

  test('data and scratch are found but never offered', () => {
    const declarations = publishableDeclarations(SOURCE);
    expect(declarations.map((each) => each.name)).toEqual([
      'seen',
      'bestCost',
      'key',
      'remember',
      'budget',
    ]);
    expect(declarations.filter((each) => each.callable).map((each) => each.name)).toEqual([
      'key',
      'remember',
    ]);
  });

  test('ticking one routine takes the state it closes over with it', () => {
    const declarations = publishableDeclarations(SOURCE);
    expect(closureOf(declarations, ['remember'])).toEqual(['seen', 'key', 'remember']);

    const plan = planPublication({
      levelSource: SOURCE,
      librarySource: LIBRARY_EMPTY_STARTER,
      declarations,
      selection: closureOf(declarations, ['remember']).map((name) => ({ name })),
      levelId: 'w4-04',
    });

    expect(plan.refusals).toEqual([]);
    expect(plan.missing).toEqual([]);
    expect(compile(plan.librarySource).errors).toEqual([]);

    const level = compile(plan.levelSource);
    expect(level.errors).toEqual([]);
    expect(run(level.js, compile(plan.librarySource).js).log).toEqual([1, Infinity]);
  });
});

describe('the Regression tab is not part of any of this', () => {
  test('its wording is exactly what it was', () => {
    expect(REGRESSION.medalKept).toBe(
      'Your record is unchanged. It will stay unchanged until you say otherwise — a result is not ' +
        'withdrawn because a later edit disagreed with it.',
    );
    expect(REGRESSION.revert).toBe('RESTORE LAST KNOWN GOOD');
    expect(REGRESSION.accept).toBe('ACCEPT THE NEW RESULT');
    expect(REGRESSION.footnote).toBe('a degraded state is still a state. the form has a box for it');
  });
});
