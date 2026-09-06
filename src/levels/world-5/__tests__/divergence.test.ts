/**
 * What The Grid says when a district fails to come up.
 *
 * World 5 grades order as much as outcome: a station switched on before the machine feeding it,
 * a feeder taken over its ceiling, a cable that overran the drum. Every one of those is a
 * comparison the level had already run in order to answer yes or no, and every one of them used
 * to report the bare bit. These are the assertions that they now report the comparison.
 */
import { describe, expect, test } from 'vitest';
import type { Machine, Objective, Sim, UseEvent, Vec } from '../../../engine/index.ts';
import { Dir, machineById, manhattan } from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { runLevel } from '../../harness.ts';
import type { LevelDef } from '../../types.ts';
import { playerApi } from '../__solutions__/_api.ts';
import { at } from '../objectives.ts';
import { w5_01 } from '../w5-01.ts';
import { w5_02 } from '../w5-02.ts';
import { w5_03 } from '../w5-03.ts';
import { w5_04 } from '../w5-04.ts';
import { w5_05 } from '../w5-05.ts';

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
  const ctx = {
    world: result.world,
    trace: result.trace,
    initialWorld: result.initialWorld,
    ops: result.ops,
  };
  return { met: objective.evaluate(ctx), divergence: objective.divergence?.(ctx), result };
}

const withPrefix = (level: LevelDef, seed: number, prefix: string): Machine[] =>
  level.build(seed).machines.filter((machine) => machine.id.startsWith(prefix));

const nowhere = (level: LevelDef, seed: number, id: string) =>
  diverge(level, seed, id, () => undefined);

describe('w5-01 — the station that went on before its feeder', () => {
  test('energised names the first station left off, and its tile', () => {
    const first = must(withPrefix(w5_01, 1, 'sub-')[0], 'sub-1');
    const { met, divergence } = nowhere(w5_01, 1, 'energised');
    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: `sub-1 · ${at(first.at)}`,
      expected: 'on',
      received: 'off',
    });
  });

  test('in-order names the pair and the tick when a station is latched too early', () => {
    const second = must(withPrefix(w5_01, 1, 'sub-')[1], 'sub-2');
    const { met, divergence, result } = diverge(w5_01, 1, 'in-order', (sim, botId) => {
      const { pos, move, use } = playerApi(sim, botId, 'w5-01');
      while (pos().x !== second.at.x) move(pos().x < second.at.x ? Dir.East : Dir.West);
      use();
    });
    const latch = must(
      result.trace.events.find((event): event is UseEvent => event.kind === 'use' && event.ok),
      'a use',
    );
    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: `tick ${String(latch.t)} · sub-2`,
      expected: 'sub-1 already on',
      received: 'sub-1 was still off',
    });
  });

  test('a run that latched nothing is told which station, and what feeds it', () => {
    const first = must(withPrefix(w5_01, 1, 'sub-')[0], 'sub-1');
    expect(nowhere(w5_01, 1, 'in-order').divergence).toEqual({
      where: `sub-1 · ${at(first.at)}`,
      expected: 'switched on after reactor',
      received: 'never switched on',
    });
  });

  test('one-pass names the tick and tile the run turned round on', () => {
    const { met, divergence } = diverge(w5_01, 1, 'one-pass', (sim, botId) => {
      sim.move(botId, Dir.East);
      sim.move(botId, Dir.West);
    });
    expect(met).toBe(false);
    const shown = must(divergence, 'a divergence');
    expect(shown.where).toMatch(/^tick \d+ · \(\d+, \d+\)$/);
    expect(shown.expected).toBe('east, the way the run started');
    expect(shown.received).toBe('west');
  });
});

