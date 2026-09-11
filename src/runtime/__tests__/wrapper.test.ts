import { describe, expect, test } from 'vitest';
import { locatePlayerFrame, topFrameLine } from '../errors.ts';
import {
  DEFAULT_WRAPPER_OFFSET,
  PLAYER_FRAME_NAME,
  SHADOWED_GLOBALS,
  WRAPPER_PREAMBLE_LINES,
  createProgram,
  measureWrapperOffset,
  toPlayerLine,
  wrapProgram,
} from '../wrapper.ts';

const offset = measureWrapperOffset(topFrameLine);

function lineOfThrow(source: string): number | undefined {
  const program = createProgram(source, { api: {}, values: {} });
  try {
    program();
  } catch (error) {
    const stack = error instanceof Error ? error.stack : undefined;
    return locatePlayerFrame(stack, offset)?.line;
  }
  return undefined;
}

describe('wrapper offset', () => {
  test('measures the offset the running engine actually uses', () => {
    expect(offset).toBe(DEFAULT_WRAPPER_OFFSET);
  });

  test('falls back rather than returning nonsense when the stack is unreadable', () => {
    expect(measureWrapperOffset(() => undefined)).toBe(DEFAULT_WRAPPER_OFFSET);
    expect(measureWrapperOffset(() => 0)).toBe(DEFAULT_WRAPPER_OFFSET);
  });

  test('toPlayerLine subtracts both the engine offset and the preamble', () => {
    expect(toPlayerLine(3 + WRAPPER_PREAMBLE_LINES, 2)).toBe(1);
  });
});

describe('wrapProgram', () => {
  test('puts the player on the line the preamble constant promises', () => {
    const wrapped = wrapProgram('PLAYER_LINE_ONE;');
    const lines = wrapped.split('\n');
    expect(lines[WRAPPER_PREAMBLE_LINES]).toBe('PLAYER_LINE_ONE;');
    expect(wrapped).toContain(PLAYER_FRAME_NAME);
    expect(lines[0]).toBe("'use strict';");
  });
});

describe('end-to-end line mapping', () => {
  const cases: { name: string; source: string; expected: number }[] = [
    { name: 'first line', source: `throw new Error('a');`, expected: 1 },
    { name: 'third line', source: `let a = 1;\na += 1;\nthrow new Error('b');`, expected: 3 },
    {
      name: 'inside a loop',
      source: `for (let i = 0; i < 3; i++) {\n  if (i === 2) throw new Error('c');\n}`,
      expected: 2,
    },
    {
      name: 'inside a helper the player wrote',
      source: `function helper() {\n  throw new Error('d');\n}\nhelper();`,
      expected: 2,
    },
    {
      name: 'after blank lines and comments',
      source: `// a comment\n\n// another\nnull.x;`,
      expected: 4,
    },
  ];

  for (const { name, source, expected } of cases) {
    test(`${name} reports line ${expected}`, () => {
      expect(lineOfThrow(source)).toBe(expected);
    });
  }

  test('a bare last line still maps, with no trailing newline in the source', () => {
    expect(lineOfThrow('const x = undefined;\nx.y')).toBe(2);
  });
});

describe('the sandbox scope', () => {
  function evaluate(expression: string): unknown {
    let captured: unknown;
    const program = createProgram(`capture(${expression});`, {
      api: {
        capture: (value: unknown): void => {
          captured = value;
        },
      },
      values: {},
    });
    program();
    return captured;
  }

  test('every escape hatch is shadowed away', () => {
    for (const name of ['fetch', 'XMLHttpRequest', 'importScripts', 'postMessage', 'self']) {
      expect(evaluate(`typeof ${name}`), name).toBe('undefined');
    }
  });

  test('globalThis does not lead back to the worker scope', () => {
    expect(evaluate('typeof globalThis')).toBe('undefined');
    expect(evaluate('typeof WorkerGlobalScope')).toBe('undefined');
  });

  test('timers are gone, because nothing would ever run them', () => {
    expect(evaluate('typeof setTimeout')).toBe('undefined');
    expect(evaluate('typeof queueMicrotask')).toBe('undefined');
  });

  test('the ordinary language is untouched', () => {
    expect(evaluate('typeof Math')).toBe('object');
    expect(evaluate('[3, 1, 2].sort().join("")')).toBe('123');
    expect(evaluate('new Map([[1, 2]]).get(1)')).toBe(2);
    expect(evaluate('JSON.stringify({ a: 1 })')).toBe('{"a":1}');
  });

  test('`eval` and `arguments` are absent from the shadow list, which would be a SyntaxError', () => {
    expect(SHADOWED_GLOBALS).not.toContain('eval');
    expect(SHADOWED_GLOBALS).not.toContain('arguments');
  });

  test('the program runs in strict mode, so a stray assignment is caught', () => {
    const program = createProgram('undeclared = 1;', { api: {}, values: {} });
    expect(() => program()).toThrow(ReferenceError);
  });

  test('API names win over shadowed names of the same spelling', () => {
    const program = createProgram('report(typeof close);', {
      api: { close: () => 'api', report: () => undefined },
      values: {},
    });
    expect(() => program()).not.toThrow();
  });

  test('values are visible to the player, and the API is callable', () => {
    const seen: unknown[] = [];
    const program = createProgram('collect(Dir.East); collect(move(Dir.North));', {
      api: {
        collect: (value: unknown): void => {
          seen.push(value);
        },
        move: (dir: unknown): unknown => dir,
      },
      values: { Dir: { North: 0, East: 1 } },
    });
    program();
    expect(seen).toEqual([1, 0]);
  });
});
