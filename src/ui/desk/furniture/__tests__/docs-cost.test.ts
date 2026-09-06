import { describe, expect, it } from 'vitest';

import { LEVELS } from '../../../../levels/index.ts';
import { apiFunction } from '../../../../runtime/api-spec.ts';
import { levelCost } from '../reference.ts';

function spec(name: string) {
  const fn = apiFunction(name);
  if (!fn) throw new Error(`no api-spec entry for ${name}`);
  return fn;
}

function costsFor(id: string) {
  return LEVELS.find((level) => level.id === id)?.costs;
}

describe('levelCost', () => {
  it('falls back to the campaign-wide price when the level overrides nothing', () => {
    expect(levelCost(spec('use'), undefined)).toBe(spec('use').cost);
    expect(levelCost(spec('use'), {})).toBe(spec('use').cost);
  });

  it('shows the finale its own halved `use` price rather than the default', () => {
    expect(spec('use').cost).toBe(2);
    expect(levelCost(spec('use'), costsFor('w8-05'))).toBe(1);
    expect(levelCost(spec('use'), costsFor('w7-04'))).toBe(1);
  });

  it('shows w7-02 its own cheaper `spawn`', () => {
    expect(spec('spawn').cost).toBe(5);
    expect(levelCost(spec('spawn'), costsFor('w7-02'))).toBe(2);
  });

  it('leaves a non-numeric price alone — `wait` is a multiplier, not a tick count', () => {
    expect(spec('wait').cost).toBe('n');
    expect(levelCost(spec('wait'), { wait: 3 })).toBe('n');
  });

  it('ignores an override that does not name this function', () => {
    expect(levelCost(spec('mine'), { use: 1 })).toBe(spec('mine').cost);
  });
});
