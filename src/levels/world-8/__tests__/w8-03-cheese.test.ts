import { describe, expect, test } from 'vitest';
import type { ObjectiveContext, Trace } from '../../../engine/index.ts';
import { evaluateObjectives } from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { runReference } from '../../harness.ts';
import { SOLUTIONS } from '../../__tests__/solutions.ts';
import type { ReferenceSolution } from '../../types.ts';
import { w8_03 } from '../w8-03.ts';

function clockStar(result: ReturnType<typeof runReference>, trace: Trace): boolean {
  const ctx: ObjectiveContext = {
    world: result.world,
    trace,
    initialWorld: result.initialWorld,
    ops: result.ops,
  };
  const scored = evaluateObjectives(w8_03.bonus ?? [], ctx);
  return must(
    scored.find((star) => star.id === 'call-the-clock'),
    'call-the-clock',
  ).met;
}

describe('w8-03 reads the grid coming up off the first use of each station', () => {
  test('a station cycled off and on again after the grid is lit does not move the tick', () => {
    for (const seed of w8_03.seeds) {
      const result = runReference(w8_03, seed, SOLUTIONS['w8-03'] as ReferenceSolution);
      const last = must(
        [...result.trace.events]
          .reverse()
          .find((event) => event.kind === 'use' && event.ok && event.machineId !== null),
        'a use',
      );
      const later = result.trace.endTick + 100;
      const trace: Trace = {
        ...result.trace,
        endTick: later + 2,
        events: [
          ...result.trace.events,
          { ...last, t: later },
          { ...last, t: later + 2 },
        ] as Trace['events'],
      };

      expect(clockStar(result, result.trace), `seed ${String(seed)} untouched`).toBe(true);
      expect(clockStar(result, trace), `seed ${String(seed)} cycled`).toBe(true);
    }
  });
});
