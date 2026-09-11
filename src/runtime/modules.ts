import { parseStackFrames } from './errors.ts';
import type { LibraryUsage } from './protocol.ts';
import { toSourceLine } from './sourcemap.ts';
import {
  PLAYER_FRAME_NAME,
  SHADOWED_GLOBALS,
  WRAPPER_PREAMBLE_LINES,
  toPlayerLine,
} from './wrapper.ts';

export const LIB_SPECIFIER = 'lib';

export const LIB_BINDING = '__lib__';

export const METER_BINDING = '__meter__';

export const LIBRARY_FRAME_NAME = '__library__';

export const PROGRAM_SOURCE_URL = 'bootstrap:///program.ts';
export const LIBRARY_SOURCE_URL = 'bootstrap:///lib.ts';

export type SourceFile = 'program' | 'lib';

export const SOURCE_URLS: Readonly<Record<SourceFile, string>> = {
  program: PROGRAM_SOURCE_URL,
  lib: LIBRARY_SOURCE_URL,
};

export const SOURCE_LABELS: Readonly<Record<SourceFile, string>> = {
  program: 'program.ts',
  lib: 'lib.ts',
};

type LineState = 'code' | 'block-comment' | 'template';

const REGEX_PRECEDERS = new Set([
  '(',
  ',',
  '=',
  ':',
  '[',
  '!',
  '&',
  '|',
  '?',
  '{',
  '}',
  ';',
  '+',
  '-',
  '*',
  '%',
  '~',
  '^',
  '<',
  '>',
  'return',
  'typeof',
  'case',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'do',
  'else',
  'yield',
  'await',
]);

export function lineStates(source: string): LineState[] {
  const states: LineState[] = ['code'];
  let state: LineState = 'code';
  let substitution = 0;
  let lastSignificant = '';

  for (let i = 0; i < source.length; i++) {
    const ch = source[i] as string;
    const next = source[i + 1];

    if (ch === '\n') {
      states.push(state);
      continue;
    }

    if (state === 'block-comment') {
      if (ch === '*' && next === '/') {
        state = 'code';
        i += 1;
      }
      continue;
    }

    if (state === 'template') {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === '$' && next === '{') {
        substitution += 1;
        state = 'code';
        i += 1;
        continue;
      }
      if (ch === '`') state = 'code';
      continue;
    }

    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      i -= 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      state = 'block-comment';
      i += 1;
      continue;
    }
    if (ch === '/' && isRegexStart(lastSignificant)) {
      i = skipRegex(source, i);
      lastSignificant = '/';
      continue;
    }
    if (ch === '"' || ch === "'") {
      i = skipQuoted(source, i, ch);
      lastSignificant = ch;
      continue;
    }
    if (ch === '`') {
      state = 'template';
      lastSignificant = '`';
      continue;
    }
    if (ch === '}' && substitution > 0) {
      substitution -= 1;
      state = 'template';
      continue;
    }
    if (!/\s/.test(ch)) lastSignificant = wordEndingAt(source, i) ?? ch;
  }

  return states;
}

function wordEndingAt(source: string, index: number): string | undefined {
  if (!/[A-Za-z_$]/.test(source[index] as string)) return undefined;
  let end = index;
  while (end < source.length && /[A-Za-z0-9_$]/.test(source[end] as string)) end++;
  return source.slice(index, end);
}

function isRegexStart(lastSignificant: string): boolean {
  return lastSignificant === '' || REGEX_PRECEDERS.has(lastSignificant);
}

function skipQuoted(source: string, from: number, quote: string): number {
  let i = from + 1;
  while (i < source.length) {
    const ch = source[i] as string;
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === quote || ch === '\n') return ch === '\n' ? i - 1 : i;
    i++;
  }
  return i;
}

function skipRegex(source: string, from: number): number {
  let i = from + 1;
  let inClass = false;
  while (i < source.length) {
    const ch = source[i] as string;
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '\n') return i - 1;
    if (ch === '[') inClass = true;
    else if (ch === ']') inClass = false;
    else if (ch === '/' && !inClass) return i;
    i++;
  }
  return i;
}

