import { describe, expect, test } from 'vitest';
import {
  MissingLibraryError,
  ModuleError,
  findModuleStatements,
  importedLibraryNames,
  importsLibrary,
  linkProgram,
  moduleStack,
  resolveModuleLocation,
  rewriteProgramImports,
  stripLibraryExports,
} from '../../runtime/modules.ts';
import { measureWrapperOffset, topFrameLine } from '../../runtime/index.ts';
import { runKey } from '../hash.ts';

const offset = measureWrapperOffset(topFrameLine);
const scope = { api: {}, values: {} };

function countLines(text: string): number {
  return text.split('\n').length;
}

describe('finding module statements', () => {
  test('sees a top-level import', () => {
    const found = findModuleStatements(`import { pathTo } from 'lib';\nmove();`);
    expect(found).toHaveLength(1);
    expect(found[0]?.keyword).toBe('import');
    expect(found[0]?.line).toBe(1);
  });

  test('ignores the word export inside a template literal', () => {
    const source = 'const s = `\nexport function fake() {}\n`;\nexport const real = 1;';
    const found = findModuleStatements(source);
    expect(found).toHaveLength(1);
    expect(found[0]?.line).toBe(4);
  });

  test('ignores the word export inside a block comment', () => {
    const source = '/*\nexport function fake() {}\n*/\nexport const real = 1;';
    expect(findModuleStatements(source).map((s) => s.line)).toEqual([4]);
  });

  test('a regex containing a backtick does not open a template', () => {
    const source = 'const r = /`/;\nexport const real = 1;';
    expect(findModuleStatements(source).map((s) => s.line)).toEqual([2]);
  });
});

describe('rewriting imports', () => {
  test('named imports become a destructuring binding', () => {
    const { js, imported } = rewriteProgramImports(`import { pathTo, sweep } from 'lib';\nmove();`);
    expect(js.split('\n')[0]).toContain('const { pathTo, sweep } = __lib__;');
    expect(imported).toEqual(['pathTo', 'sweep']);
  });

  test('an alias keeps the library name and binds the local one', () => {
    const { js, imported } = rewriteProgramImports(`import { pathTo as go } from 'lib';`);
    expect(js).toContain('const { pathTo: go } = __lib__;');
    expect(imported).toEqual(['pathTo']);
  });

  test('a namespace import binds the whole object', () => {
    const { js, namespaceImport } = rewriteProgramImports(`import * as lib from 'lib';`);
    expect(js).toContain('const lib = __lib__;');
    expect(namespaceImport).toBe(true);
  });

  test('a multi-line import keeps its line count', () => {
    const source = `import {\n  pathTo,\n  sweep,\n} from 'lib';\nmove();`;
    const { js } = rewriteProgramImports(source);
    expect(countLines(js)).toBe(countLines(source));
    expect(js.split('\n')[4]).toBe('move();');
  });

  test('any module but lib is refused by name', () => {
    const { problems } = rewriteProgramImports(`import { x } from 'fs';`);
    expect(problems[0]?.message).toContain('`fs`');
    expect(problems[0]?.line).toBe(1);
  });

  test('a default import is refused with the correct form to use', () => {
    const { problems } = rewriteProgramImports(`import lib from 'lib';`);
    expect(problems[0]?.message).toContain("import { pathTo } from 'lib';");
  });

  test('importsLibrary and importedLibraryNames read the untranspiled source', () => {
    const source = `import { pathTo } from 'lib';\nconst n: number = 1;`;
    expect(importsLibrary(source)).toBe(true);
    expect(importedLibraryNames(source)).toEqual(['pathTo']);
    expect(importsLibrary('move();')).toBe(false);
  });
});

describe('stripping exports', () => {
  test('collects functions, classes and consts', () => {
    const module = stripLibraryExports(
      'export function a() {}\nexport class B {}\nexport const c = 1;\nexport let d = 2, e = 3;',
    );
    expect(module.exports).toEqual(['a', 'B', 'c', 'd', 'e']);
    expect(module.js).not.toMatch(/^export/m);
  });

  test('an export clause is collected and blanked', () => {
    const module = stripLibraryExports('function a() {}\nexport { a as pathTo };');
    expect(module.exports).toEqual(['pathTo']);
    expect(module.js).not.toContain('export');
  });

  test('stripping preserves both line and column positions', () => {
    const source = 'export function a() {}\nexport const b = 1;';
    const module = stripLibraryExports(source);
    expect(countLines(module.js)).toBe(countLines(source));
    expect(module.js.split('\n')[0]).toBe('       function a() {}');
  });

  test('a default export is refused', () => {
    expect(stripLibraryExports('export default function () {}').problems[0]?.message).toContain(
      'no default export',
    );
  });

  test('publishing the same name twice is refused', () => {
    const module = stripLibraryExports(
      'export const a = 1;\nfunction a2() {}\nexport { a2 as a };',
    );
    expect(module.problems.some((p) => p.message.includes('published twice'))).toBe(true);
  });
});

