import { test } from 'vitest';
import { runReference } from '../../harness.ts';
import { w7_02, lowerBound } from '../w7-02.ts';
import { solution } from '../__solutions__/w7-02.ts';

test('lb w7-02', () => {
  for (const seed of w7_02.seeds) {
    const r = runReference(w7_02, seed, solution);
    const ctx = { world: r.world, trace: r.trace, initialWorld: r.initialWorld };
    const bonus = (w7_02.bonus ?? [])[0]!.evaluate(ctx);
    console.log('seed', seed, 'ticks', r.ticks, 'LB', lowerBound(ctx), 'bonus', bonus);
  }
});