describe('w5-02 — the patch report, and what it refuses to say', () => {
  test('a run that patched nothing is told how many it owed', () => {
    const { met, divergence } = nowhere(w5_02, 1, 'patched');
    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: 'relays patched',
      expected: 'exactly 1',
      received: '(nothing)',
    });
  });

  test('a search that patched as it went is told which relays it left behind', () => {
    const { met, divergence } = diverge(w5_02, 1, 'patched', (sim, botId) => {
      const { power } = playerApi(sim, botId, 'w5-02');
      power('relay-0', 'patched');
      power('relay-1', 'patched');
    });
    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: 'relays patched',
      expected: 'exactly 1',
      received: '2: relay-0, relay-1',
    });
  });

  /**
   * The break is the level. A report that named the side it lies on would be worth one reading,
   * and a player who took one reading per run could close two hundred segments in eight runs
   * without ever bisecting anything — so the only thing said about a wrong patch is that it is
   * wrong, and no number appears anywhere in the pair.
   */
  test('a single wrong patch is told it is wrong, and never which way the break lies', () => {
    const { met, divergence } = diverge(w5_02, 1, 'patched', (sim, botId) => {
      playerApi(sim, botId, 'w5-02').power('relay-0', 'patched');
    });
    expect(met).toBe(false);
    const shown = must(divergence, 'a divergence');
    expect(shown.where).toBe('relay-0');
    expect(`${shown.expected} ${shown.received}`).not.toMatch(/\d/);
    expect(`${shown.expected} ${shown.received}`).not.toMatch(/before|after|higher|lower|past/);
  });
});

describe('w5-03 — the cable, the order and the walk', () => {
  test('cabled names the prerequisite no cable was run for', () => {
    const { met, divergence } = nowhere(w5_03, 1, 'cabled');
    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: 'reactor → sub-1',
      expected: 'a cable',
      received: '(nothing)',
    });
  });

  test('energised names the first station left off', () => {
    const first = must(withPrefix(w5_03, 1, 'sub-')[0], 'sub-1');
    expect(nowhere(w5_03, 1, 'energised').divergence).toEqual({
      where: `sub-1 · ${at(first.at)}`,
      expected: 'on',
      received: 'off',
    });
  });

  test('in-order names which upstream was still off, and when', () => {
    const { met, divergence } = diverge(w5_03, 2, 'in-order', (sim, botId) => {
      playerApi(sim, botId, 'w5-03').power('sub-2', 'on');
    });
    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: 'tick 0 · sub-2',
      expected: 'sub-1 already on',
      received: 'sub-1 was still off',
    });
  });

  test('a district never brought up is told the station and what it waits on', () => {
    const first = must(withPrefix(w5_03, 1, 'sub-')[0], 'sub-1');
    expect(nowhere(w5_03, 1, 'in-order').divergence).toEqual({
      where: `sub-1 · ${at(first.at)}`,
      expected: 'brought up after reactor',
      received: 'never brought up',
    });
  });

  /**
   * The allowance is on the reactor, so the number is not news. Which two stations the crew was
   * walking between when it ran out is, and it names no better order to have taken.
   */
  test('tight-order names the leg of the walk that spent the allowance', () => {
    const stations = withPrefix(w5_03, 1, 'sub-');
    const reactor = must(machineById(w5_03.build(1), 'reactor'), 'the reactor');
    const budget = w5_03.build(1).vars.travelBudget ?? 0;

    /* The mirror image of the intended walk: always cross the district for the next station. */
    const order: Machine[] = [];
    const left = stations.slice();
    let from: Vec = reactor.at;
    while (left.length > 0) {
      let pick = 0;
      for (let i = 1; i < left.length; i++) {
        const rival = must(left[i], 'a station');
        if (manhattan(from, rival.at) > manhattan(from, must(left[pick], 'a station').at)) pick = i;
      }
      const chosen = must(left.splice(pick, 1)[0], 'a station');
      order.push(chosen);
      from = chosen.at;
    }

    const { met, divergence } = diverge(w5_03, 1, 'tight-order', (sim, botId) => {
      const { power } = playerApi(sim, botId, 'w5-03');
      for (const station of order) power(station.id, 'on');
    });

    expect(met).toBe(false);
    const shown = must(divergence, 'a divergence');
    expect(shown.where).toMatch(/^(reactor|sub-\d+) → sub-\d+$/);
    expect(shown.expected).toBe(`${String(budget)} steps in all`);
    expect(shown.received).toMatch(/^\d+ steps by this leg$/);
    expect(Number.parseInt(shown.received, 10)).toBeGreaterThan(budget);
  });
});