describe('linking', () => {
  test('a level calls a library function and gets its value', () => {
    const captured: number[] = [];
    const linked = linkProgram({
      programJs: `import { twice } from 'lib';\ncapture(twice(21));`,
      libraryJs: 'export function twice(n) { return n * 2; }',
      scope: { api: { capture: (n: unknown) => captured.push(n as number) }, values: {} },
    });
    linked.run();
    expect(captured).toEqual([42]);
    expect(linked.exports).toEqual(['twice']);
  });

  test('a library function can call the bot API', () => {
    const moves: number[] = [];
    const linked = linkProgram({
      programJs: `import { go } from 'lib';\ngo(3);`,
      libraryJs: 'export function go(n) { for (let i = 0; i < n; i++) move(1); }',
      scope: { api: { move: (d: unknown) => moves.push(d as number) }, values: {} },
    });
    linked.run();
    expect(moves).toEqual([1, 1, 1]);
  });

  test('importing from a library that does not exist names what was wanted', () => {
    const linked = linkProgram({ programJs: `import { pathTo } from 'lib';`, scope });
    expect(() => linked.run()).toThrow(MissingLibraryError);
    expect(() => linked.run()).toThrow(/pathTo/);
  });

  test('a bad import is a ModuleError carrying its file and line', () => {
    const linked = linkProgram({ programJs: `move();\nimport { x } from 'fs';`, scope });
    try {
      linked.run();
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ModuleError);
      expect((error as ModuleError).file).toBe('program');
      expect((error as ModuleError).line).toBe(2);
    }
  });

  test('a program with no imports and no library runs unchanged', () => {
    const seen: string[] = [];
    const linked = linkProgram({
      programJs: `capture('ran');`,
      scope: { api: { capture: (s: unknown) => seen.push(s as string) }, values: {} },
    });
    linked.run();
    expect(seen).toEqual(['ran']);
  });
});

describe('line numbers across two files', () => {
  function locate(options: {
    programJs: string;
    libraryJs?: string;
    maps?: { program?: number[]; lib?: number[] };
  }): { file: string; line: number } | undefined {
    const linked = linkProgram({
      programJs: options.programJs,
      libraryJs: options.libraryJs,
      scope,
    });
    try {
      linked.run();
    } catch (error) {
      const stack = error instanceof Error ? error.stack : undefined;
      const found = resolveModuleLocation(stack, offset, options.maps ?? {});
      return found ? { file: found.file, line: found.line } : undefined;
    }
    return undefined;
  }

  test('an error thrown in the level reports the level line', () => {
    const found = locate({ programJs: `let a = 1;\na += 1;\nthrow new Error('x');` });
    expect(found).toEqual({ file: 'program', line: 3 });
  });

  test('an error thrown inside a library function reports the lib.ts line', () => {
    const found = locate({
      programJs: `import { boom } from 'lib';\nboom();`,
      libraryJs: 'const pad = 1;\n\nexport function boom() {\n  throw new Error("inside");\n}',
    });
    expect(found).toEqual({ file: 'lib', line: 4 });
  });

  test('an error thrown while the library loads reports the lib.ts line', () => {
    const found = locate({
      programJs: `import { x } from 'lib';`,
      libraryJs: 'const a = 1;\nthrow new Error("load");\nexport const x = 2;',
    });
    expect(found).toEqual({ file: 'lib', line: 2 });
  });

  test('a line map moves the library line the way the emitter erased it', () => {
    const found = locate({
      programJs: `import { boom } from 'lib';\nboom();`,
      libraryJs: 'export function boom() {\n  throw new Error("inside");\n}',
      maps: { lib: [4, 5, 6] },
    });
    expect(found).toEqual({ file: 'lib', line: 5 });
  });

  test('deep in the library, the topmost library frame wins', () => {
    const found = locate({
      programJs: `import { outer } from 'lib';\nouter();`,
      libraryJs:
        'export function outer() {\n  return inner();\n}\nfunction inner() {\n  throw new Error("deep");\n}',
    });
    expect(found).toEqual({ file: 'lib', line: 5 });
  });

  test('the trimmed stack names both files, newest first', () => {
    const linked = linkProgram({
      programJs: `import { boom } from 'lib';\nboom();`,
      libraryJs: 'export function boom() {\n  throw new Error("inside");\n}',
      scope,
    });
    try {
      linked.run();
      throw new Error('should have thrown');
    } catch (error) {
      const stack = moduleStack(error instanceof Error ? error.stack : undefined, offset, {}, true);
      expect(stack).toContain('boom — lib.ts line 2');
      expect(stack).toContain('program.ts line 2');
    }
  });
});

