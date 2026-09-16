import { describe, expect, test } from 'vitest';
import type { ObjectiveContext, Sim } from '../../../engine/index.ts';
import { Dir, evaluateObjectives, senseTotals } from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { runLevel, runReference } from '../../harness.ts';
import { SOLUTIONS } from '../../__tests__/solutions.ts';
import type { ReferenceSolution } from '../../types.ts';
import { playerApi } from '../__solutions__/_api.ts';
import { SEGMENTS, w5_02 } from '../w5-02.ts';

const STAR = 'within-8-probe';
const CAP = 'within-10-probe';

function scored(seed: number, drive: (sim: Sim, botId: number) => void) {
  const result = runLevel(w5_02, seed, drive);
  const ctx: ObjectiveContext = {
    world: result.world,
    trace: result.trace,
    initialWorld: result.initialWorld,
    ops: result.ops,
  };
  const required = evaluateObjectives(w5_02.objectives, ctx);
  return {
    probes: senseTotals(result.trace)['probe'] ?? 0,
    ticks: result.ticks,
    patched: must(
      required.find((each) => each.id === 'patched'),
      'patched',
    ).met,
    cap: must(
      required.find((each) => each.id === CAP),
      CAP,
    ).met,
    star: must(
      evaluateObjectives(w5_02.bonus ?? [], ctx).find((each) => each.id === STAR),
      STAR,
    ).met,
  };
}

const linearScan = (sim: Sim, botId: number): void => {
  const { probe, power } = playerApi(sim, botId, 'w5-02');
  for (let index = 0; index < SEGMENTS; index++) {
    if (probe(`relay-${String(index)}`)?.vars.live !== 1) {
      power(`relay-${String(index)}`, 'patched');
      return;
    }
  }
};

const thirds = (sim: Sim, botId: number): void => {
  const { probe, power } = playerApi(sim, botId, 'w5-02');
  const live = (index: number): boolean => probe(`relay-${String(index)}`)?.vars.live === 1;
  let low = 0;
  let high = SEGMENTS - 1;
  while (low < high) {
    const span = high - low;
    const first = low + Math.floor(span / 3);
    const second = low + Math.floor((span * 2) / 3);
    if (!live(first)) high = first;
    else if (!live(second)) {
      low = first + 1;
      high = second;
    } else low = second + 1;
  }
  power(`relay-${String(low)}`, 'patched');
};

describe('w5-02 the eighth reading', () => {
  test('the reference halves its way there inside eight readings on every seed', () => {
    const solution = SOLUTIONS[w5_02.id] as ReferenceSolution;
    for (const seed of w5_02.seeds) {
      const result = runReference(w5_02, seed, solution);
      const stars = evaluateObjectives(w5_02.bonus ?? [], {
        world: result.world,
        initialWorld: result.initialWorld,
        trace: result.trace,
        ops: result.ops,
      });
      expect(result.verdict.passed, `seed ${String(seed)}`).toBe(true);
      expect(senseTotals(result.trace)['probe'] ?? 0, `seed ${String(seed)}`).toBeLessThanOrEqual(8);
      expect(must(stars[0], STAR).met, `seed ${String(seed)}`).toBe(true);
    }
  });

  test('a walk down the run patches the right relay and blows both budgets', () => {
    for (const seed of [1, 3, 4, 5]) {
      const run = scored(seed, linearScan);
      expect(run.patched, `seed ${String(seed)}`).toBe(true);
      expect(run.probes, `seed ${String(seed)}`).toBeGreaterThan(10);
      expect(run.cap, `seed ${String(seed)}`).toBe(false);
      expect(run.star, `seed ${String(seed)}`).toBe(false);
    }
  });

  test('a search that splits in thirds stays inside the shift and misses the star', () => {
    const run = scored(3, thirds);
    expect(run.patched).toBe(true);
    expect(run.probes).toBe(10);
    expect(run.cap).toBe(true);
    expect(run.star).toBe(false);
  });

  test('nothing but a probe reports continuity: the free senses read the same on every seed', () => {
    const surface = (seed: number): string => {
      const seen: string[] = [];
      runLevel(w5_02, seed, (sim: Sim, botId: number) => {
        const { scan, look, pos, canMove } = playerApi(sim, botId, 'w5-02');
        seen.push(JSON.stringify(pos()));
        for (const dir of [Dir.North, Dir.East, Dir.South, Dir.West]) {
          seen.push(String(canMove(dir)));
          seen.push(JSON.stringify(scan(dir)));
          seen.push(JSON.stringify(look(dir)));
        }
        seen.push(JSON.stringify(scan()));
      });
      return seen.join('\n');
    };

    const first = surface(w5_02.seeds[0] as number);
    for (const seed of w5_02.seeds) expect(surface(seed), `seed ${String(seed)}`).toBe(first);
  });
});
