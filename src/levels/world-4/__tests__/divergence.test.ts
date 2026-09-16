import { describe, expect, test } from 'vitest';
import type { Objective, Sim, Vec } from '../../../engine/index.ts';
import { ALL_DIRS, Terrain, eq, step } from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { runLevel } from '../../harness.ts';
import { SOLUTIONS } from '../../__tests__/solutions.ts';
import type { LevelDef, ReferenceSolution } from '../../types.ts';
import { pathBetween } from '../caves.ts';
import { tilesWithTerrain } from '../objectives.ts';
import { w4_01 } from '../w4-01.ts';
import { w4_02 } from '../w4-02.ts';
import { w4_03 } from '../w4-03.ts';

function diverge(
  level: LevelDef,
  seed: number,
  id: string,
  drive: (sim: Sim, bot: number) => void,
) {
  const result = runLevel(level, seed, drive);
  const pool: Objective[] = [...level.objectives, ...(level.bonus ?? [])];
  const objective = must(
    pool.find((each) => each.id === id),
    id,
  );
  const met = objective.evaluate({
    world: result.world,
    trace: result.trace,
    initialWorld: result.initialWorld,
    ops: result.ops,
  });
  const divergence = objective.divergence?.({
    world: result.world,
    trace: result.trace,
    initialWorld: result.initialWorld,
    ops: result.ops,
  });
  return { met, divergence, result };
}

function walkTo(sim: Sim, botId: number, to: Vec): void {
  const route = pathBetween(sim.world, sim.pos(botId), to);
  if (route === null) return;
  for (const next of route) {
    const dir = must(
      ALL_DIRS.find((each) => eq(step(sim.pos(botId), each), next)),
      'a direction',
    );
    sim.move(botId, dir);
  }
}

describe('w4-03 prices the order the run took against the best one', () => {
  const seed = 1;

  function worstOrder(level: LevelDef): { order: Vec[]; lift: Vec } {
    const world = level.build(seed);
    const points = tilesWithTerrain(world, Terrain.Pad);
    const lift = must(tilesWithTerrain(world, Terrain.Depot)[0], 'the lift');
    const start = must(world.bots[0], 'the bot').at;
    const perms: Vec[][] = [];
    for (const a of points) {
      for (const b of points) {
        for (const c of points) {
          if (a === b || b === c || a === c) continue;
          perms.push([a, b, c]);
        }
      }
    }
    const cost = (order: readonly Vec[]): number => {
      const stops = [start, ...order, lift];
      let total = 0;
      for (let n = 1; n < stops.length; n++) {
        total += pathBetween(world, stops[n - 1] as Vec, stops[n] as Vec)?.length ?? 0;
      }
      return total;
    };
    const order = perms.reduce((a, b) => (cost(b) > cost(a) ? b : a));
    return { order, lift };
  }

  test('the worst of the six orders is told what it cost and what the best costs', () => {
    const { order, lift } = worstOrder(w4_03);
    const { met, divergence } = diverge(w4_03, seed, 'best-order', (sim, botId) => {
      for (const point of order) walkTo(sim, botId, point);
      walkTo(sim, botId, lift);
    });

    expect(met).toBe(false);
    const shown = must(divergence, 'a divergence');
    expect(shown.where).toBe(order.map((at) => `(${String(at.x)}, ${String(at.y)})`).join(' → '));
    expect(shown.expected).toMatch(/^\d+ steps$/);
    expect(shown.received).toMatch(/^\d+ steps$/);
    expect(Number.parseInt(shown.received, 10)).toBeGreaterThan(
      Number.parseInt(shown.expected, 10),
    );
  });

  test('it never names the best order, only what the best order costs', () => {
    const { order, lift } = worstOrder(w4_03);
    const { divergence } = diverge(w4_03, seed, 'best-order', (sim, botId) => {
      for (const point of order) walkTo(sim, botId, point);
      walkTo(sim, botId, lift);
    });
    const shown = must(divergence, 'a divergence');
    expect(`${shown.expected} ${shown.received}`).not.toMatch(/\(/);
  });

  test('a run that never reached all three is told how many it did reach', () => {
    const { met, divergence } = diverge(w4_03, seed, 'best-order', () => undefined);
    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: 'the collection points',
      expected: 'all 3, in some order',
      received: '0 of 3',
    });
  });

  test('collect-all names a collection point the run never stood on', () => {
    const { divergence } = diverge(w4_03, seed, 'collect-all', () => undefined);
    const first = must(tilesWithTerrain(w4_03.build(seed), Terrain.Pad)[0], 'a pad');
    expect(divergence).toEqual({
      where: `(${String(first.x)}, ${String(first.y)})`,
      expected: 'stood on',
      received: 'never reached',
    });
  });

  test('end-on-lift names the lift and where the bot actually stopped', () => {
    const world = w4_03.build(seed);
    const lift = must(tilesWithTerrain(world, Terrain.Depot)[0], 'the lift');
    const start = must(world.bots[0], 'the bot').at;
    const { divergence } = diverge(w4_03, seed, 'end-on-lift', () => undefined);
    expect(divergence).toEqual({
      where: 'end of run',
      expected: `(${String(lift.x)}, ${String(lift.y)})`,
      received: `(${String(start.x)}, ${String(start.y)})`,
    });
  });
});