describe('w5-04 — the consumer, the ceiling and the feeder held back', () => {
  test('assigned names the first consumer left on no feeder at all', () => {
    const { met, divergence } = nowhere(w5_04, 1, 'assigned');
    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: 'consumer-1',
      expected: 'exactly 1 feeder',
      received: '(nothing)',
    });
  });

  test('a consumer cabled twice is told both feeders it ended up on', () => {
    const { met, divergence } = diverge(w5_04, 1, 'assigned', (sim, botId) => {
      const { link } = playerApi(sim, botId, 'w5-04');
      link('feeder-1', 'consumer-1');
      link('feeder-2', 'consumer-1');
    });
    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: 'consumer-1',
      expected: 'exactly 1 feeder',
      received: 'feeder-1, feeder-2',
    });
  });

  test('within-capacity names the feeder, its ceiling and what it ended up carrying', () => {
    const world = w5_04.build(1);
    const feeder = must(
      world.machines.find((machine) => machine.id === 'feeder-1'),
      'feeder-1',
    );
    const load = world.machines
      .filter((machine) => machine.id.startsWith('consumer-'))
      .reduce((sum, consumer) => sum + (consumer.vars.draw ?? 0), 0);
    const count = world.machines.filter((machine) => machine.id.startsWith('consumer-')).length;

    const { met, divergence } = diverge(w5_04, 1, 'within-capacity', (sim, botId) => {
      const { link } = playerApi(sim, botId, 'w5-04');
      for (let i = 1; i <= count; i++) link('feeder-1', `consumer-${String(i)}`);
    });
    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: 'feeder-1',
      expected: `at most ${String(feeder.vars.capacity ?? 0)}`,
      received: `${String(load)}, from ${String(count)} consumers`,
    });
  });

  /**
   * The comparison the star is graded on is `loadOn(largest) === 0`, and every capacity in the
   * yard is a free read. Printing the two sides of that comparison costs the level nothing and
   * is the difference between "not met" and knowing which cable to have laid elsewhere.
   */
  test('largest-idle names the largest feeder, its ceiling and the load left on it', () => {
    const world = w5_04.build(1);
    const feeders = world.machines.filter((machine) => machine.id.startsWith('feeder-'));
    const largest = feeders.reduce((best, feeder) =>
      (feeder.vars.capacity ?? 0) > (best.vars.capacity ?? 0) ? feeder : best,
    );
    const draw = must(
      world.machines.find((machine) => machine.id === 'consumer-1'),
      'consumer-1',
    ).vars.draw;

    const { met, divergence } = diverge(w5_04, 1, 'largest-idle', (sim, botId) => {
      playerApi(sim, botId, 'w5-04').link(largest.id, 'consumer-1');
    });
    expect(met).toBe(false);
    const shown = must(divergence, 'a divergence');
    expect(shown).toEqual({
      where: `${largest.id}, the largest at ${String(largest.vars.capacity ?? 0)}`,
      expected: 'no consumers on it',
      received: `1, drawing ${String(draw ?? 0)}`,
    });
    /* Which consumer to move instead is the packing, and the packing is the level. */
    expect(`${shown.where} ${shown.expected} ${shown.received}`).not.toContain('consumer-');
  });
});

