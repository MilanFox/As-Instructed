/**
 * Linking two files together: the player's program and their shared library.
 *
 * The player writes `import { pathTo } from 'lib';` and expects it to work. There is no module
 * loader in a `new Function` sandbox, so the link is done by rewriting text:
 *
 *  - `lib.ts` is emitted, its `export` keywords are stripped, and the whole body is evaluated
 *    inside its own `new Function`, which returns an object of its named exports.
 *  - the program's `import ... from 'lib'` statements are rewritten into destructuring bindings
 *    against that object, and the program is evaluated in a second `new Function`.
 *
 * **Every rewrite preserves the number of newlines it replaces.** That is the whole contract of
 * this module. `sourcemap.ts` maps emitted line -> player line, and a rewrite that added or removed
 * a line would silently poison every error message below it. Columns are allowed to move; they are
 * already discarded by `errors.ts` whenever a line map is present.
 *
 * The two `new Function` bodies each carry a `//# sourceURL=` trailer, which is what makes a stack
 * frame say *which file* it came from. Without it both compile to `<anonymous>` and an error inside
 * a library function is indistinguishable from one in the level — see `resolveModuleLocation`.
 * Measured, not assumed: the trailer does not shift the line numbers the engine reports.
 *
 * Pure. No DOM, no Monaco, no `Sim`.
 */

import { parseStackFrames } from './errors.ts';
import type { LibraryUsage } from './protocol.ts';
import { toSourceLine } from './sourcemap.ts';
import {
  PLAYER_FRAME_NAME,
  SHADOWED_GLOBALS,
  WRAPPER_PREAMBLE_LINES,
  toPlayerLine,
} from './wrapper.ts';

/** The module specifier the player types. There is exactly one. */
export const LIB_SPECIFIER = 'lib';

/** The binding the rewritten imports destructure from. Reserved; the linter rejects it in player code. */
export const LIB_BINDING = '__lib__';

/**
 * The binding the library's own footer calls to install its meters. Reserved, like `LIB_BINDING`.
 *
 * It exists because attribution has to survive a library function calling another one. Wrapping
 * only the exports handed to the level would leave a shared inner helper reporting zero calls, and
 * the Refactor screen would then tell the player that making it faster changes nothing.
 */
export const METER_BINDING = '__meter__';

/** Frame name for the library's top-level body, mirroring `PLAYER_FRAME_NAME`. */
export const LIBRARY_FRAME_NAME = '__library__';

export const PROGRAM_SOURCE_URL = 'bootstrap:///program.ts';
export const LIBRARY_SOURCE_URL = 'bootstrap:///lib.ts';

/** Which of the two files a line number belongs to. */
export type SourceFile = 'program' | 'lib';

export const SOURCE_URLS: Readonly<Record<SourceFile, string>> = {
  program: PROGRAM_SOURCE_URL,
  lib: LIBRARY_SOURCE_URL,
};

/** Player-facing labels. `lib.ts` is what the tab is called, so that is what errors call it. */
export const SOURCE_LABELS: Readonly<Record<SourceFile, string>> = {
  program: 'program.ts',
  lib: 'lib.ts',
};

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

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

/**
 * The lexical state at the start of every line.
 *
 * `import` and `export` are only ever real statements when the line they open starts in `code`.
 * A template literal spanning lines is the one construct that can otherwise put the word `export`
 * at the start of a line, and a library that builds source strings is not far-fetched in World 6.
 */
export function lineStates(source: string): LineState[] {
  const states: LineState[] = ['code'];
  let state: LineState = 'code';
  /** `${` nesting inside a template literal. */
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

    /* state === 'code' */
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

/** Returns the index of the closing delimiter, or the last index consumed. */
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

/** Character offset of the first character of each 1-based line. */
function lineOffsets(source: string): number[] {
  const offsets = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') offsets.push(i + 1);
  return offsets;
}

/**
 * The end of a statement that begins at `from`: one past the terminating `;`.
 *
 * The TypeScript printer always terminates an import or export declaration with a semicolon, so
 * this never has to reason about ASI. Strings, comments and templates are skipped so a specifier
 * like `'a;b'` cannot end the statement early.
 */
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
  /** The keyword that opened it. */
  keyword: 'import' | 'export';
  start: number;
  end: number;
  text: string;
  /** 1-based line the statement starts on. */
  line: number;
}

/** Every top-level `import` / `export` statement, in source order. */
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