describe('the rest of World 4 names a point too', () => {
  test('w4-01 reading-allowance counts every reading, scans included', () => {
    const drive = (SOLUTIONS[w4_01.id] as ReferenceSolution).run;
    const { met, divergence } = diverge(w4_01, 1, 'reading-allowance', (sim, botId) => {
      for (let n = 0; n < 100; n++) sim.scan(botId, ALL_DIRS[0] as (typeof ALL_DIRS)[number]);
      drive(sim, botId);
    });
    expect(met).toBe(false);
    const shown = must(divergence, 'a divergence');
    expect(shown.where).toBe('readings this shift');
    expect(shown.expected).toBe('69 at most');
    expect(Number.parseInt(shown.received, 10)).toBeGreaterThan(69);
  });

  test('w4-01 no-wasted-steps prices the walk against the tunnel it had to walk', () => {
    const drive = (SOLUTIONS[w4_01.id] as ReferenceSolution).run;
    const { met, divergence } = diverge(w4_01, 1, 'no-wasted-steps', (sim, botId) => {
      drive(sim, botId);
      for (let n = 0; n < 4; n++) sim.move(botId, ALL_DIRS[0] as (typeof ALL_DIRS)[number]);
    });
    expect(met).toBe(false);
    const shown = must(divergence, 'a divergence');
    expect(shown.where).toBe('steps this shift');
    expect(shown.expected).toBe('51 at most');
    expect(shown.received).toBe('52 walked');
  });

  test('w4-01 tight-reading-bound names the pad when the bot never got there', () => {
    const world = w4_01.build(1);
    const pad = must(tilesWithTerrain(world, Terrain.Pad)[0], 'the pad');
    const { met, divergence } = diverge(w4_01, 1, 'tight-reading-bound', () => undefined);
    expect(met).toBe(false);
    expect(must(divergence, 'a divergence').expected).toBe(`(${String(pad.x)}, ${String(pad.y)})`);
  });

  test('w4-02 reach-vein names the vein and where the bot stopped', () => {
    const world = w4_02.build(1);
    const vein = must(tilesWithTerrain(world, Terrain.Pad)[0], 'the vein');
    const { divergence } = diverge(w4_02, 1, 'reach-vein', () => undefined);
    expect(must(divergence, 'a divergence').expected).toBe(
      `(${String(vein.x)}, ${String(vein.y)})`,
    );
  });

  test('w4-02 breadcrumb-trail says a crumb is missing when nothing was left near the vein', () => {
    const { met, divergence } = diverge(w4_02, 1, 'breadcrumb-trail', (sim, botId) => {
      sim.mark(botId, 'v');
    });
    expect(met).toBe(false);
    const shown = must(divergence, 'a divergence');
    expect(shown.where).toMatch(/^\(\d+, \d+\)$/);
    expect(shown.expected).toBe('a breadcrumb beside it');
    expect(shown.received).toBe('(nothing)');
  });
});
