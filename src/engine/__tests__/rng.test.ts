import { describe, expect, test } from 'vitest';
import { Rng } from '../index.ts';

function draw(rng: Rng, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(rng.next());
  return out;
}

describe('Rng determinism', () => {
  test('two generators with the same seed produce identical sequences', () => {
    expect(draw(new Rng(12345), 50)).toEqual(draw(new Rng(12345), 50));
  });

  test('different seeds produce different sequences', () => {
    expect(draw(new Rng(1), 20)).not.toEqual(draw(new Rng(2), 20));
  });

  test('negative and non-uint32 seeds are coerced, not rejected', () => {
    expect(new Rng(-1).state).toBe(0xffffffff);
    expect(draw(new Rng(-1), 5)).toEqual(draw(new Rng(0xffffffff), 5));
  });

  test('next() stays in [0, 1)', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 2000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('Rng.clone', () => {
  test('a clone continues the same sequence', () => {
    const original = new Rng(99);
    draw(original, 10);
    const copy = original.clone();
    expect(draw(copy, 10)).toEqual(draw(original.clone(), 10));
  });

  test('a clone diverges independently from its source', () => {
    const original = new Rng(99);
    const copy = original.clone();
    expect(copy).toBeInstanceOf(Rng);
    expect(copy).not.toBe(original);
    expect(copy.state).toBe(original.state);

    const fromCopy = draw(copy, 5);
    expect(original.state).toBe(new Rng(99).state);
    expect(copy.state).not.toBe(original.state);

    const fromOriginal = draw(original, 5);
    expect(fromOriginal).toEqual(fromCopy);
    expect(original.state).toBe(copy.state);
  });
});

describe('Rng snapshot / fromState', () => {
  test('fromState(snapshot()) resumes exactly', () => {
    const rng = new Rng(4242);
    draw(rng, 17);
    const snapshot = rng.snapshot();
    const resumed = Rng.fromState(snapshot);
    expect(draw(resumed, 25)).toEqual(draw(rng, 25));
  });

  test('a snapshot is a value, not a live view', () => {
    const rng = new Rng(5);
    const snapshot = rng.snapshot();
    draw(rng, 10);
    expect(snapshot.state).toBe(new Rng(5).state);
    expect(Rng.fromState(snapshot).state).toBe(new Rng(5).state);
  });
});

describe('Rng.int', () => {
  test('stays inside the inclusive range over many draws', () => {
    const rng = new Rng(2024);
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const value = rng.int(3, 7);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(7);
      seen.add(value);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([3, 4, 5, 6, 7]);
  });

  test('a single-value range always returns that value', () => {
    const rng = new Rng(1);
    for (let i = 0; i < 50; i++) expect(rng.int(9, 9)).toBe(9);
  });

  test('returns min when max < min', () => {
    const rng = new Rng(1);
    expect(rng.int(10, 2)).toBe(10);
    expect(rng.int(0, -5)).toBe(0);
  });

  test('an inverted range does not consume the stream', () => {
    const rng = new Rng(77);
    const before = rng.state;
    rng.int(5, 1);
    expect(rng.state).toBe(before);
  });

  test('negative ranges work', () => {
    const rng = new Rng(31);
    for (let i = 0; i < 500; i++) {
      const value = rng.int(-4, -1);
      expect(value).toBeGreaterThanOrEqual(-4);
      expect(value).toBeLessThanOrEqual(-1);
    }
  });
});

describe('Rng.chance', () => {
  test('is deterministic for a given seed', () => {
    const a = new Rng(8);
    const b = new Rng(8);
    for (let i = 0; i < 100; i++) expect(a.chance(0.3)).toBe(b.chance(0.3));
  });

  test('p = 0 is never true and p = 1 is always true', () => {
    const rng = new Rng(8);
    for (let i = 0; i < 100; i++) expect(rng.chance(0)).toBe(false);
    for (let i = 0; i < 100; i++) expect(rng.chance(1)).toBe(true);
  });
});

describe('Rng.pick', () => {
  test('throws on an empty array', () => {
    expect(() => new Rng(1).pick([])).toThrow('Rng.pick called with an empty array');
  });

  test('only ever returns members of the input', () => {
    const rng = new Rng(555);
    const items = ['a', 'b', 'c'] as const;
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const chosen = rng.pick(items);
      expect(items).toContain(chosen);
      seen.add(chosen);
    }
    expect(seen.size).toBe(3);
  });

  test('is reproducible for a given seed', () => {
    const items = [1, 2, 3, 4, 5];
    const a = new Rng(9);
    const b = new Rng(9);
    for (let i = 0; i < 30; i++) expect(a.pick(items)).toBe(b.pick(items));
  });
});

describe('Rng.shuffle', () => {
  const source = [1, 2, 3, 4, 5, 6, 7, 8];

  test('does not mutate its input', () => {
    const input = source.slice();
    const rng = new Rng(123);
    const result = rng.shuffle(input);
    expect(input).toEqual(source);
    expect(result).not.toBe(input);
  });

  test('is a permutation of the input', () => {
    const rng = new Rng(4);
    for (let i = 0; i < 100; i++) {
      const result = rng.shuffle(source);
      expect(result).toHaveLength(source.length);
      expect(result.slice().sort((a, b) => a - b)).toEqual(source);
    }
  });

  test('is reproducible for a given seed', () => {
    expect(new Rng(31337).shuffle(source)).toEqual(new Rng(31337).shuffle(source));
  });

  test('actually reorders things for at least some seeds', () => {
    const rng = new Rng(2);
    const anyReordered = Array.from({ length: 20 }, () => rng.shuffle(source)).some(
      (result) => !result.every((v, i) => v === source[i]),
    );
    expect(anyReordered).toBe(true);
  });

  test('an empty or single-element input is returned as a fresh copy', () => {
    const rng = new Rng(1);
    expect(rng.shuffle([])).toEqual([]);
    expect(rng.shuffle(['only'])).toEqual(['only']);
  });
});
