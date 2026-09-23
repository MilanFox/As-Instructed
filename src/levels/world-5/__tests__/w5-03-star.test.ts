import { describe, expect, test } from 'vitest';
import type { MachineView, ObjectiveContext, Sim } from '../../../engine/index.ts';
import { evaluateObjectives, machineById } from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { runLevel, runReference } from '../../harness.ts';
import { SOLUTIONS } from '../../__tests__/solutions.ts';
import type { ReferenceSolution } from '../../types.ts';
import { playerApi } from '../__solutions__/_api.ts';
import {
  gridPlan,
  lowestIdOrder,
  nearestReadyOrder,
  shortestDepths,
  sortedOrder,
  w5_03,
} from '../w5-03.ts';

const STAR = 'one-wave-at-a-time';

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
    inOrder: result.verdict.objectives.find((objective) => objective.id === 'in-order')?.met,
    ticks: result.trace.endTick,
    star: must(evaluateObjectives(w5_03.bonus ?? [], ctx)[0], STAR),
  };
};

const prereqsOf = (station: MachineView): string[] =>
  Object.keys(station.vars)
    .filter((key) => key.startsWith('prereq:'))
    .map((key) => key.slice('prereq:'.length));

function inOrder(seed: number, order: readonly string[]) {
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
      for (const id of order) power(id, 'on');
    }),
  );
}

describe('w5-03 one-wave-at-a-time', () => {
  test('the round-by-round reference earns it on every seed, inside par', () => {
    for (const seed of w5_03.seeds) {
      const { passed, ticks, star } = scored(runReference(w5_03, seed, solution));
      const where = `seed ${String(seed)}`;
      expect(passed, where).toBe(true);
      expect(ticks, where).toBeLessThanOrEqual(w5_03.par.ticks);
      expect(star.met, where).toBe(true);
    }
  });

  test('nearest-ready greedy lights the district and misses the star on every seed', () => {
    for (const seed of w5_03.seeds) {
      const { stations } = gridPlan(seed);
      for (const preferHigher of [false, true]) {
        const run = inOrder(seed, nearestReadyOrder(stations, preferHigher));
        const where = `seed ${String(seed)}, ties to ${preferHigher ? 'higher' : 'lower'}`;
        expect(run.passed, where).toBe(true);
        expect(run.star.met, where).toBe(false);
      }
    }
  });

  test('lowest-id-first Kahn lights the district and misses the star on every seed', () => {
    for (const seed of w5_03.seeds) {
      const run = inOrder(seed, lowestIdOrder(gridPlan(seed).stations));
      const where = `seed ${String(seed)}`;
      expect(run.passed, where).toBe(true);
      expect(run.star.met, where).toBe(false);
    }
  });

  test('the star costs no ticks: a legal order out of wave takes as long as the reference', () => {
    for (const seed of w5_03.seeds) {
      const reference = scored(runReference(w5_03, seed, solution));
      const byId = inOrder(seed, lowestIdOrder(gridPlan(seed).stations));
      expect(byId.ticks, `seed ${String(seed)}`).toBe(reference.ticks);
    }
  });

  test('seed 1 holds a join: a station on an inner ring, fed from a deeper wave', () => {
    const { stations } = gridPlan(1);
    const shortest = shortestDepths(stations);
    const joins = stations.filter((station) => (shortest.get(station.id) ?? 0) < station.wave);
    expect(joins.length).toBeGreaterThan(0);
  });

  test('powering in order of distance from the reactor fails in-order or the star on every seed', () => {
    for (const seed of w5_03.seeds) {
      const { stations } = gridPlan(seed);
      for (const measure of ['euclidean', 'manhattan'] as const) {
        for (const preferHigher of [false, true]) {
          const run = inOrder(seed, sortedOrder(stations, measure, preferHigher));
          const where = `seed ${String(seed)}, ${measure}, ties to ${preferHigher ? 'higher' : 'lower'}`;
          expect(run.inOrder && run.star.met, where).toBe(false);
        }
      }
    }
  });

  test('powering west to east misses the star on every seed', () => {
    for (const seed of w5_03.seeds) {
      for (const preferHigher of [false, true]) {
        const run = inOrder(seed, sortedOrder(gridPlan(seed).stations, 'x', preferHigher));
        expect(run.star.met, `seed ${String(seed)}`).toBe(false);
      }
    }
  });

  test('each ring stands further out than the one inside it, and no two stations touch', () => {
    for (const seed of w5_03.seeds) {
      const { stations } = gridPlan(seed);
      const rings = shortestDepths(stations);
      const reactor = must(machineById(w5_03.build(seed), 'reactor'), 'the reactor').at;
      const spans = new Map<number, number[]>();
      for (const station of stations) {
        const ring = must(rings.get(station.id), station.id);
        spans.set(ring, [
          ...(spans.get(ring) ?? []),
          Math.hypot(station.at.x - reactor.x, station.at.y - reactor.y),
        ]);
      }
      const means = [...spans.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, gaps]) => gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length);
      for (let i = 1; i < means.length; i++) {
        expect(means[i], `seed ${String(seed)} ring ${String(i + 1)}`).toBeGreaterThan(
          means[i - 1] ?? 0,
        );
      }
      const spots = [reactor, ...stations.map((station) => station.at)];
      for (let i = 0; i < spots.length; i++) {
        for (let j = i + 1; j < spots.length; j++) {
          const a = must(spots[i], 'a spot');
          const b = must(spots[j], 'a spot');
          expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeGreaterThan(1);
        }
      }
    }
  });

  test('more than one station is ready at once on every seed', () => {
    for (const seed of w5_03.seeds) {
      const { stations } = gridPlan(seed);
      expect(stations.filter((station) => station.wave === 1).length).toBeGreaterThan(1);
    }
  });
});