/** Blanks a span, keeping every newline it contained so line numbers below do not shift. */
function blank(text: string): string {
  return text.replace(/[^\n]/g, ' ');
}

function newlinesIn(text: string): number {
  let count = 0;
  for (const ch of text) if (ch === '\n') count++;
  return count;
}

/** Replaces a span with `replacement`, then restores the span's newline count. */
function replacePreservingLines(span: string, replacement: string): string {
  return replacement + '\n'.repeat(newlinesIn(span));
}

// ---------------------------------------------------------------------------
// The library side: stripping `export`
// ---------------------------------------------------------------------------

export interface ModuleProblem {
  /** 1-based, in the file the problem was found in. */
  line: number;
  message: string;
}

/** One thing the library publishes. */
export interface LibraryExport {
  /** The name a work order imports. */
  name: string;
  /** The binding inside `lib.ts`. Differs from `name` only for `export { a as b }`. */
  local: string;
  /**
   * True when the binding can be reassigned, which is what lets a meter be installed *inside* the
   * library so calls between library functions are attributed too.
   */
  mutable: boolean;
}

export interface LibraryModule {
  /** Emitted JS with every `export` keyword removed. Line count identical to the input. */
  js: string;
  /** Exported binding names, in declaration order. */
  exports: string[];
  /** The same exports with their local bindings, in declaration order. */
  entries: LibraryExport[];
  problems: ModuleProblem[];
}

const DECLARATION_HEAD =
  /^(?:(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|class\s+([A-Za-z_$][\w$]*)|(const|let|var)\s+([\s\S]*))/;

/** `a, b = 1, { c, d }` -> the identifiers it introduces. */
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
    /* Destructuring: `{ a, b: c }` / `[a, b]`. Take each binding's local name. */
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

/** `{ a, b as c }` -> the local binding and the name the module exposes, per entry. */
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
  /**
   * Rewrite `export const` to `export let` — same width, same columns, same lines — so the export
   * can be reassigned to its metered wrapper from inside the library.
   *
   * Off by default, because it is a semantic change and only the metered path needs it. TypeScript
   * still refuses an assignment to a `const` in the editor, so the player never sees the widening.
   */
  mutableExports?: boolean;
}

/**
 * Turns emitted library JS into a body that can be evaluated and a list of what it exports.
 *
 * `export ` on a declaration is replaced by spaces of the same width, which keeps columns as well
 * as lines intact. An `export { … }` statement is blanked entirely.
 */
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
    /* A `function` or `class` declaration binding is reassignable; so is `let`/`var`; `const` only
       once it has been widened. */
    const mutable = named !== undefined || keyword !== 'const' || widen;

    if (named) entries.push({ name: named, local: named, mutable });
    else {
      for (const name of bindingNames(head[4] ?? '')) {
        entries.push({ name, local: name, mutable });
      }
    }

    /* Blank exactly `export` plus the whitespace that followed it: same width, same lines. */
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

// ---------------------------------------------------------------------------
// The program side: rewriting `import`
// ---------------------------------------------------------------------------

export interface ProgramModule {
  js: string;
  /** Library names the program bound, in import order. */
  imported: string[];
  /** True when the program pulled in the whole namespace. */
  namespaceImport: boolean;
  problems: ModuleProblem[];
}

