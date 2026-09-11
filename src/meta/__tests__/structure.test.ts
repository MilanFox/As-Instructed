import { describe, expect, test } from 'vitest';
import { Medal } from '../../engine/index.ts';
import { emptyLibrary } from '../save.ts';
import { buildStructure } from '../structure.ts';
import type { LevelProfile, LibrarySave } from '../types.ts';

const COMPOSED = [
  '// The one opening that is not the way we came from.',
  'export function step(back: number): number {',
  '  return back;',
  '}',
  '',
  'export function advance(back: number): number {',
  '  const next = step(back);',
  '  move(next);',
  '  return next;',
  '}',
  '',
  'export function follow(): void {',
  '  let back = -1;',
  '  while (true) back = advance(back);',
  '}',
  '',
].join('\n');

function profile(overrides: Partial<LevelProfile> & { levelId: string }): LevelProfile {
  return {
    key: `key-${overrides.levelId}`,
    passed: true,
    ticks: 100,
    medal: Medal.Silver,
    parTicks: 90,
    usage: { ticks: 0, calls: {} },
    imports: [],
    at: 1,
    ...overrides,
  };
}

function saveWith(source: string, ...profiles: LevelProfile[]): LibrarySave {
  const save = emptyLibrary();
  save.source = source;
  for (const each of profiles) save.profiles[each.levelId] = each;
  return save;
}

const MEASURED = profile({
  levelId: 'w4-01',
  ticks: 100,
  imports: ['follow'],
  usage: {
    ticks: 100,
    calls: {
      follow: { calls: 1, ticks: 100 },
      advance: { calls: 50, ticks: 90 },
      step: { calls: 50, ticks: 10 },
    },
  },
});

const freshKeys = new Set(['key-w4-01']);

describe('reading the shape out of lib.ts', () => {
  const structure = buildStructure({ save: saveWith(COMPOSED, MEASURED), freshKeys });

  test('a subroutine built on two others is one root with a branch under it', () => {
    expect(structure.roots).toEqual(['follow']);
    expect(structure.rows.map((row) => [row.name, row.depth])).toEqual([
      ['follow', 0],
      ['advance', 1],
      ['step', 2],
    ]);
    expect(structure.flat).toBe(false);
  });

  test('cost is attributed through the graph', () => {
    const byName = new Map(structure.functions.map((each) => [each.name, each]));
    expect(byName.get('follow')?.ticks).toBe(100);
    expect(byName.get('follow')?.selfTicks).toBe(10);
    expect(byName.get('advance')?.selfTicks).toBe(80);
    expect(byName.get('step')?.selfTicks).toBe(10);
    expect(structure.rows.map((row) => row.share)).toEqual([100, 90, 10]);
  });

  test('the work orders that reach a root are named', () => {
    const byName = new Map(structure.functions.map((each) => [each.name, each]));
    expect(byName.get('follow')?.levels).toEqual(['w4-01']);
    expect(byName.get('step')?.levels).toEqual([]);
  });
});

describe('degrading gracefully', () => {
  test('two unrelated subroutines are two roots and nothing else', () => {
    const source = 'export function a(): void {}\n\nexport function b(): void {}\n';
    const structure = buildStructure({ save: saveWith(source), freshKeys: new Set() });
    expect(structure.roots).toEqual(['a', 'b']);
    expect(structure.rows.every((row) => row.depth === 0)).toBe(true);
    expect(structure.flat).toBe(true);
  });

  test('an empty Repository has no rows and does not throw', () => {
    const structure = buildStructure({ save: saveWith('export {};\n'), freshKeys: new Set() });
    expect(structure.rows).toEqual([]);
    expect(structure.functions).toEqual([]);
  });

  test('a subroutine that calls itself stops the branch instead of recursing forever', () => {
    const source = 'export function loop(n: number): number {\n  return loop(n - 1);\n}\n';
    const structure = buildStructure({ save: saveWith(source), freshKeys: new Set() });
    expect(structure.rows.map((row) => [row.name, row.recursive])).toEqual([['loop', false]]);
  });

  test('a cycle between two subroutines still draws', () => {
    const source = [
      'export function a(): void {',
      '  b();',
      '}',
      '',
      'export function b(): void {',
      '  a();',
      '}',
      '',
    ].join('\n');
    const structure = buildStructure({ save: saveWith(source), freshKeys: new Set() });
    expect(structure.roots).toEqual(['a', 'b']);
    expect(structure.rows.filter((row) => row.recursive).length).toBeGreaterThan(0);
  });

  test('a profile measured against an older library contributes no numbers', () => {
    const structure = buildStructure({
      save: saveWith(COMPOSED, MEASURED),
      freshKeys: new Set(['some-other-key']),
    });
    expect(structure.functions.every((each) => each.measured)).toBe(false);
    expect(structure.rows.every((row) => row.share === undefined)).toBe(true);
  });

  test('a helper a work order imports directly is a way in as well as a detail', () => {
    const structure = buildStructure({
      save: saveWith(COMPOSED, profile({ levelId: 'w4-01', imports: ['follow', 'step'] })),
      freshKeys,
    });
    expect(structure.roots).toEqual(['step', 'follow']);
  });
});
