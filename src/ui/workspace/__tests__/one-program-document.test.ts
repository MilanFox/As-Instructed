import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const read = (path: string): string =>
  readFileSync(new URL(`../../../../${path}`, import.meta.url), 'utf8');

const MONACO_BODY = read('src/ui/workspace/MonacoBody.tsx');
const ADAPTERS = read('src/ui/adapters.ts');
const COMPILE = read('src/runtime/compile.ts');

// Slices one JSX opening tag out of a component, stepping over every `{ … }` so that a `>`
// inside a prop expression does not end it early.
function openingTag(source: string, name: string): string {
  const at = source.search(new RegExp(`<${name}\\b`));
  if (at === -1) throw new Error(`no <${name}> in the source`);
  let depth = 0;
  for (let i = at; i < source.length; i++) {
    const here = source[i];
    if (here === '{') depth += 1;
    else if (here === '}') depth -= 1;
    else if (here === '>' && depth === 0) return source.slice(at, i + 1);
  }
  throw new Error(`unterminated <${name}>`);
}

const carries = (tag: string, prop: string): boolean =>
  new RegExp(`(?:^|\\s)${prop}(?=[\\s=/>])`).test(tag);

const UI = new URL('../../', import.meta.url);

function sourcesUnder(directory: URL, prefix: string): { name: string; text: string }[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const here = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : sourcesUnder(here, `${prefix}${entry.name}/`);
    }
    if (!/\.tsx?$/.test(entry.name)) return [];
    return [{ name: `${prefix}${entry.name}`, text: readFileSync(here, 'utf8') }];
  });
}

const UI_SOURCES = sourcesUnder(UI, 'src/ui/');
const OWNERS = UI_SOURCES.filter((file) => file.text.includes('PLAYER_FILE_PATH'));

describe('one program document, and it outlives every editor that shows it', () => {
  test('the suite is reading the files that own the document', () => {
    expect(UI_SOURCES.length).toBeGreaterThan(20);
    expect(OWNERS.map((file) => file.name).sort()).toEqual([
      'src/ui/adapters.ts',
      'src/ui/workspace/MonacoBody.tsx',
    ]);
  });

  test('the editor is mounted on that path and no other', () => {
    const editor = openingTag(MONACO_BODY, 'Editor');

    expect(['path on <Editor>', /path=\{PLAYER_FILE_PATH\}/.test(editor)]).toEqual([
      'path on <Editor>',
      true,
    ]);
    expect(['<Editor> in MonacoBody.tsx', (MONACO_BODY.match(/<Editor\b/g) ?? []).length]).toEqual([
      '<Editor> in MonacoBody.tsx',
      1,
    ]);
  });

  // The typescript worker answers getEmitOutput from a program it caches against the document's
  // version. A disposed and recreated document restarts that version at 1, so the worker hands
  // back the program it built for the level before — the run executes the previous order's
  // source while the store, the model and the worker's mirror all read the new one.
  test('unmounting the editor does not take the document with it', () => {
    const editor = openingTag(MONACO_BODY, 'Editor');

    expect(['keepCurrentModel on <Editor>', carries(editor, 'keepCurrentModel')]).toEqual([
      'keepCurrentModel on <Editor>',
      true,
    ]);
  });

  test('the editor that comes back adopts the document and writes the open order into it', () => {
    expect([
      'onMount reconciles the kept document',
      /model\.getValue\(\) !== code\) model\.setValue\(code\)/.test(MONACO_BODY),
    ]).toEqual(['onMount reconciles the kept document', true]);
  });

  test('the runner edits that document in place instead of replacing it', () => {
    expect([
      'setValue on the existing model',
      /existing\.getValue\(\) !== code\) existing\.setValue\(code\)/.test(ADAPTERS),
    ]).toEqual(['setValue on the existing model', true]);
  });

  test('nothing that owns the document ever disposes one', () => {
    const offenders = OWNERS.filter((file) => /\w*[Mm]odel\w*\??\.dispose\(/.test(file.text)).map(
      (file) => file.name,
    );

    expect(offenders).toEqual([]);
  });

  test('the compile step reads the worker, not the string it was handed', () => {
    expect(['compilePlayerCode emits through the worker', /getEmitOutput\(/.test(COMPILE)]).toEqual([
      'compilePlayerCode emits through the worker',
      true,
    ]);
  });
});

const UNKEPT_FIXTURE = `
  return (
    <Editor
      key={level?.id ?? 'none'}
      path={PLAYER_FILE_PATH}
      value={code}
      onValidate={(markers) => onProblems?.(markers.filter((m) => m.severity === 8).length)}
      loading={<span>opening the terminal…</span>}
    />
  );
`;

describe('the scan can tell a kept document from one the editor throws away', () => {
  const editor = openingTag(UNKEPT_FIXTURE, 'Editor');

  test('an editor without the prop is reported', () => {
    expect(carries(editor, 'keepCurrentModel')).toBe(false);
  });

  test('a prop expression carrying its own angle brackets does not cut the tag short', () => {
    expect(carries(editor, 'loading')).toBe(true);
    expect(carries(editor, 'onValidate')).toBe(true);
  });

  test('a prop is not matched by a longer name that merely contains it', () => {
    expect(carries(editor, 'value')).toBe(true);
    expect(carries(editor, 'alue')).toBe(false);
  });
});
