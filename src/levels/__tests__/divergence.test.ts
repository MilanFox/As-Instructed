import { describe, expect, test } from 'vitest';
import type { Machine, Objective, ObjectiveContext, Sim, Trace, Vec } from '../../engine/index.ts';
import { ALL_DIRS, Dir, Terrain, cloneWorld, step, tileAt, vec } from '../../engine/index.ts';
import { must } from '../../engine/__tests__/helpers.ts';
import { runLevel } from '../harness.ts';
import { dependenciesOf, machinesWithPrefix } from '../world-8/shared.ts';
import { w6_03 } from '../world-6/w6-03.ts';
import { w6_05 } from '../world-6/w6-05.ts';
import { w8_03 } from '../world-8/w8-03.ts';
import { w8_05 } from '../world-8/w8-05.ts';
import type { LevelDef } from '../types.ts';

function objectiveIn(level: LevelDef, id: string): Objective {
  return must(
    level.objectives.find((objective) => objective.id === id),
    `objective ${id}`,
  );
}

describe('w6-03 names the tick and the cell the bot left the route on', () => {
  test('a bot driven off the first tile reports the pit it fell into', () => {
    const result = runLevel(w6_03, 1, (sim, botId) => {
      sim.move(botId, Dir.North);
    });
    const report = must(
      result.verdict.objectives.find((objective) => objective.id === 'stay-on-route'),
      'stay-on-route',
    );

    expect(report.met).toBe(false);
    expect(report.divergence).toEqual({
      where: 'tick 1 · (1, 4)',
      expected: Terrain.Floor,
      received: Terrain.Pit,
    });
  });

  test('a bot that never left the route has nothing to report', () => {
    const result = runLevel(w6_03, 1, () => undefined);
    const report = must(
      result.verdict.objectives.find((objective) => objective.id === 'stay-on-route'),
      'stay-on-route',
    );

    expect(report.met).toBe(true);
    expect(report.divergence).toBeUndefined();
  });

  test('w6-05 grades the same route rule and reports it the same way', () => {
    const world = w6_05.build(1);
    const start = must(world.bots[0], 'w6-05 bot').at;
    const offRoute = must(
      ALL_DIRS.find((dir) => tileAt(world, step(start, dir))?.terrain === Terrain.Pit),
      'a pit beside the start',
    );
    const fell = step(start, offRoute);
    const result = runLevel(w6_05, 1, (sim, botId) => {
      sim.move(botId, offRoute);
    });
    const report = must(
      result.verdict.objectives.find((objective) => objective.id === 'stay-on-route'),
      'stay-on-route',
    );

    expect(report.met).toBe(false);
    expect(report.divergence).toEqual({
      where: `tick 1 · (${String(fell.x)}, ${String(fell.y)})`,
      expected: Terrain.Floor,
      received: Terrain.Pit,
    });
  });
});

function idNumber(id: string): number {
  return Number(id.slice('sub-'.length));
}

function pickChain(machines: readonly Machine[]): { station: Machine; feeder: Machine } {
  for (const station of machines) {
    const feeders = dependenciesOf(station);
    if (feeders.length !== 1) continue;
    const feeder = machines.find((candidate) => candidate.id === feeders[0]);
    if (feeder && dependenciesOf(feeder).length === 0) return { station, feeder };
  }
  throw new Error('expected at least one station hanging off a single root');
}

describe('w8-03 names the station that jumped its feeder', () => {
  test('energising a station before its feeder reports both and both ticks', () => {
    const { station, feeder } = pickChain(machinesWithPrefix(w8_03.build(1), 'sub-'));
    const result = runLevel(w8_03, 1, (sim, botId) => {
      walkTo(sim, botId, station.at);
      sim.use(botId);
      walkTo(sim, botId, feeder.at);
      sim.use(botId);
    });
    const report = must(
      result.verdict.objectives.find((objective) => objective.id === 'precedence-held'),
      'precedence-held',
    );

    expect(report.met).toBe(false);
    expect(report.divergence?.where).toBe(`${station.id} · feeder ${feeder.id}`);
    expect(report.divergence?.expected).toMatch(/^start at tick \d+ or later$/);
    expect(report.divergence?.received).toMatch(/^started at tick \d+$/);
  });

  test('a grid nobody touched has no precedence to break', () => {
    const result = runLevel(w8_03, 1, () => undefined);
    const report = must(
      result.verdict.objectives.find((objective) => objective.id === 'precedence-held'),
      'precedence-held',
    );

    expect(report.met).toBe(true);
    expect(report.divergence).toBeUndefined();
  });

  test('a bare ascending loop over the ids breaches precedence on every seed', () => {
    for (const seed of w8_03.seeds) {
      const inIdOrder = machinesWithPrefix(w8_03.build(seed), 'sub-').sort(
        (a, b) => idNumber(a.id) - idNumber(b.id),
      );
      const result = runLevel(w8_03, seed, (sim, botId) => {
        for (const station of inIdOrder) {
          walkTo(sim, botId, station.at);
          sim.use(botId);
        }
      });
      const objectives = result.verdict.objectives;
      const live = must(
        objectives.find((objective) => objective.id === 'grid-live'),
        'grid-live',
      );
      const precedence = must(
        objectives.find((objective) => objective.id === 'precedence-held'),
        'precedence-held',
      );

      expect(live.met, `seed ${String(seed)}`).toBe(true);
      expect(precedence.met, `seed ${String(seed)}`).toBe(false);
    }
  });
});

