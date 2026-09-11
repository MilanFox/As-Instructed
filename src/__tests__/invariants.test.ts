import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { DIRECTIONS } from '../render/theme.ts';
import { PLAYER_API } from '../runtime/api-spec.ts';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SRC = join(ROOT, 'src');
const SCANNED = /\.(ts|tsx|css)$/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (SCANNED.test(entry.name)) out.push(full);
  }
  return out;
}

function repoPath(full: string): string {
  return relative(ROOT, full).split(sep).join('/');
}

function read(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}

test('a constant declared in two files has one value', () => {
  const declaration = /^\s*(export\s+)?const ([A-Z][A-Z0-9_]*) = (-?\d+(?:\.\d+)?);/gm;
  const byName = new Map<string, Map<string, string>>();
  const exported = new Set<string>();
  for (const full of sourceFiles(SRC)) {
    if (!/\.tsx?$/.test(full)) continue;
    const file = repoPath(full);
    for (const [, exports, name, value] of readFileSync(full, 'utf8').matchAll(declaration)) {
      if (exports) exported.add(name as string);
      const seen = byName.get(name as string) ?? new Map<string, string>();
      seen.set(file, value as string);
      byName.set(name as string, seen);
    }
  }

  const disagreeing = [...byName]
    .filter(([name, seen]) => exported.has(name) && new Set(seen.values()).size > 1)
    .map(([name, seen]) => `${name}: ${[...seen].map(([f, v]) => `${f}=${v}`).join(', ')}`);
  expect(disagreeing).toEqual([]);

  for (const name of ['MEDAL_BEAT', 'BASE_TICKS_PER_SECOND']) {
    expect([name, byName.get(name)?.size]).toEqual([name, 2]);
  }
});

test('the silver rule the player is shown states both halves of it', () => {
  const shown = read('src/ui/desk/furniture/reference.ts')
    .split('\n')
    .filter((line) => /silver/i.test(line))
    .join('\n');
  expect(shown.length).toBeGreaterThan(0);
  expect(['multiplier', /1\.25|quarter/i.test(shown)]).toEqual(['multiplier', true]);
  expect(['the par + 1 floor', /par \+ 1|one tick/i.test(shown)]).toEqual([
    'the par + 1 floor',
    true,
  ]);
});

test('a constant with one authoritative home has only that home', () => {
  const expected: Record<string, string[]> = {
    SILVER_FACTOR: ['src/engine/verdict.ts'],
    FUEL_BURNING: ['src/engine/trace.ts'],
  };
  for (const [name, sites] of Object.entries(expected)) {
    const declaration = new RegExp(`^\\s*(?:export\\s+)?const ${name}\\b`, 'm');
    const found = sourceFiles(SRC)
      .filter((full) => /\.tsx?$/.test(full))
      .filter((full) => declaration.test(readFileSync(full, 'utf8')))
      .map(repoPath)
      .sort();
    expect([name, found]).toEqual([name, [...sites].sort()]);
  }
});

test('the palette is the same twelve colours in the canvas and the stylesheet', () => {
  const tokens = read('src/ui/styles/tokens.css');

  const kebab = (key: string): string => `--${key.replace(/([A-Z0-9])/g, '-$1').toLowerCase()}`;
  const cssValue = (text: string, name: string): string | undefined =>
    new RegExp(`${name}:\\s*(#[0-9a-f]{3,8})`, 'i').exec(text)?.[1]?.toLowerCase();

  const baseline = DIRECTIONS.standard.palette;
  const keys = Object.keys(baseline);
  expect(keys.length).toBe(12);
  for (const key of keys) {
    const name = kebab(key);
    const canvas = baseline[key as keyof typeof baseline].toLowerCase();
    expect([name, 'tokens.css', cssValue(tokens, name)]).toEqual([name, 'tokens.css', canvas]);
  }
});

test('CelebrationKind is spelled the same on both sides of the port', () => {
  const union = (path: string): string[] => {
    const found = /export type CelebrationKind = ([^;]+);/.exec(read(path))?.[1];
    return (found ?? '').split('|').map((member) => member.trim());
  };
  const port = union('src/game/ports.ts');
  expect(port.length).toBeGreaterThan(1);
  expect(union('src/render/renderer.ts')).toEqual(port);
});

const MIRRORED_VIEWS = ['Vec', 'ItemStack', 'TileView', 'MachineView', 'Message'];

test('every hand-written declaration has the fields the engine interface has', () => {
  const engine = [read('src/engine/sim.ts'), read('src/engine/types.ts')].join('\n');

  const body = (source: string, name: string): string | undefined => {
    const opening = new RegExp(`interface ${name} \\{`).exec(source);
    if (!opening) return undefined;
    const from = opening.index + opening[0].length;
    return source.slice(from, source.indexOf('\n}', from));
  };
  const fields = (block: string): string[] =>
    [...block.matchAll(/^ {2}(\w+)\??:/gm)].map((found) => found[1] as string);

  const handWritten = PLAYER_API.types
    .filter((type) => type.declaration.startsWith('interface '))
    .map((type) => type.name);
  expect(handWritten).toEqual([...MIRRORED_VIEWS, 'Bot']);

  for (const name of MIRRORED_VIEWS) {
    const spec = PLAYER_API.types.find((type) => type.name === name)?.declaration ?? '';
    const declared = body(spec, name);
    const real = body(engine, name);
    expect([name, 'declared', declared !== undefined]).toEqual([name, 'declared', true]);
    expect([name, 'in the engine', real !== undefined]).toEqual([name, 'in the engine', true]);
    expect([name, fields(declared ?? '')]).toEqual([name, fields(real ?? '')]);
  }
});
