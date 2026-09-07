/**
 * World 6's bonus stars, from both sides.
 *
 * This world had no `bonus.test.ts` at all, and that is why all four of its stars sat on the list
 * of bonuses nothing proved could be taken: `divergence.test.ts` pins what each one says when it
 * is *missed*, and nothing anywhere asserted that any program takes one. All four turn out to be
 * earned by the shipped reference on every declared seed, inside par — the gap was in the suite,
 * not in the levels. `TODO.md`'s "Assumed working, never verified" list carries the write-up and
 * the ten that are still only assumed.
 *
 * `name-the-fault` is first because every other bonus in the game is held to its standard.
 * A standard-setter nothing proves is reachable is not a standard.
 */
import { describe, expect, test } from 'vitest';
import type { Sim } from '../../../engine/index.ts';
import { evaluateObjectives } from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { runLevel, runReference } from '../../harness.ts';
import { SOLUTIONS } from '../../__tests__/solutions.ts';
import type { LevelDef, ReferenceSolution } from '../../types.ts';
import { w6_02 } from '../w6-02.ts';
import { w6_03 } from '../w6-03.ts';
import { w6_04 } from '../w6-04.ts';
import { w6_05 } from '../w6-05.ts';

function starOf(level: LevelDef, id: string, result: ReturnType<typeof runLevel>): boolean {
  const stars = evaluateObjectives(level.bonus ?? [], {
    world: result.world,
    initialWorld: result.initialWorld,
    trace: result.trace,
    ops: result.ops,
  });
  return must(
    stars.find((star) => star.id === id),
    id,
  ).met;
}

/** The shipped reference takes the star on every declared seed, and stays inside par doing it. */
function referenceEarns(level: LevelDef, id: string): void {
  const solution = SOLUTIONS[level.id] as ReferenceSolution;
  for (const seed of level.seeds) {
    const result = runReference(level, seed, solution);
    expect(result.verdict.passed, `seed ${String(seed)}`).toBe(true);
    expect(result.ticks, `seed ${String(seed)}`).toBeLessThanOrEqual(level.par.ticks);
    expect(starOf(level, id, result), `seed ${String(seed)}`).toBe(true);
  }
}

/** A program that plays no level at all. */
const idle = (sim: Sim, botId: number): void => {
  sim.print(botId, '.');
};

describe('w6-02 name-the-fault', () => {
  test('the reference solution earns it on every seed, still inside par', () => {
    referenceEarns(w6_02, 'name-the-fault');
  });

  /**
   * The same relay, packet for packet and tick for tick, with only its `bad` lines dropped from
   * the trace. Filing the report is free — `print` costs no tick — so this isolates the one
   * variable the star grades and shows the star cannot be a tax on the medal.
   *
   * Seed 2 is the exception and it is deliberate: `build` sets the corruption rate to zero there,
   * so the band is clean, there is nothing to report, and the predicate is vacuously true. That
   * is a do-nothing hole, sitting in the one bonus every other bonus in the game is held
   * against. It is harmless in play — a run that files nothing
   * still has to relay all thirty-seven packets to pass, and a failed run banks no star — and it
   * is pinned here rather than left to be rediscovered.
   */
  test('the same run without its fault lines is refused wherever there is a fault to name', () => {
    const solution = SOLUTIONS[w6_02.id] as ReferenceSolution;
    const met: Record<number, boolean> = {};
    for (const seed of w6_02.seeds) {
      const result = runReference(w6_02, seed, solution);
      const events = result.trace.events.filter(
        (event) => !(event.kind === 'print' && event.text.startsWith('bad ')),
      );
      const stars = evaluateObjectives(w6_02.bonus ?? [], {
        world: result.world,
        initialWorld: result.initialWorld,
        trace: { ...result.trace, events },
        ops: result.ops,
      });
      expect(result.verdict.passed, `seed ${String(seed)}`).toBe(true);
      met[seed] = must(stars[0], 'the star').met;
    }
    expect(met).toEqual({ 1: false, 2: true, 3: false, 4: false });
  });

  test('an idle program is refused on every seed that has a corrupt packet', () => {
    for (const seed of [1, 3, 4]) {
      const result = runLevel(w6_02, seed, idle);
      expect(result.verdict.passed, `seed ${String(seed)}`).toBe(false);
      expect(starOf(w6_02, 'name-the-fault', result), `seed ${String(seed)}`).toBe(false);
    }
  });
});

describe('w6-03 shorter-encoding', () => {
  test('the reference solution earns it on every seed, still inside par', () => {
    referenceEarns(w6_03, 'shorter-encoding');
  });

  test('an idle program is refused on every seed', () => {
    for (const seed of w6_03.seeds) {
      const result = runLevel(w6_03, seed, idle);
      expect(result.verdict.passed, `seed ${String(seed)}`).toBe(false);
      expect(starOf(w6_03, 'shorter-encoding', result), `seed ${String(seed)}`).toBe(false);
    }
  });
});

describe('w6-04 straggler', () => {
  test('the reference solution earns it on every seed, still inside par', () => {
    referenceEarns(w6_04, 'straggler');
  });

  test('an idle program is refused on every seed', () => {
    for (const seed of w6_04.seeds) {
      const result = runLevel(w6_04, seed, idle);
      expect(result.verdict.passed, `seed ${String(seed)}`).toBe(false);
      expect(starOf(w6_04, 'straggler', result), `seed ${String(seed)}`).toBe(false);
    }
  });
});

describe('w6-05 repair-blocks', () => {
  test('the reference solution earns it on every seed, still inside par', () => {
    referenceEarns(w6_05, 'repair-blocks');
  });

  test('an idle program is refused on every seed', () => {
    for (const seed of w6_05.seeds) {
      const result = runLevel(w6_05, seed, idle);
      expect(result.verdict.passed, `seed ${String(seed)}`).toBe(false);
      expect(starOf(w6_05, 'repair-blocks', result), `seed ${String(seed)}`).toBe(false);
    }
  });
});
