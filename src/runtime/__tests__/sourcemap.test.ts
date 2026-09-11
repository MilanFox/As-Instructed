import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import { locatePlayerFrame, topFrameLine } from '../errors.ts';
import { decodeLineMap, toSourceLine } from '../sourcemap.ts';
import { createProgram, measureWrapperOffset } from '../wrapper.ts';

const offset = measureWrapperOffset(topFrameLine);

const OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  sourceMap: true,
  removeComments: false,
};

function transpile(source: string): { js: string; lineMap: number[] } {
  const output = ts.transpileModule(source, { compilerOptions: OPTIONS, fileName: 'program.ts' });
  return {
    js: output.outputText.replace(/\n\/\/# sourceMappingURL=.*$/, '\n'),
    lineMap: decodeLineMap(output.sourceMapText ?? ''),
  };
}

function lineOfThrow(source: string): number | undefined {
  const { js, lineMap } = transpile(source);
  const program = createProgram(js, { api: {}, values: {} });
  try {
    program();
  } catch (error) {
    const stack = error instanceof Error ? error.stack : undefined;
    return locatePlayerFrame(stack, offset, lineMap)?.line;
  }
  return undefined;
}

describe('decodeLineMap', () => {
  test('decodes a real emit', () => {
    const { lineMap } = transpile('const a = 1;\nconst b = 2;\n');
    expect(lineMap[0]).toBe(1);
    expect(lineMap[1]).toBe(2);
  });

  test('survives a mappings string it cannot parse', () => {
    expect(decodeLineMap('')).toEqual([]);
    expect(decodeLineMap('{ not json')).toEqual([]);
    expect(decodeLineMap('{"version":3}')).toEqual([]);
  });

  test('accepts either a whole source map or a bare mappings string', () => {
    const output = ts.transpileModule('const a = 1;\n', {
      compilerOptions: OPTIONS,
      fileName: 'program.ts',
    });
    const document: unknown = JSON.parse(output.sourceMapText ?? '{}');
    const mappings = (document as { mappings: string }).mappings;
    expect(decodeLineMap(mappings)).toEqual(decodeLineMap(output.sourceMapText ?? ''));
  });
});

describe('toSourceLine', () => {
  test('is the identity when there is no map', () => {
    expect(toSourceLine(7, undefined)).toBe(7);
    expect(toSourceLine(7, [])).toBe(7);
  });

  test('walks forward past emitter-invented lines rather than reporting line 0', () => {
    expect(toSourceLine(2, [1, 0, 9])).toBe(9);
  });

  test('falls back to the nearest known line when the map runs out', () => {
    expect(toSourceLine(9, [1, 2, 3])).toBe(3);
  });
});

describe('erased lines do not shift the reported line', () => {
  const cases: { name: string; source: string; expected: number }[] = [
    {
      name: 'an interface above the failure',
      source: [
        'const start = 1;',
        'interface Plan {',
        '  step: number;',
        '}',
        'const plan: Plan = { step: start };',
        'throw new Error(`no route from ${plan.step}`);',
      ].join('\n'),
      expected: 6,
    },
    {
      name: 'several type aliases',
      source: [
        'type A = number;',
        'type B = string;',
        'type C = A | B;',
        'const value: C = 1;',
        'throw new Error(String(value));',
      ].join('\n'),
      expected: 5,
    },
    {
      name: 'a type-only construct inside a function the player wrote',
      source: [
        'function plan(): number {',
        '  interface Local { n: number }',
        '  const local: Local = { n: 0 };',
        '  throw new Error(String(local.n));',
        '}',
        'plan();',
      ].join('\n'),
      expected: 4,
    },
  ];

  for (const { name, source, expected } of cases) {
    test(`${name} still reports line ${expected}`, () => {
      expect(lineOfThrow(source)).toBe(expected);
    });
  }

  test('without the map the same program would be reported wrongly, which is why it exists', () => {
    const source = [
      'const start = 1;',
      'interface Plan {',
      '  step: number;',
      '}',
      'throw new Error(String(start));',
    ].join('\n');
    const { js } = transpile(source);
    const program = createProgram(js, { api: {}, values: {} });
    try {
      program();
      expect.unreachable();
    } catch (error) {
      const stack = error instanceof Error ? error.stack : undefined;
      expect(locatePlayerFrame(stack, offset)?.line).toBe(2);
      expect(locatePlayerFrame(stack, offset, transpile(source).lineMap)?.line).toBe(5);
    }
  });
});
