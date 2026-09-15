import { describe, expect, it } from 'vitest';

import {
  PLAYER_API,
  apiFunctionsFor,
  requiredTypesFor,
  unlockedApiNames,
} from '../../../runtime/index.ts';
import { typeParts } from '../api.ts';

const NAMES = PLAYER_API.types.map((type) => type.name);

function linked(text: string, names: readonly string[] = NAMES): string[] {
  return typeParts(text, names)
    .filter((part) => part.type !== null)
    .map((part) => part.text);
}

describe('typeParts', () => {
  it('links every type a signature names, and nothing else', () => {
    expect(linked('scan(dir?: Dir, range?: number): TileView[]')).toEqual(['Dir', 'TileView']);
    expect(linked('pos(): Vec')).toEqual(['Vec']);
    expect(linked('print(text: string): void')).toEqual([]);
  });

  it('rebuilds the original text from its parts', () => {
    const signature = 'pickup(kind?: ItemKind, count?: number): ItemKind | null';
    expect(
      typeParts(signature, NAMES)
        .map((part) => part.text)
        .join(''),
    ).toBe(signature);
  });

  it('matches whole words only', () => {
    expect(linked('vector(v: Vectors): Vec')).toEqual(['Vec']);
  });

  it('links nothing when no type is known yet', () => {
    expect(typeParts('move(dir: Dir): boolean', [])).toEqual([
      { text: 'move(dir: Dir): boolean', type: null },
    ]);
  });
});

describe('the manual can resolve every link it draws', () => {
  it('declares each type the unlocked hardware puts in a signature', () => {
    for (const level of ['w1-01', 'w4-02', 'w6-03', 'w8-05']) {
      const installed = apiFunctionsFor(unlockedApiNames(level));
      const shown = new Set(requiredTypesFor(installed).map((type) => type.name));
      for (const fn of installed) {
        const signature = `${fn.name}(${fn.params.map((p) => p.type).join(', ')}): ${fn.returns}`;
        for (const name of linked(signature)) {
          expect(shown.has(name), `${level}: ${fn.name} names ${name}`).toBe(true);
        }
      }
    }
  });
});
