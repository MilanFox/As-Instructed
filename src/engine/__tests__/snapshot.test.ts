import { describe, expect, test } from 'vitest';
import type { Snapshot } from '../index.ts';
import {
  SNAPSHOT_MAX_DEPTH,
  SNAPSHOT_MAX_ENTRIES,
  SNAPSHOT_MAX_NODES,
  SNAPSHOT_MAX_STRING,
  snapshot,
} from '../index.ts';

function nest(depth: number): unknown {
  let value: unknown = 'floor';
  for (let i = 0; i < depth; i++) value = { down: value };
  return value;
}

function deepest(value: Snapshot): Snapshot {
  let at = value;
  while (at !== null && typeof at === 'object' && at.$ === 'object') {
    const next = at.entries[0]?.[1];
    if (next === undefined) break;
    at = next;
  }
  return at;
}

describe('snapshot', () => {
  test('keeps finite numbers, strings, booleans and null as themselves', () => {
    expect([1.5, 'hi', true, null].map((value) => snapshot(value))).toEqual([
      1.5,
      'hi',
      true,
      null,
    ]);
  });

  test('tags the values structured clone or JSON would lose', () => {
    expect(snapshot(undefined)).toEqual({ $: 'undefined' });
    expect(snapshot(Number.NaN)).toEqual({ $: 'number', value: 'NaN' });
    expect(snapshot(Number.POSITIVE_INFINITY)).toEqual({ $: 'number', value: 'Infinity' });
    expect(snapshot(-0)).toEqual({ $: 'number', value: '-0' });
    expect(snapshot(10n)).toEqual({ $: 'bigint', value: '10' });
    expect(snapshot(Symbol('mark'))).toEqual({ $: 'symbol', description: 'mark' });
  });

  test('stands a function in with its name', () => {
    function hop(): void {}
    expect(snapshot({ hop })).toEqual({
      $: 'object',
      ctor: null,
      entries: [['hop', { $: 'function', name: 'hop' }]],
      omitted: 0,
    });
  });

  test('marks a cycle instead of following it', () => {
    const loop: Record<string, unknown> = { name: 'loop' };
    loop['self'] = loop;
    expect(snapshot(loop)).toEqual({
      $: 'object',
      ctor: null,
      entries: [
        ['name', 'loop'],
        ['self', { $: 'cycle' }],
      ],
      omitted: 0,
    });
  });

  test('copies a shared but acyclic reference both times', () => {
    const at = { x: 1, y: 2 };
    const encoded = snapshot([at, at]);
    expect(encoded).toMatchObject({ $: 'array', length: 2, omitted: 0 });
    const items = (encoded as { items: Snapshot[] }).items;
    expect(items[0]).toEqual(items[1]);
  });

  test('cuts off past the depth limit and says so', () => {
    expect(deepest(snapshot(nest(SNAPSHOT_MAX_DEPTH + 3)))).toEqual({
      $: 'truncated',
      reason: 'depth',
    });
    expect(deepest(snapshot(nest(SNAPSHOT_MAX_DEPTH)))).toBe('floor');
  });

  test('keeps the first entries of a long array and counts the rest', () => {
    const encoded = snapshot(Array.from({ length: SNAPSHOT_MAX_ENTRIES + 10 }, (_, i) => i));
    expect(encoded).toMatchObject({ $: 'array', length: SNAPSHOT_MAX_ENTRIES + 10, omitted: 10 });
    expect((encoded as { items: Snapshot[] }).items).toHaveLength(SNAPSHOT_MAX_ENTRIES);
  });

  test('clips a long string and keeps its full length', () => {
    const encoded = snapshot('x'.repeat(SNAPSHOT_MAX_STRING + 5));
    expect(encoded).toMatchObject({ $: 'string', length: SNAPSHOT_MAX_STRING + 5, omitted: 5 });
  });

  test('stops at the node budget with an explicit marker', () => {
    const wide = Array.from({ length: 60 }, () => Array.from({ length: 60 }, (_, i) => i));
    const text = JSON.stringify(snapshot(wide));
    expect(text).toContain('"reason":"size"');
    expect(text.match(/,/g)?.length ?? 0).toBeLessThan(SNAPSHOT_MAX_NODES * 3);
  });

  test('does not run getters', () => {
    let reads = 0;
    const sneaky = {
      get value(): number {
        reads += 1;
        return 1;
      },
    };
    expect(snapshot(sneaky)).toMatchObject({ entries: [['value', { $: 'getter' }]] });
    expect(reads).toBe(0);
  });

  test('names class instances, maps, sets and errors', () => {
    class Crate {
      size = 2;
    }
    expect(snapshot(new Crate())).toMatchObject({ $: 'object', ctor: 'Crate' });
    expect(snapshot(new Map([['a', 1]]))).toEqual({
      $: 'map',
      entries: [['a', 1]],
      size: 1,
      omitted: 0,
    });
    expect(snapshot(new Set([1]))).toEqual({ $: 'set', items: [1], size: 1, omitted: 0 });
    expect(snapshot(new RangeError('far'))).toEqual({
      $: 'error',
      name: 'RangeError',
      message: 'far',
    });
  });

  test('survives structuredClone and JSON unchanged', () => {
    const loop: Record<string, unknown> = { f: () => 1, n: Number.NaN, u: undefined };
    loop['loop'] = loop;
    const encoded = snapshot([loop, new Map([[1, new Set([2])]])]);
    expect(structuredClone(encoded)).toEqual(encoded);
    expect(JSON.parse(JSON.stringify(encoded))).toEqual(encoded);
  });
});
