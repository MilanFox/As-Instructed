import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

import { DEFAULT_COSTS } from '../index.ts';

const CHARGE_SITES: readonly { path: string; receiver: string }[] = [
  { path: 'src/engine/sim.ts', receiver: 'this.costs.' },
  { path: 'src/runtime/api-bindings.ts', receiver: 'sim.costs.' },
];

const sources = CHARGE_SITES.map((site) => ({
  ...site,
  text: readFileSync(resolve(site.path), 'utf8'),
}));

function chargeSitesFor(key: string): string[] {
  return sources
    .filter((source) =>
      new RegExp(`${escapeForRegExp(source.receiver + key)}(?![A-Za-z0-9_])`).test(source.text),
    )
    .map((source) => source.path);
}

function escapeForRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('CostTable reachability', () => {
  test('every source scanned is a real, non-empty file', () => {
    for (const source of sources) {
      expect(source.text.length, source.path).toBeGreaterThan(0);
      expect(source.text, source.path).toContain(source.receiver);
    }
  });

  test('every DEFAULT_COSTS key is read at a site that charges ticks', () => {
    const keys = Object.keys(DEFAULT_COSTS);
    expect(keys.length).toBeGreaterThan(0);

    const unreachable = keys.filter((key) => chargeSitesFor(key).length === 0);
    expect(unreachable, `unreachable CostTable keys: ${unreachable.join(', ')}`).toEqual([]);
  });
});