function lineOffsets(source: string): number[] {
  const offsets = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') offsets.push(i + 1);
  return offsets;
}

function statementEnd(source: string, from: number): number {
  let i = from;
  while (i < source.length) {
    const ch = source[i] as string;
    const next = source[i + 1];
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      i = skipQuoted(source, i, ch) + 1;
      continue;
    }
    if (ch === '`') {
      i = skipTemplate(source, i + 1) + 1;
      continue;
    }
    if (ch === ';') return i + 1;
    i++;
  }
  return source.length;
}

function skipTemplate(source: string, from: number): number {
  let i = from;
  while (i < source.length) {
    const ch = source[i] as string;
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '`') return i;
    if (ch === '$' && source[i + 1] === '{') {
      let depth = 1;
      i += 2;
      while (i < source.length && depth > 0) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') depth--;
        i++;
      }
      continue;
    }
    i++;
  }
  return i;
}

export interface StatementSpan {
  keyword: 'import' | 'export';
  start: number;
  end: number;
  text: string;
  line: number;
}

export function findModuleStatements(source: string): StatementSpan[] {
  const states = lineStates(source);
  const offsets = lineOffsets(source);
  const found: StatementSpan[] = [];

  for (let index = 0; index < offsets.length; index++) {
    if (states[index] !== 'code') continue;
    const start = offsets[index] as number;
    const lineEnd = index + 1 < offsets.length ? (offsets[index + 1] as number) - 1 : source.length;
    const line = source.slice(start, lineEnd);
    const match = /^(\s*)(import|export)\b/.exec(line);
    if (!match) continue;

    const keywordStart = start + (match[1] as string).length;
    const end = statementEnd(source, keywordStart);
    found.push({
      keyword: match[2] as 'import' | 'export',
      start: keywordStart,
      end,
      text: source.slice(keywordStart, end),
      line: index + 1,
    });
  }

  return found;
}

function blank(text: string): string {
  return text.replace(/[^\n]/g, ' ');
}

function newlinesIn(text: string): number {
  let count = 0;
  for (const ch of text) if (ch === '\n') count++;
  return count;
}

function replacePreservingLines(span: string, replacement: string): string {
  return replacement + '\n'.repeat(newlinesIn(span));
}

export interface ModuleProblem {
  line: number;
  message: string;
}

export interface LibraryExport {
  name: string;
  local: string;
  mutable: boolean;
}

export interface LibraryModule {
  js: string;
  exports: string[];
  entries: LibraryExport[];
  problems: ModuleProblem[];
}

