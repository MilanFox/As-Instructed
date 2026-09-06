import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import { buildAmbientDts, unlockedApiNames } from '../ambient.ts';

/**
 * Type-checks the generated declarations with the real TypeScript compiler.
 *
 * `buildAmbientDts` produces source text that is handed to a compiler we cannot run in Node —
 * Monaco's. This test runs the *same* compiler version against the same text, so a malformed
 * declaration is caught here rather than by a player staring at an editor with no autocomplete.
 *
 * It also pins the central progression rule: calling hardware you have not installed is
 * `error TS2304: Cannot find name`, not a runtime surprise (DESIGN.md §6).
 */

const AMBIENT_FILE = '/firmware.d.ts';
const PLAYER_FILE = '/program.ts';

const OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  lib: ['lib.es2022.d.ts'],
  strict: true,
  noEmit: true,
  skipLibCheck: false,
};

function check(levelId: string, program: string): ts.Diagnostic[] {
  const ambient = buildAmbientDts(unlockedApiNames(levelId));
  const sources = new Map<string, string>([
    [AMBIENT_FILE, ambient],
    [PLAYER_FILE, program],
  ]);

  const defaultLib = ts.getDefaultLibFilePath(OPTIONS);
  const host: ts.CompilerHost = {
    fileExists: (fileName) => sources.has(fileName) || fileName === defaultLib,
    readFile: (fileName) => sources.get(fileName) ?? readFileSync(fileName, 'utf8'),
    getSourceFile: (fileName, languageVersion) => {
      const text = sources.get(fileName) ?? readFileSync(fileName, 'utf8');
      return ts.createSourceFile(fileName, text, languageVersion, true);
    },
    getDefaultLibFileName: () => defaultLib,
    writeFile: () => undefined,
    getCurrentDirectory: () => '/',
    getCanonicalFileName: (fileName) => fileName,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
  };

  const compilation = ts.createProgram([AMBIENT_FILE, PLAYER_FILE], OPTIONS, host);
  return [
    ...compilation.getSyntacticDiagnostics(),
    ...compilation.getSemanticDiagnostics(),
    ...compilation.getDeclarationDiagnostics(),
  ];
}

function messages(diagnostics: readonly ts.Diagnostic[]): string[] {
  return diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '));
}

describe('the generated declarations compile', () => {
  const levels = ['w1-01', 'w1-03', 'w2-04', 'w3-04', 'w4-05', 'w5-03', 'w6-03', 'w7-03'];

  for (const levelId of levels) {
    test(`${levelId}: the ambient file itself is clean`, () => {
      expect(messages(check(levelId, ''))).toEqual([]);
    });
  }
});

describe('unlocked hardware type-checks', () => {
  test('the w1-01 starter program compiles', () => {
    expect(messages(check('w1-01', 'move(Dir.East);\nconst here = pos();\n'))).toEqual([]);
  });

  test('a full World 4 program compiles, types and all', () => {
    const source = [
      'interface Visit { at: Vec; from: Dir | null; }',
      'const seen = new Map<string, Visit>();',
      'const ahead: TileView[] = look(Dir.North, 4);',
      'if (ahead.length > 0 && ahead[0]!.walkable) {',
      '  move(Dir.North);',
      '  mark("here");',
      '}',
      'seen.set("0,0", { at: pos(), from: null });',
      'print(`${seen.size} ${readMark() ?? "-"} ${fuel()}`);',
    ].join('\n');
    expect(messages(check('w4-05', source))).toEqual([]);
  });

  test('wrong argument types are caught', () => {
    const errors = messages(check('w1-01', 'move("north");'));
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('not assignable');
  });
});

describe('locked hardware is a type error', () => {
  test('calling scan() before World 2 cannot be spelled', () => {
    const diagnostics = check('w1-01', 'const tile = scan();');
    expect(diagnostics.map((d) => d.code)).toContain(2304);
    expect(messages(diagnostics)[0]).toContain("Cannot find name 'scan'");
  });

  test('naming a type from later hardware is also an error', () => {
    const diagnostics = check('w1-01', 'const kinds: ItemKind[] = [];');
    expect(diagnostics.map((d) => d.code)).toContain(2304);
  });

  test('the same call compiles once the hardware is installed', () => {
    expect(messages(check('w2-02', 'const tile = scan();\nprint(String(tile.walkable));'))).toEqual(
      [],
    );
  });
});

/**
 * The `Bot` handle is the one declaration generated per level rather than copied out of the spec,
 * so it needs the compiler pointed at it directly: a member that is bound at runtime and missing
 * here would cost the player autocomplete on every World 7 line they write.
 */
describe('the bot handle type-checks', () => {
  test('a World 7 program written against handles compiles', () => {
    const source = [
      'const crew: number[] = bots();',
      'for (const id of crew) {',
      '  while (bot(id).canMove(Dir.East)) bot(id).move(Dir.East);',
      '  bot(id).send(crew[0]!, id);',
      '}',
      'sync();',
      'for (const id of crew) {',
      '  const msg: Message | null = bot(id).recv();',
      '  if (msg !== null) print(`${msg.from} at ${msg.t}`);',
      '}',
    ].join('\n');
    expect(messages(check('w7-01', source))).toEqual([]);
  });

  test('the handle obeys the hardware gate the free functions obey', () => {
    const program = 'const helper = bot(bots()[0]!).spawn(Dir.East);';
    const early = check('w7-01', program);
    expect(early.map((d) => d.code)).toContain(2339);
    expect(messages(early)[0]).toContain('spawn');
    expect(messages(check('w7-02', program))).toEqual([]);
  });

  test('the handle is typed, not an escape hatch', () => {
    expect(messages(check('w7-01', 'bot(0).move("north");'))[0]).toContain('not assignable');
    expect(messages(check('w7-01', 'bot("lead").pos();'))[0]).toContain('not assignable');
    expect(messages(check('w7-01', 'bot(0).clock().toFixed(0);'))).toEqual([]);
  });
});
