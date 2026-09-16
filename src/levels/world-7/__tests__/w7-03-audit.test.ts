import { describe, expect, test } from 'vitest';
import type { ObjectiveContext, Sim, Vec } from '../../../engine/index.ts';
import { Dir, ItemKind, evaluateObjectives, vec } from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { runLevel, runReference } from '../../harness.ts';
import { SOLUTIONS } from '../../__tests__/solutions.ts';
import type { LevelDef, ReferenceSolution } from '../../types.ts';
import { AISLE, SILO_X, siteFor, w7_03 } from '../w7-03.ts';

const MOUTH_X = 8;
const LINK_X = 7;
const PARK_X = 2;

function scored(level: LevelDef, seed: number, drive: (sim: Sim, bot: number) => void) {
  const result = runLevel(level, seed, drive);
  const ctx: ObjectiveContext = {
    world: result.world,
    trace: result.trace,
    initialWorld: result.initialWorld,
    ops: result.ops,
  };
  const stars = evaluateObjectives(level.bonus ?? [], ctx);
  return {
    passed: result.verdict.passed,
    ticks: result.trace.endTick,
    reversals: tunnelReversals(result.trace.events, result.initialWorld.w),
    met: (id: string) =>
      must(
        stars.find((star) => star.id === id),
        id,
      ).met,
  };
}

function scoredReference(seed: number) {
  const solution = SOLUTIONS[w7_03.id] as ReferenceSolution;
  const result = runReference(w7_03, seed, solution);
  const stars = evaluateObjectives(w7_03.bonus ?? [], {
    world: result.world,
    trace: result.trace,
    initialWorld: result.initialWorld,
    ops: result.ops,
  });
  return {
    passed: result.verdict.passed,
    ticks: result.trace.endTick,
    reversals: tunnelReversals(result.trace.events, result.initialWorld.w),
    met: (id: string) =>
      must(
        stars.find((star) => star.id === id),
        id,
      ).met,
  };
}

function tunnelReversals(events: ObjectiveContext['trace']['events'], width: number): number {
  const lastTunnelX = width - 9;
  const steps = events
    .filter(
      (event) =>
        event.kind === 'move' &&
        event.ok &&
        event.to.y === AISLE &&
        event.to.x >= MOUTH_X &&
        event.to.x <= lastTunnelX,
    )
    .map((event) =>
      event.kind === 'move' ? { t: event.t, botId: event.botId, dx: event.to.x - event.from.x } : null,
    )
    .filter((step): step is { t: number; botId: number; dx: number } => step !== null)
    .sort((a, b) => a.t - b.t || a.botId - b.botId);

  let turns = 0;
  for (let i = 1; i < steps.length; i++) {
    if (Math.sign(must(steps[i], 'a step').dx) !== Math.sign(must(steps[i - 1], 'a step').dx)) {
      turns++;
    }
  }
  return turns;
}

interface Route {
  id: number;
  row: number;
  pile: Vec;
}

function routes(sim: Sim, seed: number): Route[] {
  const site = siteFor(seed);
  const eastX = MOUTH_X + site.tunnel;
  return sim.botIds().map((id, index) => ({
    id,
    row: 1 + index,
    pile: vec(eastX + (site.columns[index] ?? 1), 1 + index),
  }));
}

interface Style {
  batched: boolean;
  slow: boolean;
  staggered: boolean;
}

/**
 * One courier per crate, driven leg by leg. `batched` sends every bot east before any bot comes
 * west; `staggered` gives each leg its own tick window, which is what makes a run bump-free.
 */
