import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { buildAmbientDts, unlockedApiNames } from '../../../runtime/ambient.ts';

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

export function compileErrors(levelId: string, program: string): string[] {
  const sources = new Map<string, string>([
    [AMBIENT_FILE, buildAmbientDts(unlockedApiNames(levelId))],
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
  return [...compilation.getSyntacticDiagnostics(), ...compilation.getSemanticDiagnostics()].map(
    (d) => ts.flattenDiagnosticMessageText(d.messageText, ' '),
  );
}