function traceOfUses(
  initialWorld: ReturnType<LevelDef['build']>,
  uses: readonly { t: number; machineId: string }[],
): Trace {
  return {
    initialWorld,
    events: uses.map((use) => ({
      t: use.t,
      botId: 0,
      dt: 1,
      kind: 'use' as const,
      at: vec(0, 0),
      machineId: use.machineId,
      ok: true,
    })),
    keyframes: [],
    endTick: Math.max(0, ...uses.map((use) => use.t + 1)),
  };
}

describe('w8-05 names the station that jumped its feeder', () => {
  const initialWorld = w8_05.build(1);
  const { station, feeder } = pickChain(machinesWithPrefix(initialWorld, 'sub-'));
  const objective = objectiveIn(w8_05, 'precedence');

  const contextFrom = (uses: readonly { t: number; machineId: string }[]): ObjectiveContext => ({
    world: cloneWorld(initialWorld),
    initialWorld,
    trace: traceOfUses(initialWorld, uses),
  });

  test('a station started before its feeder finished reports both ticks', () => {
    const ctx = contextFrom([
      { t: 10, machineId: station.id },
      { t: 20, machineId: feeder.id },
    ]);

    expect(objective.evaluate(ctx)).toBe(false);
    expect(objective.divergence?.(ctx)).toEqual({
      where: `${station.id} · feeder ${feeder.id}`,
      expected: 'start at tick 21 or later',
      received: 'started at tick 10',
    });
  });

  test('a station started with its feeder never energised at all says so', () => {
    const ctx = contextFrom([{ t: 10, machineId: station.id }]);

    expect(objective.evaluate(ctx)).toBe(false);
    expect(objective.divergence?.(ctx)).toEqual({
      where: `${station.id} · feeder ${feeder.id}`,
      expected: `feeder ${feeder.id} switched on first`,
      received: 'started at tick 10',
    });
  });

  test('the right order reports nothing', () => {
    const ctx = contextFrom([
      { t: 10, machineId: feeder.id },
      { t: 20, machineId: station.id },
    ]);

    expect(objective.evaluate(ctx)).toBe(true);
    expect(objective.divergence?.(ctx)).toBeUndefined();
  });

  test('a bare ascending loop over the ids breaches precedence on every seed', () => {
    for (const seed of w8_05.seeds) {
      const world = w8_05.build(seed);
      const uses = machinesWithPrefix(world, 'sub-')
        .sort((a, b) => idNumber(a.id) - idNumber(b.id))
        .map((machine, order) => ({ t: order * 2, machineId: machine.id }));
      const ctx: ObjectiveContext = {
        world: cloneWorld(world),
        initialWorld: world,
        trace: traceOfUses(world, uses),
      };

      expect(objectiveIn(w8_05, 'precedence').evaluate(ctx), `seed ${String(seed)}`).toBe(false);
    }
  });
});

function walkTo(sim: Sim, botId: number, to: Vec): void {
  sim.move(botId, Dir.North);
  for (let guard = 0; guard < 64 && sim.pos(botId).x !== to.x; guard++) {
    sim.move(botId, sim.pos(botId).x < to.x ? Dir.East : Dir.West);
  }
  for (let guard = 0; guard < 64 && sim.pos(botId).y !== to.y; guard++) {
    sim.move(botId, sim.pos(botId).y < to.y ? Dir.South : Dir.North);
  }
}
