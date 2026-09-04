import { findModuleStatements, importedLibraryNames } from '../runtime/index.ts';

/**
 * Lifting a declaration out of a closed work order and into `lib.ts`.
 *
 * Publishing is a *text* operation on the player's own TypeScript, never on emitted JS: what lands
 * in the Repository has to be the code they wrote, comments and all, or the whole feature reads as
 * a magic trick. So this module scans the source, finds the top-level declarations, and rewrites
 * two files at once — the library gains an `export`, the work order gains an `import`.
 *
 * Three properties it must have, in order of how badly a player is hurt when it does not:
 *  1. Nothing is deleted that is not also added somewhere else.
 *  2. A declaration that references something staying behind is reported before, not after.
 *  3. The rewrite is skippable, and skipping it is free.
 *
 * Pure. No Monaco, no compiler — the type checker's opinion arrives afterwards, in the editor,
 * where the player can see it.
 */

/** A top-level declaration the player could publish. */
export interface Declaration {
  name: string;
  kind: 'function' | 'class' | 'const' | 'let' | 'var';
  /** Character offsets into the source. */
  start: number;
  end: number;
  /** 1-based, inclusive. */
  startLine: number;
  endLine: number;
  /** The declaration exactly as written, including any doc comment directly above it. */
  text: string;
  /** Identifiers it references that are also declared at the top level of this work order. */
  uses: string[];
  /** Bot API names it calls. Used to warn that earlier work orders have no such hardware. */
  hardware: string[];
}

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

interface Token {
  /** Identifier text. */
  name: string;
  start: number;
  end: number;
  /** True when it followed a `.` or `?.` and is therefore a property, not a binding. */
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

/**
 * Every identifier in the source, outside strings, comments, templates and regexes.
 *
 * A rename that walked the text with a regex would happily rewrite the word inside a `print()`
 * message, so the scan is real. It is deliberately not a parser: it needs positions and nothing
 * about scope, which is why forty lines suffice.
 */
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
      /* Substitutions are scanned like code so `${pathTo(x)}` renames correctly. */
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

/** Character offset of the first character of each 1-based line. */
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

/**
 * The end of a top-level declaration that starts at `from`.
 *
 * A `function` or `class` ends at the `}` that closes its body — braces only, because the
 * parameter list's own `)` is not the end of anything. A `const` ends at the semicolon or line
 * break that closes it, with every bracket balanced first so a ten-line object literal comes
 * along whole.
 */
function declarationEnd(source: string, from: number, braced: boolean): number {
  let braces = 0;
  let brackets = 0;
  let opened = false;
  let i = from;

  while (i < source.length) {
    const ch = source[i] as string;
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
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      i += 1;
      while (i < source.length) {
        if (source[i] === '\\') {
          i += 2;
          continue;
        }
        if (source[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    if (ch === '{') {
      braces++;
      opened = true;
    } else if (ch === '}') {
      braces--;
      if (braced && opened && braces === 0) return i + 1;
    } else if (ch === '(' || ch === '[') brackets++;
    else if (ch === ')' || ch === ']') brackets--;
    else if (!braced && braces === 0 && brackets === 0 && (ch === ';' || ch === '\n')) {
      return ch === ';' ? i + 1 : i;
    }
    i += 1;
  }
  return source.length;
}

/** Doc comment or `//` run directly above `line`, so it travels with the declaration. */
function commentAbove(lines: readonly string[], line: number): number {
  let first = line;
  for (let index = line - 1; index >= 1; index--) {
    const text = (lines[index - 1] ?? '').trim();
    if (text.startsWith('//') || text.startsWith('*') || text.startsWith('/*')) first = index;
    else break;
  }
  return first;
}

/**
 * Top-level declarations in the player's source, in order.
 *
 * Only the ones a work order could plausibly publish: something with a name, declared at column
 * zero-ish, that is not already an import. A statement in the middle of the program stays put —
 * publishing is for the code the player has already shaped into a subroutine.
 */
export function publishableDeclarations(
  source: string,
  hardware: readonly string[] = [],
): Declaration[] {
  const offsets = lineOffsets(source);
  const lines = source.split('\n');
  const tokens = scanIdentifiers(source);
  const found: Declaration[] = [];
  const hardwareSet = new Set(hardware);

  const moduleSpans = findModuleStatements(source).map((statement) => ({
    start: statement.start,
    end: statement.end,
  }));

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
    const end = declarationEnd(source, start, braced);
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
    });
  }

  /* `uses` is filled in a second pass: a declaration can reference one that appears below it. */
  const names = new Set(found.map((declaration) => declaration.name));
  for (const declaration of found) {
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
          .filter((each) => each !== declaration.name && names.has(each)),
      ),
    ].sort();
  }

  return found;
}

// ---------------------------------------------------------------------------
// Renaming
// ---------------------------------------------------------------------------

export function isValidName(name: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(name) && !KEYWORDS.has(name);
}

/** Renames a binding through real identifier positions, so strings and comments are left alone. */
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

// ---------------------------------------------------------------------------
// The rewrite
// ---------------------------------------------------------------------------

export interface PublishSelection {
  /** `Declaration.name`. */
  name: string;
  /** The name it will be published under. Defaults to `name`. */
  publishAs?: string;
}

export interface PublishPlan {
  /** `lib.ts` after the declarations are appended. */
  librarySource: string;
  /** The work order's source after the declarations are removed and the import added. */
  levelSource: string;
  /** Names as the Repository will hold them. */
  published: string[];
  /** Names already in the Repository, which the plan refuses to overwrite. */
  conflicts: string[];
  /** Declarations left behind that the published ones still reference. */
  missing: string[];
  /** Bot API the published code calls. */
  hardware: string[];
}

/** Names `lib.ts` already publishes, read from the source rather than from save data. */
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

/**
 * Builds both rewritten files.
 *
 * Removal happens from the bottom up so every earlier offset is still valid, and the import is
 * merged into an existing `from 'lib'` line when there is one rather than stacking a second.
 */
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

  /* Library first. Each declaration keeps its own text; a rename is applied inside that text only,
     which is safe because the declaration is self-contained by the time it is published. */
  const additions = chosen.map((each) => {
    const renamed = renameIdentifier(each.declaration.text, each.declaration.name, each.publishAs);
    const already = /^\s*export\b/.test(renamed);
    return `${already ? '' : 'export '}${renamed.trimEnd()}`;
  });

  const trimmedLibrary = options.librarySource.replace(PLACEHOLDER_EXPORT, '').trimEnd();
  const librarySource =
    additions.length === 0
      ? options.librarySource
      : `${trimmedLibrary}\n\n${additions.join('\n\n')}\n`;

  /* Then the work order: cut from the bottom so the offsets above stay true. */
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

  return {
    librarySource,
    levelSource: levelSource.replace(/\n{3,}/g, '\n\n'),
    published: chosen.map((each) => each.publishAs),
    conflicts,
    missing,
    hardware,
  };
}

/** Adds names to the work order's `import … from 'lib'`, creating the statement if there is none. */
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
