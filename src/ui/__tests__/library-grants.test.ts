import { describe, expect, it } from 'vitest';
import type { RegressionEntry, SuiteResult } from '../../meta/index.ts';
import { sweptClean } from '../library.ts';

function suite(entries: RegressionEntry[], cancelled?: boolean): SuiteResult {
  return {
    run: {
      revisionId: 'r1',
      startedAt: 1,
      finishedAt: 2,
      entries,
      ...(cancelled === undefined ? {} : { cancelled }),
    },
    summary: {
      total: entries.length,
      broken: 0,
      degraded: 0,
      improved: 0,
      nominal: entries.length,
      cached: 0,
    },
    cache: [],
    profiles: [],
  };
}

const nominal: RegressionEntry = { levelId: 'w4-01', state: 'nominal' };
const broken: RegressionEntry = { levelId: 'w4-02', state: 'broken' };
const degraded: RegressionEntry = { levelId: 'w4-03', state: 'degraded' };

describe('the sweep that came back clean', () => {
  it('is a clean sweep over at least one closed work order', () => {
    expect(sweptClean(suite([nominal, nominal]))).toBe(true);
  });

  it('is nothing at all when the library has no closed reader', () => {
    expect(sweptClean(null)).toBe(false);
    expect(sweptClean(suite([]))).toBe(false);
  });

  it('is withheld when an order no longer closes, or closes worse', () => {
    expect(sweptClean(suite([nominal, broken]))).toBe(false);
    expect(sweptClean(suite([nominal, degraded]))).toBe(false);
  });

  it('is withheld when the sweep was called off before it finished', () => {
    expect(sweptClean(suite([nominal], true))).toBe(false);
  });
});