function courier(sim: Sim, seed: number, style: Style): void {
  const site = siteFor(seed);
  const plan = routes(sim, seed);
  let cursor = 0;

  const step = (id: number, dir: Dir): void => {
    for (let guard = 0; guard < 400; guard++) if (sim.move(id, dir)) return;
  };
  const goX = (id: number, x: number): void => {
    for (let guard = 0; guard < 400 && sim.pos(id).x !== x; guard++) {
      step(id, sim.pos(id).x < x ? Dir.East : Dir.West);
    }
  };
  const goY = (id: number, y: number): void => {
    for (let guard = 0; guard < 400 && sim.pos(id).y !== y; guard++) {
      step(id, sim.pos(id).y < y ? Dir.South : Dir.North);
    }
  };
  const begin = (id: number): void => {
    const now = sim.clock(id);
    if (cursor > now) sim.wait(id, cursor - now);
  };
  const close = (id: number): void => {
    if (style.staggered) cursor = sim.clock(id) + 2;
  };
  const wander = (id: number): void => {
    if (!style.slow) return;
    const home = sim.pos(id).y;
    goY(id, 1);
    goY(id, AISLE - 1);
    goY(id, home);
  };

  const east = (route: Route): void => {
    begin(route.id);
    if (style.slow) sim.wait(route.id, 12);
    goX(route.id, LINK_X);
    wander(route.id);
    goY(route.id, AISLE);
    goX(route.id, route.pile.x);
    goY(route.id, route.row);
    sim.pickup(route.id, ItemKind.Crate);
    close(route.id);
  };

  const west = (route: Route): void => {
    begin(route.id);
    wander(route.id);
    goY(route.id, AISLE);
    goX(route.id, LINK_X);
    goY(route.id, route.row);
    goX(route.id, SILO_X);
    sim.drop(route.id, ItemKind.Crate);
    goX(route.id, PARK_X);
    if (style.slow) sim.wait(route.id, 12);
    close(route.id);
  };

  const laps = Math.max(...site.loads);
  for (let lap = 0; lap < laps; lap++) {
    const carrying = plan.filter((_, index) => (site.loads[index] ?? 1) > lap);
    if (style.batched) {
      for (const route of carrying) east(route);
      if (!style.staggered) cursor = Math.max(...carrying.map((route) => sim.clock(route.id))) + 2;
      for (const route of carrying) west(route);
      if (!style.staggered) cursor = Math.max(...carrying.map((route) => sim.clock(route.id))) + 2;
    } else {
      for (const route of carrying) {
        east(route);
        west(route);
      }
    }
  }
}

/** The naive hauler from `bonus.test.ts`: each bot runs its own errands, nobody yields. */
function everyBotForItself(sim: Sim, seed: number): void {
  const site = siteFor(seed);
  const eastX = MOUTH_X + site.tunnel;
  const ids = sim.botIds();

  const walkTo = (id: number, to: Vec): void => {
    for (let guard = 0; guard < 200; guard++) {
      const here = sim.pos(id);
      if (here.x === to.x && here.y === to.y) return;
      const dir =
        here.x !== to.x
          ? here.x < to.x
            ? Dir.East
            : Dir.West
          : here.y < to.y
            ? Dir.South
            : Dir.North;
      if (!sim.move(id, dir)) sim.wait(id, 1);
    }
  };

  ids.forEach((id, index) => {
    const row = 1 + index;
    const pile = vec(eastX + (site.columns[index] ?? 1), row);
    for (let load = 0; load < (site.loads[index] ?? 1); load++) {
      walkTo(id, vec(LINK_X, row));
      walkTo(id, vec(LINK_X, AISLE));
      walkTo(id, vec(pile.x, AISLE));
      walkTo(id, pile);
      sim.pickup(id, ItemKind.Crate);
      walkTo(id, vec(pile.x, AISLE));
      walkTo(id, vec(SILO_X, AISLE));
      walkTo(id, vec(SILO_X, row));
      sim.drop(id, ItemKind.Crate);
    }
  });
}

describe('w7-03 the board seeds 1 through 4', () => {
  test('seed 1 is representative, not degenerate', () => {
    const site = siteFor(1);

    expect(site.columns).toHaveLength(2);
    expect(site.tunnel).toBe(6);
    expect(Math.max(...site.loads), 'a second lap has to happen on seed 1').toBe(2);
  });

  test('every seed needs a second lap, so 4 one-way phases is the floor', () => {
    for (const seed of w7_03.seeds) {
      expect(Math.max(...siteFor(seed).loads), `seed ${String(seed)}`).toBe(2);
    }
  });
});

describe('w7-03 crates-in-silo', () => {
  test('it can fail, and names the crate it left behind', () => {
    for (const seed of w7_03.seeds) {
      const result = runLevel(w7_03, seed, () => undefined);
      const [report] = evaluateObjectives(w7_03.objectives, {
        world: result.world,
        trace: result.trace,
        initialWorld: result.initialWorld,
        ops: result.ops,
      });
      const shown = must(must(report, 'the objective').divergence, 'a divergence');

      expect(must(report, 'the objective').met, `seed ${String(seed)}`).toBe(false);
      expect(shown.where, `seed ${String(seed)}`).toMatch(/^\(\d+, \d+\)$/);
      expect(shown.expected, `seed ${String(seed)}`).toBe('column 1');
      expect(shown.received, `seed ${String(seed)}`).toMatch(/^column \d+$/);
      expect(shown.received).not.toBe(shown.expected);
    }
  });
});