describe('w5-05 — the island, the drum and the dead cable', () => {
  const starDriver = (count: number) => (sim: Sim, botId: number) => {
    const { link } = playerApi(sim, botId, 'w5-05');
    for (let i = 1; i <= count; i++) link('reactor', `sub-${String(i)}`);
  };

  test('connected names a substation the cable never reaches', () => {
    const first = must(withPrefix(w5_05, 1, 'sub-')[0], 'sub-1');
    const { met, divergence } = nowhere(w5_05, 1, 'connected');
    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: `sub-1 · ${at(first.at)}`,
      expected: 'a cable back to the reactor',
      received: '(nothing)',
    });
  });

  test('an island is told what it is cabled to instead', () => {
    const first = must(withPrefix(w5_05, 1, 'sub-')[0], 'sub-1');
    const { divergence } = diverge(w5_05, 1, 'connected', (sim, botId) => {
      playerApi(sim, botId, 'w5-05').link('sub-1', 'sub-2');
    });
    expect(divergence).toEqual({
      where: `sub-1 · ${at(first.at)}`,
      expected: 'a cable back to the reactor',
      received: 'cabled to sub-2',
    });
  });

  test('budget names the cable that took the run past the drum', () => {
    const world = w5_05.build(1);
    const reactor = must(machineById(world, 'reactor'), 'the reactor');
    const stations = world.machines.filter((machine) => machine.id.startsWith('sub-'));
    const budget = world.vars.cableBudget ?? 0;

    let spent = 0;
    let crossing: { id: string; spent: number } | undefined;
    for (const station of stations) {
      spent += manhattan(reactor.at, station.at);
      if (spent > budget && crossing === undefined) crossing = { id: station.id, spent };
    }
    const over = must(crossing, 'a cable that goes over the drum');

    const { met, divergence } = diverge(w5_05, 1, 'budget', starDriver(stations.length));
    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: `reactor → ${over.id}`,
      expected: `${String(budget)} of cable in all`,
      received: `${String(over.spent)} spent by this one`,
    });
  });

  test('energised names the switch-on the cable could not carry', () => {
    const { met, divergence } = diverge(w5_05, 1, 'energised', (sim, botId) => {
      playerApi(sim, botId, 'w5-05').power('sub-1', 'on');
    });
    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: 'tick 0 · sub-1',
      expected: 'a live cable already reaching it',
      received: 'nothing live was joined to it',
    });
  });

  /**
   * The star never names the station and never gives the figure. A run that filed nothing is told
   * a line was wanted; a run that named the wrong station gets its own line back and no hint at
   * which one it should have been.
   */
  test('name-the-weak-link says a line was wanted when the run filed none', () => {
    const world = w5_05.build(1);
    const stations = world.machines.filter((machine) => machine.id.startsWith('sub-'));
    const { met, divergence } = diverge(w5_05, 1, 'name-the-weak-link', starDriver(stations.length));
    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: 'the outage report',
      expected: 'a line naming what the district hangs off',
      received: '(nothing)',
    });
  });

  test('name-the-weak-link hands a wrong station back without naming the right one', () => {
    const world = w5_05.build(1);
    const count = world.machines.filter((machine) => machine.id.startsWith('sub-')).length;
    const { met, divergence } = diverge(w5_05, 1, 'name-the-weak-link', (sim, botId) => {
      const api = playerApi(sim, botId, 'w5-05');
      // One long chain: the far end of it carries the district, and sub-1 is the leaf.
      api.link('reactor', `sub-${String(count)}`);
      for (let i = count - 1; i >= 1; i--) api.link(`sub-${String(i + 1)}`, `sub-${String(i)}`);
      api.print('weak sub-1 99');
    });
    expect(met).toBe(false);
    const shown = must(divergence, 'a divergence');
    expect(shown.where).toBe('the outage report');
    expect(shown.expected).toBe('a different station');
    expect(shown.received).toBe('weak sub-1 99');
  });

  /* Naming the right station and miscounting it is told only that the figure is wrong. */
  test('name-the-weak-link confirms nothing but the station when the count is off', () => {
    const world = w5_05.build(1);
    const count = world.machines.filter((machine) => machine.id.startsWith('sub-')).length;
    const { met, divergence } = diverge(w5_05, 1, 'name-the-weak-link', (sim, botId) => {
      const api = playerApi(sim, botId, 'w5-05');
      api.link('reactor', `sub-${String(count)}`);
      for (let i = count - 1; i >= 1; i--) api.link(`sub-${String(i + 1)}`, `sub-${String(i)}`);
      api.print(`weak sub-${String(count)} 1`);
    });
    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: `sub-${String(count)}`,
      expected: 'a different figure',
      received: '1',
    });
  });
});
