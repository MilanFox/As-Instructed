/**
 * World 5's bonus star, from both sides: a run that earns it and a run that does not.
 *
 * `w5-05` is the only World 5 star this pass
 * reworked; the rest are left alone. A bonus every passing run collects is
 * confetti, so this one is pinned by a pair — the shipped reference earns it on every declared
 * seed, and a *correct, gold-taking* program that did not have the second idea is refused.
 */
import { describe, expect, test } from 'vitest';
import type { ObjectiveContext, Sim } from '../../../engine/index.ts';
import { evaluateObjectives } from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { runLevel, runReference } from '../../harness.ts';
import { SOLUTIONS } from '../../__tests__/solutions.ts';
import type { ReferenceSolution } from '../../types.ts';
import { w5_05 } from '../w5-05.ts';

const STAR = 'name-the-weak-link';

function scored(seed: number, drive: (sim: Sim, bot: number) => void) {
  const result = runLevel(w5_05, seed, drive);
  const ctx: ObjectiveContext = {
    world: result.world,
    trace: result.trace,
    initialWorld: result.initialWorld,
    ops: result.ops,
  };
  return {
    passed: result.verdict.passed,
    ticks: result.trace.endTick,
    met: must(evaluateObjectives(w5_05.bonus ?? [], ctx)[0], STAR).met,
  };
}

/**
 * The shipped reference run with its own outage line rewritten or dropped.
 *
 * Every correct program for this district is Prim — the level's own third hint says so — so the
 * honest missability test is not "a different tree". It is *this* tree, cable for cable and tick
 * for tick, with only the sentence it files about itself changed.
 */
function reportedAs(seed: number, rewrite: (line: string) => string | null) {
  const solution = SOLUTIONS[w5_05.id] as ReferenceSolution;
  const result = runReference(w5_05, seed, solution);
  const events = result.trace.events.flatMap((event) => {
    if (event.kind !== 'print' || !event.text.startsWith('weak ')) return [event];
    const line = rewrite(event.text);
    return line === null ? [] : [{ ...event, text: line }];
  });
  const stars = evaluateObjectives(w5_05.bonus ?? [], {
    world: result.world,
    initialWorld: result.initialWorld,
    trace: { ...result.trace, events },
    ops: result.ops,
  });
  return {
    passed: result.verdict.passed,
    ticks: result.trace.endTick,
    met: must(stars[0], STAR).met,
  };
}

describe('w5-05 name-the-weak-link', () => {
  test('the reference solution earns it on every seed, still inside par', () => {
    const solution = SOLUTIONS[w5_05.id] as ReferenceSolution;
    for (const seed of w5_05.seeds) {
      const result = runReference(w5_05, seed, solution);
      const stars = evaluateObjectives(w5_05.bonus ?? [], {
        world: result.world,
        initialWorld: result.initialWorld,
        trace: result.trace,
        ops: result.ops,
      });
      expect(result.verdict.passed, `seed ${String(seed)}`).toBe(true);
      expect(result.ticks, `seed ${String(seed)}`).toBeLessThanOrEqual(w5_05.par.ticks);
      expect(must(stars[0], STAR).met, `seed ${String(seed)}`).toBe(true);
    }
  });

  /** Filing the report is free — `print` costs no tick — so the star can never tax the medal. */
  test('the same tree without its outage line lights the district and is refused', () => {
    for (const seed of w5_05.seeds) {
      const run = reportedAs(seed, () => null);
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.ticks, `seed ${String(seed)}`).toBeLessThanOrEqual(w5_05.par.ticks);
      expect(run.met, `seed ${String(seed)}`).toBe(false);
    }
  });

  /** Naming the right station and guessing the load is refused: both halves are the answer. */
  test('the right station under a wrong figure is refused on every seed', () => {
    for (const seed of w5_05.seeds) {
      const run = reportedAs(seed, (line) => {
        const parts = line.split(' ');
        return `weak ${parts[1] ?? ''} ${String(Number(parts[2]) - 1)}`;
      });
      expect(run.met, `seed ${String(seed)}`).toBe(false);
    }
  });

  /** And the load alone is not enough: the station has to be the one that carries it. */
  test('the right figure under the wrong station is refused on every seed', () => {
    for (const seed of w5_05.seeds) {
      const run = reportedAs(seed, (line) => `weak sub-99 ${line.split(' ')[2] ?? ''}`);
      expect(run.met, `seed ${String(seed)}`).toBe(false);
    }
  });

  /**
   * The cheapest tree is not the same question as the weakest link. A run that lights the whole
   * district inside the drum but never asks what its own grid depends on is refused everywhere.
   */
  test('a do-nothing program is refused on every seed', () => {
    for (const seed of w5_05.seeds) {
      const run = scored(seed, (sim, botId) => {
        sim.print(botId, '.');
      });
      expect(run.passed, `seed ${String(seed)}`).toBe(false);
      expect(run.met, `seed ${String(seed)}`).toBe(false);
    }
  });
});