describe('w7-03 the reference', () => {
  test('it clears the yard and takes both stars on every seed', () => {
    for (const seed of w7_03.seeds) {
      const run = scoredReference(seed);

      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.met('no-bumps'), `seed ${String(seed)}`).toBe(true);
      expect(run.met('one-way-tunnel'), `seed ${String(seed)}`).toBe(true);
    }
  });

  test('it spends exactly the 3 reversals the star allows on every seed', () => {
    for (const seed of w7_03.seeds) {
      expect(scoredReference(seed).reversals, `seed ${String(seed)}`).toBe(3);
    }
  });
});

describe('w7-03 a hauler that ignores the right of way', () => {
  test('it clears the yard and misses both stars on every seed', () => {
    for (const seed of w7_03.seeds) {
      const run = scored(w7_03, seed, (sim) => {
        everyBotForItself(sim, seed);
      });

      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.met('no-bumps'), `seed ${String(seed)}`).toBe(false);
      expect(run.met('one-way-tunnel'), `seed ${String(seed)}`).toBe(false);
      expect(run.reversals, `seed ${String(seed)}`).toBeGreaterThan(3);
    }
  });
});

describe('w7-03 the two stars are not twins', () => {
  test('a polite fleet that alternates the tunnel takes no-bumps and misses one-way-tunnel', () => {
    for (const seed of w7_03.seeds) {
      const run = scored(w7_03, seed, (sim) => {
        courier(sim, seed, { batched: false, slow: false, staggered: true });
      });

      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.met('no-bumps'), `seed ${String(seed)}`).toBe(true);
      expect(run.met('one-way-tunnel'), `seed ${String(seed)}`).toBe(false);
      expect(run.reversals, `seed ${String(seed)}`).toBeGreaterThan(3);
    }
  });

  test('a batched fleet that shoves takes one-way-tunnel and misses no-bumps', () => {
    for (const seed of w7_03.seeds) {
      const run = scored(w7_03, seed, (sim) => {
        courier(sim, seed, { batched: true, slow: false, staggered: false });
      });

      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.met('one-way-tunnel'), `seed ${String(seed)}`).toBe(true);
      expect(run.met('no-bumps'), `seed ${String(seed)}`).toBe(false);
    }
  });
});

describe('w7-03 one-way-tunnel is not par in other units', () => {
  test('a batched fleet padded with waits and detours still takes both stars', () => {
    for (const seed of w7_03.seeds) {
      const run = scored(w7_03, seed, (sim) => {
        courier(sim, seed, { batched: true, slow: true, staggered: true });
      });

      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.met('one-way-tunnel'), `seed ${String(seed)}`).toBe(true);
      expect(run.met('no-bumps'), `seed ${String(seed)}`).toBe(true);
      expect(run.ticks, `seed ${String(seed)}`).toBeGreaterThan(w7_03.par.ticks);
    }
  });
});

describe('w7-03 one-way-tunnel names where the tunnel turned once too often', () => {
  test('the fourth turn is reported with a bot, a tick and a heading', () => {
    const result = runLevel(w7_03, 1, (sim) => {
      courier(sim, 1, { batched: false, slow: false, staggered: true });
    });
    const star = must(
      (w7_03.bonus ?? []).find((each) => each.id === 'one-way-tunnel'),
      'one-way-tunnel',
    );
    const [report] = evaluateObjectives([star], {
      world: result.world,
      trace: result.trace,
      initialWorld: result.initialWorld,
      ops: result.ops,
    });
    const shown = must(must(report, 'the star').divergence, 'a divergence');

    expect(must(report, 'the star').met).toBe(false);
    expect(shown.where).toMatch(/^bot #\d+ · tick \d+$/);
    expect(shown.expected).toBe('3 reversals or fewer');
    expect(shown.received).toMatch(/^reversal 4 of \d+ · turned (east|west)$/);
    for (const value of [shown.where, shown.expected, shown.received]) {
      expect(value.length).toBeLessThanOrEqual(44);
    }
  });
});
