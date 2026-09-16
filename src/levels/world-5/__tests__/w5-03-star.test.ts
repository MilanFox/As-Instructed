import { describe, expect, test } from 'vitest';
import type { MachineView, ObjectiveContext, Sim } from '../../../engine/index.ts';
import { evaluateObjectives, machineById } from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { runLevel, runReference } from '../../harness.ts';
import { SOLUTIONS } from '../../__tests__/solutions.ts';
import type { ReferenceSolution } from '../../types.ts';
import { playerApi } from '../__solutions__/_api.ts';
import { byNumberWalk, gridPlan, honestWalk, w5_03 } from '../w5-03.ts';

const STAR = 'tight-order';
const REACTOR = must(machineById(w5_03.build(1), 'reactor'), 'the reactor').at;

const solution = SOLUTIONS[w5_03.id] as ReferenceSolution;

const scored = (result: ReturnType<typeof runLevel>) => {
  const ctx: ObjectiveContext = {
    world: result.world,
    initialWorld: result.initialWorld,
    trace: result.trace,
    ops: result.ops,
  };
  return {
    passed: result.verdict.passed,
    ticks: result.trace.endTick,
    star: must(evaluateObjectives(w5_03.bonus ?? [], ctx)[0], STAR),
  };
};

const prereqsOf = (station: MachineView): string[] =>
  Object.keys(station.vars)
    .filter((key) => key.startsWith('prereq:'))
    .map((key) => key.slice('prereq:'.length));

function byNumberRun(seed: number) {
  return scored(
    runLevel(w5_03, seed, (sim: Sim, botId: number) => {
      const { probe, link, power } = playerApi(sim, botId, 'w5-03');
      const stations: MachineView[] = [];
      for (let i = 1; ; i++) {
        const station = probe(`sub-${String(i)}`);
        if (station === null) break;
        stations.push(station);
      }
      for (const station of stations) {
        for (const upstream of prereqsOf(station)) link(upstream, station.id);
      }
      const on = new Set<string>(['reactor']);
      const left = stations.slice();
      while (left.length > 0) {
        const next = left.findIndex((station) => prereqsOf(station).every((id) => on.has(id)));
        if (next < 0) break;
        const chosen = must(left.splice(next, 1)[0], 'a ready station');
        power(chosen.id, 'on');
        on.add(chosen.id);
      }
    }),
  );
}

describe('w5-03 tight-order', () => {
  test('the reference earns it on every seed, inside par, with the walk to spare', () => {
    for (const seed of w5_03.seeds) {
      const { passed, ticks, star } = scored(runReference(w5_03, seed, solution));
      const where = `seed ${String(seed)}`;
      expect(passed, where).toBe(true);
      expect(ticks, where).toBeLessThanOrEqual(w5_03.par.ticks);
      expect(star.met, where).toBe(true);
      const [walked, allowance] = star.progress ?? [0, 0];
      expect(walked, where).toBeLessThan(allowance);
    }
  });

  test('every nearest-ready order fits the allowance, however it breaks ties', () => {
    for (const seed of w5_03.seeds) {
      const plan = gridPlan(seed);
      expect(honestWalk(REACTOR, plan.stations), `seed ${String(seed)}`).toBeLessThanOrEqual(
        plan.travelBudget,
      );
    }
  });

  test('a legal order taken by station number is refused the star on every seed', () => {
    for (const seed of w5_03.seeds) {
      const plan = gridPlan(seed);
      const where = `seed ${String(seed)}`;
      expect(byNumberWalk(REACTOR, plan.stations), where).toBeGreaterThan(plan.travelBudget);

      const run = byNumberRun(seed);
      expect(run.passed, where).toBe(true);
      expect(run.star.met, where).toBe(false);
    }
  });

  test('the walk is not the clock: the same ticks buy a longer or a shorter walk', () => {
    for (const seed of w5_03.seeds) {
      const reference = scored(runReference(w5_03, seed, solution));
      const byNumber = byNumberRun(seed);
      const where = `seed ${String(seed)}`;
      expect(byNumber.ticks, where).toBe(reference.ticks);
      expect(byNumber.star.progress?.[0], where).toBeGreaterThan(reference.star.progress?.[0] ?? 0);
    }
  });

  test('more than one station is ready at once on every seed', () => {
    for (const seed of w5_03.seeds) {
      const { stations } = gridPlan(seed);
      const ready = stations.filter((station) => station.prereqs.every((id) => id === 'reactor'));
      expect(ready.length, `seed ${String(seed)}`).toBeGreaterThan(1);
    }
  });
});
