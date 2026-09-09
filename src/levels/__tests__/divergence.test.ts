/**
 * What a failing objective says about *where* it failed.
 *
 * A beginner playtester lost fifty-five minutes to this: four plausible answers and an empty
 * program produced the identical `0 of 5 — 5 short`.
 * Every test here is a program that is wrong in a specific way, asserting that the report now
 * names that way. The printed-text shape the playtest hit lives in
 * `src/engine/__tests__/divergence.test.ts`; the work order it was found on has been withdrawn.
 */
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

// ---------------------------------------------------------------------------
// w6-03 — stay on route
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// w8-03 / w8-05 — precedence
// ---------------------------------------------------------------------------

/** The number a station id carries, so `sub-10` sorts after `sub-9` rather than after `sub-1`. */
function idNumber(id: string): number {
  return Number(id.slice('sub-'.length));
}

/**
 * The first station in the grid that hangs off exactly one root, and the root it hangs off.
 *
 * A two-feeder station is in breach the moment a test energises it having driven only the first of
 * them, and a feeder that is itself fed is in breach on its own account — either way the report
 * would be about a station these cases never meant to name. One station, one feeder, and the
 * feeder waits for nothing: then the only thing on the board is the tick arithmetic being pinned.
 */
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

  /**
   * `build` can only point a station at a feeder in the band above it, so before `relabel` the ids
   * were themselves a topological order and `for (i = 0; i < n; i++) use("sub-" + i)` passed the
   * one objective the level is about without ever reading `vars.deps`. The names are permuted
   * after the DAG is drawn now, and this is the assertion from the losing side.
   *
   * The loop is a *correct-looking* program, not an idle one — `grid-live` is met, every station
   * ends on — which is what makes it the answer worth refusing.
   */
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

/**
 * `w8-05`'s grid is twenty bots and a crate haul wide, and the precedence rule reads only the
 * `use` log. Driving a whole shift to provoke one out-of-order start would test the pathfinding
 * in the test, so the log is written directly and the level's own objective reads it.
 */
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
      expected: `feeder ${feeder.id} energised first`,
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

  /**
   * The finale's headline mechanic, held from the losing side. `deps` is only ever drawn from an
   * already-numbered station, so before `relabel` the ids were a topological order of themselves
   * and `for (i = 0; i < n; i++) use("sub-" + i)` cleared `precedence` on every seed with the
   * graph unread. Permuting the names after the DAG is drawn costs the geometry nothing and makes
   * the loop wrong; `w8-03` carries the same test for the same reason.
   */
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

/** An L-walk across `w8-03`'s open plain: clear of the crew rows first, then across, then down. */
function walkTo(sim: Sim, botId: number, to: Vec): void {
  sim.move(botId, Dir.North);
  for (let guard = 0; guard < 64 && sim.pos(botId).x !== to.x; guard++) {
    sim.move(botId, sim.pos(botId).x < to.x ? Dir.East : Dir.West);
  }
  for (let guard = 0; guard < 64 && sim.pos(botId).y !== to.y; guard++) {
    sim.move(botId, sim.pos(botId).y < to.y ? Dir.South : Dir.North);
  }
}
