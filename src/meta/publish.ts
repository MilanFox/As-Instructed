import { findModuleStatements, importedLibraryNames } from '../runtime/index.ts';
import { PUBLISH } from './copy.ts';

export interface Declaration {
  name: string;
  kind: 'function' | 'class' | 'const' | 'let' | 'var';
  start: number;
  end: number;
  startLine: number;
  endLine: number;
  text: string;
  uses: string[];
  hardware: string[];
  callable: boolean;
}

interface Token {
  name: string;
  start: number;
  end: number;
  member: boolean;
}

const KEYWORDS = new Set([
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'new',
  'null',
  'return',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'let',
  'static',
  'yield',
  'await',
  'async',
  'of',
  'as',
  'interface',
  'type',
  'implements',
  'private',
  'public',
  'protected',
  'readonly',
  'declare',
  'abstract',
  'is',
  'keyof',
  'infer',
  'never',
  'unknown',
  'any',
  'string',
  'number',
  'boolean',
]);

export function scanIdentifiers(source: string): Token[] {
  const tokens: Token[] = [];
  let previous = '';
  let i = 0;

  const skipQuoted = (quote: string): void => {
    i += 1;
    while (i < source.length) {
      const ch = source[i];
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === quote || ch === '\n') {
        i += 1;
        return;
      }
      i += 1;
    }
  };

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
      skipQuoted(ch);
      previous = ')';
      continue;
    }
    if (ch === '`') {
      i += 1;
      while (i < source.length) {
        const c = source[i];
        if (c === '\\') {
          i += 2;
          continue;
        }
        if (c === '`') {
          i += 1;
          break;
        }
        if (c === '$' && source[i + 1] === '{') {
          let depth = 1;
          i += 2;
          const start = i;
          while (i < source.length && depth > 0) {
            if (source[i] === '{') depth++;
            else if (source[i] === '}') depth--;
            i++;
          }
          for (const inner of scanIdentifiers(source.slice(start, i - 1))) {
            tokens.push({ ...inner, start: inner.start + start, end: inner.end + start });
          }
          continue;
        }
        i += 1;
      }
      previous = ')';
      continue;
    }
    if (ch === '/' && /[=(,:[!&|?{};+\-*%~^<>]/.test(previous)) {
      i += 1;
      let inClass = false;
      while (i < source.length) {
        const c = source[i];
        if (c === '\\') {
          i += 2;
          continue;
        }
        if (c === '\n') break;
        if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) {
          i += 1;
          break;
        }
        i += 1;
      }
      previous = ')';
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      const start = i;
      while (i < source.length && /[A-Za-z0-9_$]/.test(source[i] as string)) i++;
      const name = source.slice(start, i);
      const before = source.slice(0, start).replace(/\s+$/, '');
      tokens.push({
        name,
        start,
        end: i,
        member: before.endsWith('.'),
      });
      previous = name;
      continue;
    }
    if (!/\s/.test(ch)) previous = ch;
    i += 1;
  }

  return tokens;
}

function lineOffsets(source: string): number[] {
  const offsets = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') offsets.push(i + 1);
  return offsets;
}

function lineAt(offsets: readonly number[], offset: number): number {
  let low = 0;
  let high = offsets.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if ((offsets[mid] as number) <= offset) low = mid;
    else high = mid - 1;
  }
  return low + 1;
}

const DECLARATION_START =
  /^(?:export\s+)?(?:(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)|(const|let|var)\s+([A-Za-z_$][\w$]*))/;

function nextSignificant(source: string, from: number): number {
  let i = from;
  while (i < source.length) {
    const ch = source[i] as string;
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    break;
  }
  return Math.min(i, source.length);
}

function skipSubstitution(source: string, from: number): number {
  let depth = 1;
  let i = from;
  while (i < source.length) {
    const ch = source[i] as string;
    if (ch === '"' || ch === "'" || ch === '`') {
      const next = skipLiteral(source, i);
      if (next === -1) return -1;
      i = next;
      continue;
    }
    if (ch === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i + 1;
    }
    i += 1;
  }
  return -1;
}

function skipLiteral(source: string, from: number): number {
  const quote = source[from] as string;
  let i = from + 1;
  while (i < source.length) {
    const ch = source[i] as string;
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === quote) return i + 1;
    if (quote !== '`' && ch === '\n') return -1;
    if (quote === '`' && ch === '$' && source[i + 1] === '{') {
      const close = skipSubstitution(source, i + 2);
      if (close === -1) return -1;
      i = close;
      continue;
    }
    i += 1;
  }
  return -1;
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
    if (ch === '\n') return -1;
    if (ch === '[') inClass = true;
    else if (ch === ']') inClass = false;
    else if (ch === '/' && !inClass) return i + 1;
    i += 1;
  }
  return -1;
}

