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

  test('the same tree without its outage line lights the district and is refused', () => {
    for (const seed of w5_05.seeds) {
      const run = reportedAs(seed, () => null);
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.ticks, `seed ${String(seed)}`).toBeLessThanOrEqual(w5_05.par.ticks);
      expect(run.met, `seed ${String(seed)}`).toBe(false);
    }
  });

  test('the right station under a wrong figure is refused on every seed', () => {
    for (const seed of w5_05.seeds) {
      const run = reportedAs(seed, (line) => {
        const parts = line.split(' ');
        return `weak ${parts[1] ?? ''} ${String(Number(parts[2]) - 1)}`;
      });
      expect(run.met, `seed ${String(seed)}`).toBe(false);
    }
  });

  test('the right figure under the wrong station is refused on every seed', () => {
    for (const seed of w5_05.seeds) {
      const run = reportedAs(seed, (line) => `weak sub-99 ${line.split(' ')[2] ?? ''}`);
      expect(run.met, `seed ${String(seed)}`).toBe(false);
    }
  });

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
