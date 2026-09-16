import { describe, expect, test } from 'vitest';
import type { MachineView, ObjectiveContext, Sim } from '../../../engine/index.ts';
import { evaluateObjectives } from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { runLevel, runReference } from '../../harness.ts';
import { SOLUTIONS } from '../../__tests__/solutions.ts';
import type { ReferenceSolution } from '../../types.ts';
import { playerApi } from '../__solutions__/_api.ts';
import { w5_04, yardPlan } from '../w5-04.ts';

const STAR = 'largest-idle';
const solution = SOLUTIONS[w5_04.id] as ReferenceSolution;

const capacityOf = (feeder: MachineView): number => feeder.vars['capacity'] ?? 0;
const drawOf = (consumer: MachineView): number => consumer.vars['draw'] ?? 0;

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
    required: evaluateObjectives(w5_04.objectives, ctx),
    star: must(evaluateObjectives(w5_04.bonus ?? [], ctx)[0], STAR),
  };
};

type Column = (feeders: MachineView[]) => MachineView[];

function firstFit(seed: number, column: Column, heaviestFirst: boolean) {
  return scored(
    runLevel(w5_04, seed, (sim: Sim, botId: number) => {
      const { probe, link } = playerApi(sim, botId, 'w5-04');
      const readAll = (prefix: string): MachineView[] => {
        const out: MachineView[] = [];
        for (let i = 1; ; i++) {
          const machine = probe(`${prefix}-${String(i)}`);
          if (machine === null) break;
          out.push(machine);
        }
        return out;
      };

      const bins = column(readAll('feeder')).map((feeder) => ({
        id: feeder.id,
        room: capacityOf(feeder),
      }));
      const consumers = readAll('consumer');
      const queue = heaviestFirst
        ? consumers.slice().sort((a, b) => drawOf(b) - drawOf(a))
        : consumers;

      for (const consumer of queue) {
        const bin = bins.find((candidate) => candidate.room >= drawOf(consumer));
        if (!bin) continue;
        bin.room -= drawOf(consumer);
        link(bin.id, consumer.id);
      }
    }),
  );
}

const asReported: Column = (feeders) => feeders;
const withoutLargest: Column = (feeders) => {
  const largest = feeders.reduce((best, feeder) =>
    capacityOf(feeder) > capacityOf(best) ? feeder : best,
  );
  return feeders.filter((feeder) => feeder.id !== largest.id);
};
const smallestFirst: Column = (feeders) =>
  withoutLargest(feeders).sort((a, b) => capacityOf(a) - capacityOf(b));
const biggestFirst: Column = (feeders) =>
  withoutLargest(feeders).sort((a, b) => capacityOf(b) - capacityOf(a));

describe('w5-04 largest-idle', () => {
  test('the reference earns it on every seed, inside par', () => {
    for (const seed of w5_04.seeds) {
      const { passed, ticks, star } = scored(runReference(w5_04, seed, solution));
      const where = `seed ${String(seed)}`;
      expect(passed, where).toBe(true);
      expect(ticks, where).toBeLessThanOrEqual(w5_04.par.ticks);
      expect(star.met, where).toBe(true);
    }
  });

  test('the yard keeps one strictly largest feeder the others can do without', () => {
    for (const seed of w5_04.seeds) {
      const { capacities, draws } = yardPlan(seed);
      const where = `seed ${String(seed)}`;
      const largest = Math.max(...capacities);
      expect(capacities.filter((capacity) => capacity === largest).length, where).toBe(1);

      const rest = capacities
        .filter((_, index) => index !== capacities.indexOf(largest))
        .reduce((sum, capacity) => sum + capacity, 0);
      expect(rest, where).toBeGreaterThanOrEqual(draws.reduce((sum, draw) => sum + draw, 0));
    }
  });

  test('holding the largest feeder back still places every consumer, in any column order', () => {
    for (const column of [withoutLargest, smallestFirst, biggestFirst]) {
      for (const seed of w5_04.seeds) {
        const run = firstFit(seed, column, true);
        const where = `seed ${String(seed)}`;
        expect(
          run.required.map((objective) => objective.met),
          where,
        ).toEqual([true, true]);
        expect(run.star.met, where).toBe(true);
        expect(run.ticks, where).toBeLessThanOrEqual(w5_04.par.ticks);
      }
    }
  });

  test('filling the column as reported is refused the star on every seed', () => {
    for (const seed of w5_04.seeds) {
      expect(firstFit(seed, asReported, false).star.met, `seed ${String(seed)}`).toBe(false);
      expect(firstFit(seed, asReported, true).star.met, `seed ${String(seed)}`).toBe(false);
    }
  });
});
