import { describe, expect, it } from 'vitest';

import { TILE_PX } from '../tiles.ts';
import { cacheTilePxFor, keysEqual } from '../terrain.ts';
import type { TerrainKey } from '../terrain.ts';

function key(over: Partial<TerrainKey> = {}): TerrainKey {
  return {
    cols: 12,
    rows: 9,
    biome: 'hangar',
    revision: 0,
    runs: 0,
    cacheTilePx: 48,
    art: 'flat',
    ...over,
  };
}

describe('terrain cache resolution', () => {
  it('never exceeds the atlas native size', () => {
    expect(cacheTilePxFor(192, 10, 10)).toBe(TILE_PX);
    expect(cacheTilePxFor(96, 30, 30)).toBe(TILE_PX);
  });

  it('matches the device size when zoomed out, so the blit is 1:1', () => {
    expect(cacheTilePxFor(16, 30, 30)).toBe(16);
    expect(cacheTilePxFor(24, 40, 40)).toBe(24);
  });

  it('keeps the offscreen canvas inside a sane budget on a huge grid', () => {
    for (const size of [30, 40, 64, 128]) {
      const tilePx = cacheTilePxFor(192, size, size);
      expect(tilePx * size).toBeLessThanOrEqual(4096);
    }
  });

  it('always returns a positive, whole number of pixels', () => {
    for (const device of [1, 6, 7, 17, 48, 300]) {
      const px = cacheTilePxFor(device, 20, 20);
      expect(px).toBeGreaterThan(0);
      expect(Number.isInteger(px)).toBe(true);
    }
  });
});

describe('layer invalidation key', () => {
  it('treats a null key as always stale', () => {
    expect(keysEqual(null, key())).toBe(false);
  });

  it('is stable when nothing changed', () => {
    expect(keysEqual(key(), key())).toBe(true);
  });

  it('invalidates when the tick crosses a tileChange', () => {
    expect(keysEqual(key({ revision: 0 }), key({ revision: 1 }))).toBe(false);
  });

  it('invalidates when a repair changes what a run carries', () => {
    expect(keysEqual(key({ runs: 0 }), key({ runs: 7 }))).toBe(false);
  });

  it('invalidates on zoom, biome or grid change', () => {
    expect(keysEqual(key(), key({ cacheTilePx: 24 }))).toBe(false);
    expect(keysEqual(key(), key({ biome: 'cave' }))).toBe(false);
    expect(keysEqual(key(), key({ cols: 13 }))).toBe(false);
    expect(keysEqual(key(), key({ rows: 10 }))).toBe(false);
  });
});