const DECLARATION_HEAD =
  /^(?:(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|class\s+([A-Za-z_$][\w$]*)|(const|let|var)\s+([\s\S]*))/;

function bindingNames(declarators: string): string[] {
  const names: string[] = [];
  let depth = 0;
  let current = '';
  const flush = (): void => {
    const trimmed = current.trim();
    current = '';
    if (trimmed === '') return;
    const head = trimmed.split('=')[0]?.trim() ?? '';
    if (/^[A-Za-z_$][\w$]*$/.test(head)) {
      names.push(head);
      return;
    }
    for (const part of head.replace(/^[{[]|[}\]]$/g, '').split(',')) {
      const local = part.includes(':') ? part.split(':').pop() : part;
      const cleaned =
        (local ?? '')
          .replace(/^\.\.\./, '')
          .split('=')[0]
          ?.trim() ?? '';
      if (/^[A-Za-z_$][\w$]*$/.test(cleaned)) names.push(cleaned);
    }
  };

  for (const ch of declarators) {
    if (ch === '{' || ch === '[' || ch === '(') depth++;
    else if (ch === '}' || ch === ']' || ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      flush();
      continue;
    } else if (ch === '=' && depth === 0 && current.includes('=')) {
      /* Only the head matters; the initialiser is dropped by `flush`. */
    }
    current += ch;
  }
  flush();
  return names;
}

function exportClausePairs(clause: string): { local: string; name: string }[] {
  const pairs: { local: string; name: string }[] = [];
  for (const part of clause.split(',')) {
    const trimmed = part.trim();
    if (trimmed === '') continue;
    const halves = trimmed.split(/\s+as\s+/);
    const local = (halves[0] ?? '').trim();
    const name = (halves.length > 1 ? (halves[1] ?? '') : local).trim();
    if (/^[A-Za-z_$][\w$]*$/.test(local) && /^[A-Za-z_$][\w$]*$/.test(name)) {
      pairs.push({ local, name });
    }
  }
  return pairs;
}

export interface StripOptions {
  mutableExports?: boolean;
}

export function stripLibraryExports(emittedJs: string, options: StripOptions = {}): LibraryModule {
  const statements = findModuleStatements(emittedJs);
  const problems: ModuleProblem[] = [];
  const entries: LibraryExport[] = [];
  const edits: { start: number; end: number; text: string }[] = [];

  for (const statement of statements) {
    if (statement.keyword === 'import') {
      problems.push({
        line: statement.line,
        message:
          'The library cannot import anything. It is the bottom of the stack: every function ' +
          'the bot offers is already available to it as a global.',
      });
      continue;
    }

    const body = statement.text.replace(/^export\b/, '');
    const rest = body.replace(/^\s*/, '');
    const leading = statement.text.length - rest.length;

    if (/^default\b/.test(rest)) {
      problems.push({
        line: statement.line,
        message:
          'The library has no default export. Every subroutine is published under its own name, ' +
          'so the level that imports it can say which one it means.',
      });
      continue;
    }
    if (rest.startsWith('*')) {
      problems.push({
        line: statement.line,
        message: 'The library cannot re-export another module. There is no other module.',
      });
      continue;
    }
    if (/^type\b|^interface\b/.test(rest)) continue;

    if (rest.startsWith('{')) {
      const close = rest.indexOf('}');
      const clause = close === -1 ? '' : rest.slice(1, close);
      if (/\bfrom\b/.test(rest.slice(close + 1))) {
        problems.push({
          line: statement.line,
          message: 'The library cannot re-export another module. There is no other module.',
        });
        continue;
      }
      for (const pair of exportClausePairs(clause)) {
        entries.push({ name: pair.name, local: pair.local, mutable: false });
      }
      edits.push({ start: statement.start, end: statement.end, text: blank(statement.text) });
      continue;
    }

    const head = DECLARATION_HEAD.exec(rest);
    if (!head) {
      problems.push({
        line: statement.line,
        message:
          'This is not something the library knows how to publish. Export a function, a class, ' +
          'or a `const`.',
      });
      continue;
    }

    const keyword = head[3];
    const widen = keyword === 'const' && options.mutableExports === true;
    const named = head[1] ?? head[2];
    const mutable = named !== undefined || keyword !== 'const' || widen;

    if (named) entries.push({ name: named, local: named, mutable });
    else {
      for (const name of bindingNames(head[4] ?? '')) {
        entries.push({ name, local: name, mutable });
      }
    }

    edits.push({
      start: statement.start,
      end: statement.start + leading,
      text: blank(statement.text.slice(0, leading)),
    });
    if (widen) {
      const keywordStart = statement.start + leading;
      edits.push({ start: keywordStart, end: keywordStart + 5, text: 'let  ' });
    }
  }

  const seen = new Set<string>();
  const unique: LibraryExport[] = [];
  for (const entry of entries) {
    if (seen.has(entry.name)) {
      problems.push({
        line: 1,
        message: `\`${entry.name}\` is published twice. The repository keeps one subroutine per name.`,
      });
      continue;
    }
    seen.add(entry.name);
    unique.push(entry);
  }

  return {
    js: applyEdits(emittedJs, edits),
    exports: unique.map((entry) => entry.name),
    entries: unique,
    problems,
  };
}

function applyEdits(
  source: string,
  edits: readonly { start: number; end: number; text: string }[],
): string {
  const ordered = [...edits].sort((a, b) => a.start - b.start);
  let out = '';
  let cursor = 0;
  for (const edit of ordered) {
    out += source.slice(cursor, edit.start) + edit.text;
    cursor = edit.end;
  }
  return out + source.slice(cursor);
}

export interface ProgramModule {
  js: string;
  imported: string[];
  namespaceImport: boolean;
  problems: ModuleProblem[];
}

const IMPORT_SPECIFIER = /from\s*(['"])([^'"]*)\1/;
const EMPTY_EXPORT = /^export\s*\{\s*\}\s*;?$/;

export function rewriteProgramImports(emittedJs: string): ProgramModule {
  const statements = findModuleStatements(emittedJs);
  const problems: ModuleProblem[] = [];
  const imported: string[] = [];
  const edits: { start: number; end: number; text: string }[] = [];
  let namespaceImport = false;

  for (const statement of statements) {
    if (statement.keyword === 'export') {
      if (EMPTY_EXPORT.test(statement.text.trim())) {
        edits.push({ start: statement.start, end: statement.end, text: blank(statement.text) });
        continue;
      }
      problems.push({
        line: statement.line,
        message:
          'A level program cannot export anything. Publish the subroutine to `lib.ts` instead, ' +
          'and the next work order can import it.',
      });
      continue;
    }

    const specifier = IMPORT_SPECIFIER.exec(statement.text);
    const bare = /^import\s*(['"])([^'"]*)\1/.exec(statement.text);
    const moduleName = specifier?.[2] ?? bare?.[2];

    if (moduleName === undefined) {
      problems.push({ line: statement.line, message: 'This import has no module to import from.' });
      continue;
    }
    if (moduleName !== LIB_SPECIFIER) {
      problems.push({
        line: statement.line,
        message:
          `There is no module \`${moduleName}\`. The only module on this site is \`'lib'\`, the ` +
          'Shared Subroutines Repository.',
      });
      continue;
    }
    if (bare) {
      edits.push({ start: statement.start, end: statement.end, text: blank(statement.text) });
      continue;
    }

    const clause = statement.text.slice('import'.length, statement.text.indexOf(' from')).trim();
    const rewritten = importBinding(clause, statement.line, problems, imported);
    if (rewritten === undefined) {
      edits.push({ start: statement.start, end: statement.end, text: blank(statement.text) });
      continue;
    }
    if (rewritten.namespace) namespaceImport = true;
    edits.push({
      start: statement.start,
      end: statement.end,
      text: replacePreservingLines(statement.text, rewritten.code),
    });
  }

  return { js: applyEdits(emittedJs, edits), imported, namespaceImport, problems };
}

function importBinding(
  clause: string,
  line: number,
  problems: ModuleProblem[],
  imported: string[],
): { code: string; namespace: boolean } | undefined {
  const namespace = /^\*\s*as\s+([A-Za-z_$][\w$]*)$/.exec(clause);
  if (namespace) return { code: `const ${namespace[1]} = ${LIB_BINDING};`, namespace: true };

  const named = /^\{([\s\S]*)\}$/.exec(clause);
  if (named) {
    const parts: string[] = [];
    for (const raw of (named[1] as string).split(',')) {
      const trimmed = raw.trim();
      if (trimmed === '') continue;
      const alias = /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(trimmed);
      if (alias) {
        imported.push(alias[1] as string);
        parts.push(`${alias[1]}: ${alias[2]}`);
        continue;
      }
      if (!/^[A-Za-z_$][\w$]*$/.test(trimmed)) {
        problems.push({ line, message: `\`${trimmed}\` is not a name the library can provide.` });
        continue;
      }
      imported.push(trimmed);
      parts.push(trimmed);
    }
    if (parts.length === 0) return undefined;
    return { code: `const { ${parts.join(', ')} } = ${LIB_BINDING};`, namespace: false };
  }

  problems.push({
    line,
    message:
      'The library has no default export. Name the subroutines you want: ' +
      "`import { pathTo } from 'lib';`",
  });
  return undefined;
}

export function importsLibrary(source: string): boolean {
  return findModuleStatements(source).some(
    (statement) =>
      statement.keyword === 'import' && new RegExp(`['"]${LIB_SPECIFIER}['"]`).test(statement.text),
  );
}

export function importedLibraryNames(source: string): string[] {
  return rewriteProgramImports(source).imported;
}

export type { LibraryUsage };

export function emptyUsage(): LibraryUsage {
  return { ticks: 0, calls: {} };
}

export interface TickMeter {
  now(): number;
}

export interface LinkScope {
  api: Readonly<Record<string, unknown>>;
  values: Readonly<Record<string, unknown>>;
}

export interface LinkOptions {
  programJs: string;
  libraryJs?: string | undefined;
  scope: LinkScope;
  meter?: TickMeter | undefined;
}

export interface LinkedProgram {
  run: () => void;
  usage: LibraryUsage;
  exports: string[];
  problems: { file: SourceFile; problem: ModuleProblem }[];
}

function quote(name: string): string {
  return JSON.stringify(name);
}

function wrap(body: string, frameName: string, sourceUrl: string, footer: string): string {
  return (
    `'use strict';\nreturn (function ${frameName}() {\n${body}\n${footer}\n})();\n` +
    `//# sourceURL=${sourceUrl}`
  );
}

function evaluate(body: string, scope: LinkScope, extra: Record<string, unknown>): unknown {
  const names: string[] = [];
  const args: unknown[] = [];
  const seen = new Set<string>();
  const bind = (name: string, value: unknown): void => {
    if (seen.has(name)) return;
    seen.add(name);
    names.push(name);
    args.push(value);
  };

  for (const [name, value] of Object.entries(extra)) bind(name, value);
  for (const [name, value] of Object.entries(scope.api)) bind(name, value);
  for (const [name, value] of Object.entries(scope.values)) bind(name, value);
  for (const name of SHADOWED_GLOBALS) bind(name, undefined);

  const compiled = new Function(...names, body) as (...values: unknown[]) => unknown;
  return compiled(...args);
}

function meterExport(
  name: string,
  fn: unknown,
  meter: TickMeter,
  usage: LibraryUsage,
  depth: { value: number },
): unknown {
  if (typeof fn !== 'function') return fn;
  if (/^class[\s{]/.test(Function.prototype.toString.call(fn))) return fn;
  const target = fn as (...args: unknown[]) => unknown;
  const wrapped = function (this: unknown, ...args: unknown[]): unknown {
    const before = meter.now();
    depth.value += 1;
    try {
      return target.apply(this, args);
    } finally {
      depth.value -= 1;
      const spent = Math.max(0, meter.now() - before);
      const entry = (usage.calls[name] ??= { calls: 0, ticks: 0 });
      entry.calls += 1;
      entry.ticks += spent;
      if (depth.value === 0) usage.ticks += spent;
    }
  };
  Object.defineProperty(wrapped, 'name', { value: name, configurable: true });
  return wrapped;
}

export function linkProgram(options: LinkOptions): LinkedProgram {
  const problems: { file: SourceFile; problem: ModuleProblem }[] = [];
  const usage = emptyUsage();

  const program = rewriteProgramImports(options.programJs);
  for (const problem of program.problems) problems.push({ file: 'program', problem });

  const needsLibrary = program.imported.length > 0 || program.namespaceImport;
  const libraryJs = options.libraryJs;
  const hasLibrary = libraryJs !== undefined && libraryJs.trim() !== '';

  const library = hasLibrary
    ? stripLibraryExports(libraryJs, { mutableExports: options.meter !== undefined })
    : undefined;
  if (library) for (const problem of library.problems) problems.push({ file: 'lib', problem });

  const run = (): void => {
    const first = problems[0];
    if (first) throw new ModuleError(first.file, first.problem);
    if (needsLibrary && !library) throw new MissingLibraryError(program.imported);

    let bindings: Record<string, unknown> = {};

    if (library) {
      const meter = options.meter;
      const depth = { value: 0 };
      const install = (name: string, fn: unknown): unknown =>
        meter ? meterExport(name, fn, meter, usage, depth) : fn;

      const installs = meter
        ? library.entries
            .filter((entry) => entry.mutable)
            .map((entry) => `${entry.local}=${METER_BINDING}(${quote(entry.name)},${entry.local});`)
            .join('')
        : '';
      const returns = library.entries
        .map((entry) => `${quote(entry.name)}: ${entry.local}`)
        .join(', ');
      const footer = `;${installs}return { ${returns} };`;

      const body = wrap(library.js, LIBRARY_FRAME_NAME, LIBRARY_SOURCE_URL, footer);
      const produced = evaluate(body, options.scope, { [METER_BINDING]: install }) as Record<
        string,
        unknown
      >;

      bindings = {};
      for (const entry of library.entries) {
        const value = produced[entry.name];
        bindings[entry.name] = entry.mutable ? value : install(entry.name, value);
      }
    }

    const body = wrap(program.js, PLAYER_FRAME_NAME, PROGRAM_SOURCE_URL, '');
    evaluate(body, options.scope, { [LIB_BINDING]: bindings });
  };

  return { run, usage, exports: library?.exports ?? [], problems };
}

export class ModuleError extends Error {
  readonly file: SourceFile;
  readonly line: number;
  constructor(file: SourceFile, problem: ModuleProblem) {
    super(problem.message);
    this.name = 'ModuleError';
    this.file = file;
    this.line = problem.line;
  }
}

export class MissingLibraryError extends Error {
  readonly wanted: readonly string[];
  constructor(wanted: readonly string[]) {
    super(
      `This work order imports ${wanted.map((n) => `\`${n}\``).join(', ')} from \`'lib'\`, but the ` +
        'Shared Subroutines Repository is empty on this unit. Write the subroutine here, or ' +
        'publish it from a work order you have already closed.',
    );
    this.name = 'MissingLibraryError';
    this.wanted = wanted;
  }
}

export interface ModuleLocation {
  file: SourceFile;
  line: number;
  column?: number;
}

export interface ModuleLineMaps {
  program?: readonly number[] | undefined;
  lib?: readonly number[] | undefined;
}

export function resolveModuleLocation(
  stack: string | undefined,
  wrapperOffset: number,
  maps: ModuleLineMaps = {},
): ModuleLocation | undefined {
  if (!stack) return undefined;

  for (const frame of parseStackFrames(stack)) {
    if (frame.line === undefined) continue;
    const file: SourceFile | undefined =
      frame.source === PROGRAM_SOURCE_URL
        ? 'program'
        : frame.source === LIBRARY_SOURCE_URL
          ? 'lib'
          : undefined;
    if (!file) continue;

    const emitted = toPlayerLine(frame.line, wrapperOffset);
    if (emitted < 1) continue;
    const map = file === 'program' ? maps.program : maps.lib;
    const line = toSourceLine(emitted, map);
    const remapped = map !== undefined && map.length > 0;
    return frame.column === undefined || remapped
      ? { file, line }
      : { file, line, column: frame.column };
  }

  return undefined;
}

export function moduleStack(
  stack: string | undefined,
  wrapperOffset: number,
  maps: ModuleLineMaps = {},
  labelFiles = false,
): string | undefined {
  if (!stack) return undefined;
  const lines: string[] = [];

  for (const frame of parseStackFrames(stack)) {
    if (frame.line === undefined) continue;
    const file: SourceFile | undefined =
      frame.source === PROGRAM_SOURCE_URL
        ? 'program'
        : frame.source === LIBRARY_SOURCE_URL
          ? 'lib'
          : undefined;
    if (!file) continue;

    const emitted = toPlayerLine(frame.line, wrapperOffset);
    if (emitted < 1) continue;
    const map = file === 'program' ? maps.program : maps.lib;
    const line = toSourceLine(emitted, map);
    const where = labelFiles ? `${SOURCE_LABELS[file]} line ${line}` : `line ${line}`;
    const anonymous =
      frame.name === '' || frame.name === PLAYER_FRAME_NAME || frame.name === LIBRARY_FRAME_NAME;
    lines.push(anonymous ? where : `${frame.name} — ${where}`);

    if (frame.name === PLAYER_FRAME_NAME) break;
  }

  return lines.length > 0 ? lines.join('\n') : undefined;
}

export const MODULE_PREAMBLE_LINES = WRAPPER_PREAMBLE_LINES;