const REGEX_MAY_START = /[=(,:[!&|?{};+\-*%~^<>]$/;

const CONTINUES_AFTER =
  /(?:=>|[=+\-*/%,?:&|^~!<>.])$|\b(?:new|typeof|instanceof|in|of|as|satisfies|extends|implements|keyof|await|void|delete|yield|return|else|do)$/;
const CONTINUES_BEFORE =
  /^(?:=>|\?\.|\.{3}|&&|\|\||\?\?|[.?:,+\-*/%&|^<>=])|^(?:instanceof|in|of|as|satisfies|extends|implements)\b/;

const TAIL_LENGTH = 24;

function declarationEnd(source: string, from: number, braced: boolean): number {
  const open: string[] = [];
  let tail = '';
  let i = from;

  const push = (text: string): void => {
    tail = (tail + text).slice(-TAIL_LENGTH);
  };
  const space = (): void => {
    if (!tail.endsWith(' ')) tail += ' ';
  };

  while (i < source.length) {
    const ch = source[i] as string;

    if (ch === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      space();
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i += 2;
      space();
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const next = skipLiteral(source, i);
      if (next === -1) return source.length;
      i = next;
      push(')');
      continue;
    }
    if (ch === '/' && REGEX_MAY_START.test(tail.trimEnd())) {
      const next = skipRegex(source, i);
      if (next === -1) return source.length;
      i = next;
      push(')');
      continue;
    }

    if (ch === '\n') {
      if (
        !braced &&
        open.length === 0 &&
        tail.trim() !== '' &&
        !CONTINUES_AFTER.test(tail.trimEnd()) &&
        !CONTINUES_BEFORE.test(source.slice(nextSignificant(source, i + 1)).slice(0, TAIL_LENGTH))
      ) {
        return i;
      }
      space();
      i += 1;
      continue;
    }
    if (/\s/.test(ch)) {
      space();
      i += 1;
      continue;
    }

    if (ch === '(' || ch === '[' || ch === '{') {
      open.push(ch);
      push(ch);
      i += 1;
      continue;
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      open.pop();
      push(ch);
      i += 1;
      if (braced && ch === '}' && open.length === 0) {
        const rest = source.slice(nextSignificant(source, i)).slice(0, TAIL_LENGTH);
        if (rest.startsWith('{') || CONTINUES_BEFORE.test(rest)) continue;
        return source[i] === ';' ? i + 1 : i;
      }
      continue;
    }
    if (ch === ';' && !braced && open.length === 0) return i + 1;

    push(ch);
    i += 1;
  }
  return source.length;
}

function trailingComment(source: string, end: number): number {
  const match = /^[ \t]*\/\/[^\n]*/.exec(source.slice(end));
  return match ? end + match[0].length : end;
}

function commentAbove(lines: readonly string[], line: number): number {
  let first = line;
  for (let index = line - 1; index >= 1; index--) {
    const text = (lines[index - 1] ?? '').trim();
    if (text.startsWith('//') || text.startsWith('*') || text.startsWith('/*')) first = index;
    else break;
  }
  return first;
}

function declarationHead(text: string): number {
  return nextSignificant(text, 0);
}

const FUNCTION_HEAD =
  /^(?:export\s+)?(?:async\s+)?function\s*\*?\s*[A-Za-z_$][\w$]*\s*(?:<[^>]*>\s*)?\(/;
const ARROW_HEAD =
  /^(?:export\s+)?(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s+)?(?:function\s*\*?\s*(?:[A-Za-z_$][\w$]*)?\s*)?(?:<[^>]*>\s*)?\(/;

function parameterNames(text: string): Set<string> {
  const head = declarationHead(text);
  const body = text.slice(head);
  const match = FUNCTION_HEAD.exec(body) ?? ARROW_HEAD.exec(body);
  if (!match) return new Set();

  const open = head + match[0].length - 1;
  let depth = 0;
  let close = -1;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close === -1) return new Set();
  if (!/^\s*(?:=>|:|\{)/.test(text.slice(close + 1))) return new Set();

  const params = text.slice(open, close + 1);
  const names = new Set<string>();
  for (const token of scanIdentifiers(params)) {
    if (token.member) continue;
    const before = params.slice(0, token.start).replace(/\s+$/, '');
    const after = params.slice(token.end).replace(/^\s+/, '');
    if (!/[(,{[]$/.test(before)) continue;
    if (!/^[:,)}\]=]/.test(after) || after.startsWith('=>')) continue;
    names.add(token.name);
  }
  return names;
}

function matchingBracket(text: string, open: number): number {
  let depth = 0;
  let i = open;
  while (i < text.length) {
    const ch = text[i] as string;
    if (ch === '"' || ch === "'" || ch === '`') {
      const next = skipLiteral(text, i);
      if (next === -1) return -1;
      i = next;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
    i += 1;
  }
  return -1;
}

function initialiserAt(body: string): number {
  let i = 0;
  while (i < body.length) {
    const ch = body[i] as string;
    if (ch === '"' || ch === "'" || ch === '`') {
      const next = skipLiteral(body, i);
      if (next === -1) return -1;
      i = next;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      const close = matchingBracket(body, i);
      if (close === -1) return -1;
      i = close + 1;
      continue;
    }
    if (
      ch === '=' &&
      body[i + 1] !== '>' &&
      body[i + 1] !== '=' &&
      !/[=<>!]/.test(body[i - 1] ?? '')
    )
      return i;
    if (ch === ';' || ch === '\n') return -1;
    i += 1;
  }
  return -1;
}

function isCallable(kind: Declaration['kind'], text: string): boolean {
  if (kind === 'function' || kind === 'class') return true;
  const body = text.slice(declarationHead(text));
  const equals = initialiserAt(body);
  if (equals === -1) return false;

  let value = body.slice(equals + 1).trimStart();
  if (/^async\b/.test(value)) value = value.slice(5).trimStart();
  if (/^function\b/.test(value)) return true;
  if (/^[A-Za-z_$][\w$]*\s*=>/.test(value)) return true;
  if (/^<[^<>]*>\s*\(/.test(value)) value = value.slice(value.indexOf('(') as number);
  if (!value.startsWith('(')) return false;

  const close = matchingBracket(value, 0);
  if (close === -1) return false;
  return /^\s*(?:=>|:)/.test(value.slice(close + 1));
}

export function nestedRoutineNames(source: string): string[] {
  const found: string[] = [];
  for (const raw of source.split('\n')) {
    if (!/^\s/.test(raw)) continue;
    const line = raw.trimStart();
    const match = DECLARATION_START.exec(line);
    if (!match) continue;
    const name = match[1] ?? match[2] ?? match[4];
    if (name === undefined) continue;
    const kind: Declaration['kind'] = match[1]
      ? 'function'
      : match[2]
        ? 'class'
        : ((match[3] ?? 'const') as 'const' | 'let' | 'var');
    if (isCallable(kind, line)) found.push(name);
  }
  return [...new Set(found)];
}

export function closureOf(
  declarations: readonly Declaration[],
  names: readonly string[],
): string[] {
  const byName = new Map(declarations.map((each) => [each.name, each]));
  const reached = new Set<string>();
  const pending = [...names];
  while (pending.length > 0) {
    const name = pending.pop() as string;
    if (reached.has(name) || !byName.has(name)) continue;
    reached.add(name);
    pending.push(...(byName.get(name) as Declaration).uses);
  }
  return declarations.filter((each) => reached.has(each.name)).map((each) => each.name);
}

export function publishableDeclarations(
  source: string,
  hardware: readonly string[] = [],
): Declaration[] {
  const offsets = lineOffsets(source);
  const lines = source.split('\n');
  const tokens = scanIdentifiers(source);
  const found: Declaration[] = [];
  const hardwareSet = new Set(hardware);

  const moduleSpans = findModuleStatements(source)
    .filter((statement) => !DECLARATION_START.test(statement.text))
    .map((statement) => ({ start: statement.start, end: statement.end }));

  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index] as string;
    if (/^\s/.test(raw)) continue;
    const match = DECLARATION_START.exec(raw);
    if (!match) continue;

    const start = offsets[index] as number;
    if (moduleSpans.some((span) => start >= span.start && start < span.end)) continue;
    if (found.some((declaration) => start < declaration.end)) continue;

    const name = match[1] ?? match[2] ?? match[4];
    if (name === undefined) continue;
    const kind: Declaration['kind'] = match[1]
      ? 'function'
      : match[2]
        ? 'class'
        : ((match[3] ?? 'const') as 'const' | 'let' | 'var');

    const braced = kind === 'function' || kind === 'class';
    const end = trailingComment(source, declarationEnd(source, start, braced));
    const startLine = commentAbove(lines, index + 1);
    const textStart = offsets[startLine - 1] as number;

    const body = tokens.filter(
      (token) => token.start >= start && token.end <= end && !token.member,
    );
    const referenced = new Set(body.map((token) => token.name));
    referenced.delete(name);

    found.push({
      name,
      kind,
      start: textStart,
      end,
      startLine,
      endLine: lineAt(offsets, Math.max(start, end - 1)),
      text: source.slice(textStart, end),
      uses: [],
      hardware: [...referenced].filter((each) => hardwareSet.has(each)).sort(),
      callable: isCallable(kind, source.slice(start, end)),
    });
  }

  const names = new Set(found.map((declaration) => declaration.name));
  for (const declaration of found) {
    const shadowed = parameterNames(declaration.text);
    const body = tokens.filter(
      (token) =>
        token.start >= declaration.start &&
        token.end <= declaration.end &&
        !token.member &&
        !KEYWORDS.has(token.name),
    );
    declaration.uses = [
      ...new Set(
        body
          .map((token) => token.name)
          .filter((each) => each !== declaration.name && names.has(each) && !shadowed.has(each)),
      ),
    ].sort();
  }

  return found;
}

export function isValidName(name: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(name) && !KEYWORDS.has(name);
}

export function renameIdentifier(source: string, from: string, to: string): string {
  if (from === to) return source;
  const spans = scanIdentifiers(source).filter((token) => token.name === from && !token.member);
  let out = '';
  let cursor = 0;
  for (const span of spans) {
    out += source.slice(cursor, span.start) + to;
    cursor = span.end;
  }
  return out + source.slice(cursor);
}

export interface PublishSelection {
  name: string;
  publishAs?: string;
}

export interface PublishPlan {
  librarySource: string;
  levelSource: string;
  published: string[];
  conflicts: string[];
  missing: string[];
  hardware: string[];
  refusals: PublishRefusal[];
}

export interface PublishRefusal {
  name?: string;
  message: string;
}

interface Balance {
  unclosed: number | null;
  stray: number | null;
}

function balanceOf(source: string): Balance {
  const open: { ch: string; at: number }[] = [];
  let tail = '';
  let i = 0;

  while (i < source.length) {
    const ch = source[i] as string;
    if (ch === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      tail = ' ';
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      const at = i;
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
      if (i >= source.length) return { unclosed: at, stray: null };
      i += 2;
      tail = ' ';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const next = skipLiteral(source, i);
      if (next === -1) return { unclosed: i, stray: null };
      i = next;
      tail = ')';
      continue;
    }
    if (ch === '/' && REGEX_MAY_START.test(tail.trimEnd())) {
      const next = skipRegex(source, i);
      if (next === -1) return { unclosed: i, stray: null };
      i = next;
      tail = ')';
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') open.push({ ch, at: i });
    else if (ch === ')' || ch === ']' || ch === '}') {
      const last = open.pop();
      const wanted = ch === ')' ? '(' : ch === ']' ? '[' : '{';
      if (!last) return { unclosed: null, stray: i };
      if (last.ch !== wanted) return { unclosed: last.at, stray: i };
    }
    if (!/\s/.test(ch)) tail = (tail + ch).slice(-TAIL_LENGTH);
    else if (!tail.endsWith(' ')) tail += ' ';
    i += 1;
  }
  return { unclosed: open[0]?.at ?? null, stray: null };
}

function lineOf(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i++) if (source[i] === '\n') line += 1;
  return line;
}

export function libraryRefusals(options: {
  source: string;
  additions: readonly { name: string; text: string }[];
}): PublishRefusal[] {
  const refusals: PublishRefusal[] = [];

  for (const addition of options.additions) {
    const balance = balanceOf(addition.text);
    if (balance.unclosed !== null || balance.stray !== null) {
      refusals.push({ name: addition.name, message: PUBLISH.refusedDeclaration(addition.name) });
    }
  }
  if (refusals.length > 0) return refusals;

  const balance = balanceOf(options.source);
  if (balance.unclosed !== null || balance.stray !== null) {
    const at = (balance.unclosed ?? balance.stray) as number;
    return [{ message: PUBLISH.refusedLibrary(lineOf(options.source, at)) }];
  }

  const readBack = publishableDeclarations(options.source);
  for (const addition of options.additions) {
    if (!readBack.some((each) => each.name === addition.name && each.text === addition.text)) {
      refusals.push({ name: addition.name, message: PUBLISH.refusedDeclaration(addition.name) });
    }
  }
  return refusals;
}

export function libraryExportNames(librarySource: string): string[] {
  const names = new Set<string>();
  for (const statement of findModuleStatements(librarySource)) {
    if (statement.keyword !== 'export') continue;
    const rest = statement.text.replace(/^export\s*/, '');
    const clause = /^\{([^}]*)\}/.exec(rest);
    if (clause) {
      for (const part of (clause[1] ?? '').split(',')) {
        const halves = part.split(/\s+as\s+/);
        const name = (halves[halves.length - 1] ?? '').trim();
        if (isValidName(name)) names.add(name);
      }
      continue;
    }
    const declared =
      /^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/.exec(rest) ??
      /^(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/.exec(rest) ??
      /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/.exec(rest);
    if (declared?.[1]) names.add(declared[1]);
  }
  return [...names];
}

const PLACEHOLDER_EXPORT = /^\s*export\s*\{\s*\}\s*;?\s*$/gm;

export function planPublication(options: {
  levelSource: string;
  librarySource: string;
  declarations: readonly Declaration[];
  selection: readonly PublishSelection[];
  levelId: string;
}): PublishPlan {
  const byName = new Map(options.declarations.map((each) => [each.name, each]));
  const chosen = options.selection
    .map((each) => ({ declaration: byName.get(each.name), publishAs: each.publishAs ?? each.name }))
    .filter(
      (each): each is { declaration: Declaration; publishAs: string } =>
        each.declaration !== undefined,
    );

  const existing = new Set(libraryExportNames(options.librarySource));
  const conflicts = chosen
    .filter((each) => existing.has(each.publishAs))
    .map((each) => each.publishAs);

  const takenNames = new Set(chosen.map((each) => each.declaration.name));
  const missing = [
    ...new Set(
      chosen.flatMap((each) => each.declaration.uses.filter((use) => !takenNames.has(use))),
    ),
  ].sort();
  const hardware = [...new Set(chosen.flatMap((each) => each.declaration.hardware))].sort();

  const additions = chosen.map((each) => {
    const renamed = renameIdentifier(
      each.declaration.text,
      each.declaration.name,
      each.publishAs,
    ).trimEnd();
    const head = declarationHead(renamed);
    if (/^export\b/.test(renamed.slice(head))) return renamed;
    return `${renamed.slice(0, head)}export ${renamed.slice(head)}`;
  });

  const trimmedLibrary = options.librarySource.replace(PLACEHOLDER_EXPORT, '').trimEnd();
  const librarySource =
    additions.length === 0
      ? options.librarySource
      : `${trimmedLibrary}\n\n${additions.join('\n\n')}\n`;

  const refusals = libraryRefusals({
    source: librarySource,
    additions: chosen.map((each, index) => ({
      name: each.publishAs,
      text: additions[index] as string,
    })),
  });

  const ordered = [...chosen].sort((a, b) => b.declaration.start - a.declaration.start);
  let levelSource = options.levelSource;
  for (const each of ordered) {
    const before = levelSource.slice(0, each.declaration.start);
    const after = levelSource.slice(each.declaration.end);
    levelSource = `${before.replace(/[ \t]+$/, '')}${after.replace(/^[ \t]*\n/, '')}`;
  }

  const wanted = chosen.map((each) =>
    each.publishAs === each.declaration.name
      ? each.publishAs
      : `${each.publishAs} as ${each.declaration.name}`,
  );
  if (wanted.length > 0) levelSource = withLibraryImport(levelSource, wanted);
  levelSource = levelSource.replace(/\n{3,}/g, '\n\n');

  if (refusals.length === 0) {
    const levelBalance = balanceOf(levelSource);
    if (levelBalance.unclosed !== null || levelBalance.stray !== null) {
      refusals.push({ message: PUBLISH.refusedRemoval });
    }
  }

  const applied = refusals.length === 0;
  return {
    librarySource: applied ? librarySource : options.librarySource,
    levelSource: applied ? levelSource : options.levelSource,
    published: chosen.map((each) => each.publishAs),
    conflicts,
    missing,
    hardware,
    refusals,
  };
}

export function withLibraryImport(source: string, names: readonly string[]): string {
  const existing = importedLibraryNames(source);
  const clause = [...new Set([...existing, ...names])]
    .sort((a, b) => a.localeCompare(b))
    .join(', ');
  const statement = `import { ${clause} } from 'lib';`;

  const found = findModuleStatements(source).find(
    (each) => each.keyword === 'import' && /['"]lib['"]/.test(each.text),
  );
  if (found) {
    return source.slice(0, found.start) + statement + source.slice(found.end);
  }
  return `${statement}\n${source.startsWith('\n') ? '' : '\n'}${source}`;
}
