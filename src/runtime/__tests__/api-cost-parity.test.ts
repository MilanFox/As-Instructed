import { describe, expect, test } from 'vitest';

import { DEFAULT_COSTS } from '../../engine/index.ts';
import { PLAYER_API } from '../api-spec.ts';

/**
 * What the player is *told* against what the player is *charged*.
 *
 * `api-spec.ts` carries a `cost` per function, which the docs panel renders as "2 ticks"; the sim
 * charges `DEFAULT_COSTS`. They are two hand-maintained tables holding the same fourteen numbers,
 * and nothing has ever forced them to agree. A balance pass that edits `DEFAULT_COSTS.use` from 2
 * to 3 leaves the docs panel quoting 2, and every player budgets a level's par against a price
 * that is no longer real.
 *
 * Three `CostTable` keys deliberately have no number to compare, and they are named rather than
 * skipped: `wait` is priced `'n'` in the spec because `wait(n)` costs `n` times the table entry
 * and a flat number would be a lie, while `turn` and `moveBlocked` are not player-callable
 * functions at all — turning is folded into `move`, and `moveBlocked` is what a refused move
 * charges. Asserting that the unmatched set is exactly those three is the point: a fourth key
 * falling out of the comparison is a drift, not a convention, and must fail here.
 */
const COSTS_WITHOUT_A_SPEC_NUMBER = ['moveBlocked', 'turn', 'wait'];
const COMPARED_PAIRS = 14;

type CostKey = keyof typeof DEFAULT_COSTS;

function isCostKey(name: string): name is CostKey {
  return name in DEFAULT_COSTS;
}

const compared = PLAYER_API.functions
  .filter((fn) => isCostKey(fn.name) && typeof fn.cost === 'number')
  .map((fn) => ({ name: fn.name as CostKey, told: fn.cost as number }));

describe('api-spec costs against the engine cost table', () => {
  test('every quoted price equals what the sim charges', () => {
    for (const { name, told } of compared) {
      expect(
        told,
        `api-spec quotes ${name} at ${told}, the sim charges ${DEFAULT_COSTS[name]}`,
      ).toBe(DEFAULT_COSTS[name]);
    }
  });

  test('the comparison covers every cost key that has a quoted price', () => {
    expect(compared).toHaveLength(COMPARED_PAIRS);

    const comparedNames = new Set(compared.map((pair) => pair.name));
    const unmatched = Object.keys(DEFAULT_COSTS)
      .filter((key) => !comparedNames.has(key as CostKey))
      .sort();
    expect(unmatched, `cost keys with no api-spec number: ${unmatched.join(', ')}`).toEqual(
      COSTS_WITHOUT_A_SPEC_NUMBER,
    );
  });

  test('the three unmatched keys are unmatched for the reason we think', () => {
    expect(PLAYER_API.functions.find((fn) => fn.name === 'wait')?.cost).toBe('n');
    expect(PLAYER_API.functions.find((fn) => fn.name === 'turn')).toBeUndefined();
    expect(PLAYER_API.functions.find((fn) => fn.name === 'moveBlocked')).toBeUndefined();
  });
});
