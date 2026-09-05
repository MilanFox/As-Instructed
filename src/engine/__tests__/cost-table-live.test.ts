import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

import { DEFAULT_COSTS } from '../index.ts';

/**
 * Every `CostTable` key must be read by something that charges ticks.
 *
 * `CostTable` is the only surface a level has for repricing an action: `LevelDef.costs` is typed
 * as `Partial<CostTable>`, so a key that exists in the type but is read by nobody accepts an
 * override, type-checks, and then does exactly nothing. That is not a hypothetical — `link` and
 * `transmit` sat in `CostTable` for eight worlds while the bindings charged a literal copied out
 * of `api-spec.ts`, so `costs: { transmit: 3 }` was a silent no-op and any par tuned against it
 * was tuned against a price the engine never charged.
 *
 * This is a source-text check rather than a behavioural one on purpose. A behavioural version
 * would have to drive every verb to completion — spawn a bot, find an antenna, stand on a depot,
 * reach a machine that has a `use` cycle — and then diff the clock against a doubled cost. That is
 * seventeen bespoke fixtures, and the day someone adds an eighteenth verb the test does not fail;
 * it just quietly stops covering it, which is the exact failure mode being guarded against. Asking
 * "does anything read this key" is one line per key and cannot go stale, because the assertion is
 * driven by `Object.keys(DEFAULT_COSTS)` rather than by a hand-written list.
 *
 * Nothing is exempted. `turn` is priced at 0 and `wait` is a multiplier rather than a flat charge,
 * but both are *read* by the sim (`const dt = this.costs.turn`, `ticks * this.costs.wait`), so
 * they satisfy the same textual test as the other fifteen with no special case. A key that were
 * genuinely dead would fail here however small its number is.
 */
const CHARGE_SITES: readonly { path: string; receiver: string }[] = [
  { path: 'src/engine/sim.ts', receiver: 'this.costs.' },
  { path: 'src/runtime/api-bindings.ts', receiver: 'sim.costs.' },
];

const sources = CHARGE_SITES.map((site) => ({
  ...site,
  text: readFileSync(resolve(site.path), 'utf8'),
}));

/**
 * Matched with a trailing boundary so that `this.costs.moveBlocked` cannot be mistaken for a read
 * of `move`: a prefix match would let a dead key ride in on a longer live one.
 */
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
