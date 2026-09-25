import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import { buildAmbientDts } from '../ambient.ts';

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

function check(program: string): ts.Diagnostic[] {
  const ambient = buildAmbientDts();
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
  test('the ambient file itself is clean', () => {
    expect(messages(check(''))).toEqual([]);
  });
});

describe('unlocked hardware type-checks', () => {
  test('the w1-01 starter program compiles', () => {
    expect(messages(check('move(Dir.East);\nconst here = pos();\n'))).toEqual([]);
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
    expect(messages(check(source))).toEqual([]);
  });

  test('wrong argument types are caught', () => {
    const errors = messages(check('move("north");'));
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('not assignable');
  });
});

describe('locked hardware is not a type error', () => {
  test('scan() and its types type-check before World 2 installs them', () => {
    expect(messages(check('const tile = scan();\nprint(String(tile.walkable));'))).toEqual([]);
    expect(messages(check('const kinds: ItemKind[] = [];'))).toEqual([]);
  });
});

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
    expect(messages(check(source))).toEqual([]);
  });

  test('the handle is typed, not an escape hatch', () => {
    expect(messages(check('bot(0).move("north");'))[0]).toContain('not assignable');
    expect(messages(check('bot("lead").pos();'))[0]).toContain('not assignable');
    expect(messages(check('bot(0).clock().toFixed(0);'))).toEqual([]);
  });
});