describe('tick attribution', () => {
  function meterRun(libraryJs: string, programJs: string): ReturnType<typeof linkProgram> {
    let clock = 0;
    const linked = linkProgram({
      programJs,
      libraryJs,
      scope: {
        api: {
          move: () => {
            clock += 1;
          },
        },
        values: {},
      },
      meter: { now: () => clock },
    });
    linked.run();
    return linked;
  }

  test('ticks charged inside a library call are attributed to it', () => {
    const linked = meterRun(
      'export function walk(n) { for (let i = 0; i < n; i++) move(); }',
      `import { walk } from 'lib';\nwalk(4);\nmove();`,
    );
    expect(linked.usage.calls['walk']).toEqual({ calls: 1, ticks: 4 });
    expect(linked.usage.ticks).toBe(4);
  });

  test('repeat calls accumulate', () => {
    const linked = meterRun(
      'export function step() { move(); }',
      `import { step } from 'lib';\nfor (let i = 0; i < 5; i++) step();`,
    );
    expect(linked.usage.calls['step']).toEqual({ calls: 5, ticks: 5 });
    expect(linked.usage.ticks).toBe(5);
  });

  test('nesting is counted per function but never double-counted in the total', () => {
    const linked = meterRun(
      'export function step() { move(); }\nexport function sweep() { step(); step(); }',
      `import { sweep } from 'lib';\nsweep();`,
    );
    expect(linked.usage.calls['sweep']).toEqual({ calls: 1, ticks: 2 });
    expect(linked.usage.calls['step']).toEqual({ calls: 2, ticks: 2 });
    expect(linked.usage.ticks).toBe(2);
  });

  test('a library that is never called reports nothing', () => {
    const linked = meterRun('export function unused() { move(); }', `move();`);
    expect(linked.usage).toEqual({ ticks: 0, calls: {} });
  });
});

describe('the regression cache key', () => {
  const base = {
    levelId: 'w4-02',
    sourceHash: 'abc',
    seeds: [1, 2, 3],
    libraryHash: 'lib-1',
    dependsOnLibrary: true,
  };

  test('the same library and the same source give the same key', () => {
    expect(runKey(base)).toBe(runKey({ ...base }));
  });

  test('editing the library changes the key of a dependent work order', () => {
    expect(runKey({ ...base, libraryHash: 'lib-2' })).not.toBe(runKey(base));
  });

  test('editing the library does not change the key of an independent work order', () => {
    const independent = { ...base, dependsOnLibrary: false };
    expect(runKey({ ...independent, libraryHash: 'lib-2' })).toBe(runKey(independent));
  });

  test('a different seed list is a different question', () => {
    expect(runKey({ ...base, seeds: [1, 2, 4] })).not.toBe(runKey(base));
  });

  test('a different work order with identical source is a different key', () => {
    expect(runKey({ ...base, levelId: 'w4-04' })).not.toBe(runKey(base));
  });
});

describe('publishing shapes the linker has to survive', () => {
  test('an aliased export is bound under the name the level imports', () => {
    const captured: number[] = [];
    const linked = linkProgram({
      programJs: `import { twice } from 'lib';\ncapture(twice(4));`,
      libraryJs: 'function local(n) { return n * 2; }\nexport { local as twice };',
      scope: { api: { capture: (n: unknown) => captured.push(n as number) }, values: {} },
    });
    linked.run();
    expect(captured).toEqual([8]);
    expect(linked.exports).toEqual(['twice']);
  });

  test('a published class is still constructible when the library is metered', () => {
    const seen: string[] = [];
    const linked = linkProgram({
      programJs: `import { Queue } from 'lib';\ncapture(new Queue().tag);`,
      libraryJs: 'export class Queue { constructor() { this.tag = "queue"; } }',
      scope: { api: { capture: (s: unknown) => seen.push(s as string) }, values: {} },
      meter: { now: () => 0 },
    });
    linked.run();
    expect(seen).toEqual(['queue']);
  });

  test('an exported const arrow is metered like a function declaration', () => {
    let clock = 0;
    const linked = linkProgram({
      programJs: `import { hop } from 'lib';\nhop();\nhop();`,
      libraryJs: 'export const hop = () => { move(); };',
      scope: {
        api: {
          move: () => {
            clock += 1;
          },
        },
        values: {},
      },
      meter: { now: () => clock },
    });
    linked.run();
    expect(linked.usage.calls['hop']).toEqual({ calls: 2, ticks: 2 });
  });

  test('metering does not move a single line in lib.ts', () => {
    const linked = linkProgram({
      programJs: `import { boom } from 'lib';\nboom();`,
      libraryJs: 'const pad = 1;\n\nexport function boom() {\n  throw new Error("inside");\n}',
      scope,
      meter: { now: () => 0 },
    });
    try {
      linked.run();
      throw new Error('should have thrown');
    } catch (error) {
      const found = resolveModuleLocation(
        error instanceof Error ? error.stack : undefined,
        offset,
        {},
      );
      expect(found?.file).toBe('lib');
      expect(found?.line).toBe(4);
    }
  });
});