const IMPORT_SPECIFIER = /from\s*(['"])([^'"]*)\1/;
const EMPTY_EXPORT = /^export\s*\{\s*\}\s*;?$/;

/**
 * Rewrites `import … from 'lib'` into a destructuring binding on the linked library object.
 *
 * The replacement is shorter than what it replaces, so it never needs to wrap; the trailing
 * newlines restore the statement's line count exactly.
 */
export function rewriteProgramImports(emittedJs: string): ProgramModule {
  const statements = findModuleStatements(emittedJs);
  const problems: ModuleProblem[] = [];
  const imported: string[] = [];
  const edits: { start: number; end: number; text: string }[] = [];
  let namespaceImport = false;

  for (const statement of statements) {
    if (statement.keyword === 'export') {
      /* `export {};` with nothing in it is not the player's: it is the marker the compiler
         synthesizes for a file with no imports, because `compile.ts` forces every program to be a
         module so the player's own names shadow the firmware instead of colliding with it. It
         publishes nothing, so it is blanked rather than reported. */
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

/** True when the source asks for anything out of `'lib'`. Cheap enough to run on every keystroke. */
export function importsLibrary(source: string): boolean {
  return findModuleStatements(source).some(
    (statement) =>
      statement.keyword === 'import' && new RegExp(`['"]${LIB_SPECIFIER}['"]`).test(statement.text),
  );
}

/** The library names a source file imports. Static, so it needs no run. */
export function importedLibraryNames(source: string): string[] {
  return rewriteProgramImports(source).imported;
}

// ---------------------------------------------------------------------------
// Linking
// ---------------------------------------------------------------------------

export type { LibraryUsage };

export function emptyUsage(): LibraryUsage {
  return { ticks: 0, calls: {} };
}

/** Reads the sim's clock. Injected so this module never imports the engine. */
export interface TickMeter {
  now(): number;
}

export interface LinkScope {
  api: Readonly<Record<string, unknown>>;
  values: Readonly<Record<string, unknown>>;
}

export interface LinkOptions {
  programJs: string;
  /** Emitted library JS, or `undefined` when the player has no library yet. */
  libraryJs?: string | undefined;
  scope: LinkScope;
  /** When supplied, every library export is metered. */
  meter?: TickMeter | undefined;
}

export interface LinkedProgram {
  run: () => void;
  usage: LibraryUsage;
  /** Exports the library actually provided. */
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

/**
 * Wraps one library export so its ticks can be attributed.
 *
 * Only the outermost call adds to `usage.ticks`: a `sweep` that calls `pathTo` twice would
 * otherwise report more library ticks than the level spent in total, which is the kind of number
 * that makes a player stop trusting the profiler.
 */
function meterExport(
  name: string,
  fn: unknown,
  meter: TickMeter,
  usage: LibraryUsage,
  depth: { value: number },
): unknown {
  if (typeof fn !== 'function') return fn;
  /* A class is a function and cannot be wrapped in one: the wrapper would be called without
     `new` and the constructor would throw. Published classes are handed over unmetered. */
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

/**
 * Builds the callable program, with the library linked in front of it when there is one.
 *
 * The library body runs first and to completion, exactly like a module's top level. Anything it
 * throws happens before the level's first line, and the stack says `lib.ts`.
 */
export function linkProgram(options: LinkOptions): LinkedProgram {
  const problems: { file: SourceFile; problem: ModuleProblem }[] = [];
  const usage = emptyUsage();

  const program = rewriteProgramImports(options.programJs);
  for (const problem of program.problems) problems.push({ file: 'program', problem });

  const needsLibrary = program.imported.length > 0 || program.namespaceImport;
  const libraryJs = options.libraryJs;
  const hasLibrary = libraryJs !== undefined && libraryJs.trim() !== '';

  /* Stripping is pure, so it happens now: the caller learns what the library publishes, and what
     is wrong with it, without having to run anything. */
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

      /* Reassigning the binding inside the library is what makes an intra-library call go through
         the meter: `sweep` looks `step` up at call time and finds the wrapper. Exports that cannot
         be reassigned are wrapped on the way out instead, which still attributes every call the
         *level* makes — it only misses calls the library makes to itself. */
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

/** A rewrite the linker refused. Carries the file and line so the editor can point at it. */
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

/** Thrown when a level imports from a library that is not present at all. */
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

// ---------------------------------------------------------------------------
// Locating an error across two files
// ---------------------------------------------------------------------------

export interface ModuleLocation {
  file: SourceFile;
  /** 1-based, in that file's own source. */
  line: number;
  column?: number;
}

export interface ModuleLineMaps {
  program?: readonly number[] | undefined;
  lib?: readonly number[] | undefined;
}

/**
 * The topmost stack frame that belongs to either player file, in that file's coordinates.
 *
 * This is what makes an error inside `pathTo` say "lib.ts line 12" instead of pointing at the
 * level line that happened to call it. Frames from the game's own bundle have neither source URL
 * and are skipped, so the engine throwing on the player's behalf still resolves to player code.
 */
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

/** Player-visible frames across both files, newest first. */
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

    /* Everything below the program's own top-level frame is the wrapper calling it — V8 names that
       frame `eval`, and it shares the source URL. It is ours, not the player's. */
    if (frame.name === PLAYER_FRAME_NAME) break;
  }

  return lines.length > 0 ? lines.join('\n') : undefined;
}

/** Exported so a test can prove the preamble the offset arithmetic assumes has not moved. */
export const MODULE_PREAMBLE_LINES = WRAPPER_PREAMBLE_LINES;
