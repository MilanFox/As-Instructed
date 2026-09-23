import { describe, expect, test } from 'vitest';
import type { Machine, Objective, Sim, UseEvent } from '../../../engine/index.ts';
import { Dir, machineById, manhattan } from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { runLevel } from '../../harness.ts';
import type { LevelDef } from '../../types.ts';
import { playerApi } from '../__solutions__/_api.ts';
import { at } from '../objectives.ts';
import { w5_01 } from '../w5-01.ts';
import { w5_02 } from '../w5-02.ts';
import { gridPlan, lowestIdOrder, stationWaves, w5_03 } from '../w5-03.ts';
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
    const first = must(withPrefix(w5_01, 1, 'sub-')[0], 'the first station');
    const { met, divergence } = nowhere(w5_01, 1, 'energised');
    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: `${first.id} · ${at(first.at)}`,
      expected: 'on',
      received: 'off',
    });
  });

  test('in-order names the pair and the tick when a station is latched too early', () => {
    const first = must(withPrefix(w5_01, 1, 'sub-')[0], 'the first station');
    const second = must(withPrefix(w5_01, 1, 'sub-')[1], 'the second station');
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
      where: `tick ${String(latch.t)} · ${second.id}`,
      expected: `${first.id} already on`,
      received: `${first.id} was still off`,
    });
  });

  test('a run that latched nothing is told which station, and what feeds it', () => {
    const first = must(withPrefix(w5_01, 1, 'sub-')[0], 'the first station');
    expect(nowhere(w5_01, 1, 'in-order').divergence).toEqual({
      where: `${first.id} · ${at(first.at)}`,
      expected: 'switched on after reactor',
      received: 'never switched on',
    });
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

describe('w5-03 — the cable, the order and the waves', () => {
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
    const downstream = must(
      withPrefix(w5_03, 2, 'sub-').find((machine) =>
        Object.keys(machine.vars).some((key) => key.startsWith('prereq:sub-')),
      ),
      'a station waiting on another station',
    );
    const waits = must(
      Object.keys(downstream.vars)
        .find((key) => key.startsWith('prereq:sub-'))
        ?.slice('prereq:'.length),
      'its upstream',
    );

    const { met, divergence } = diverge(w5_03, 2, 'in-order', (sim, botId) => {
      playerApi(sim, botId, 'w5-03').power(downstream.id, 'on');
    });
    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: `tick 0 · ${downstream.id}`,
      expected: `${waits} already on`,
      received: `${waits} was still off`,
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

  test('a bare ascending loop over the ids is refused on every seed', () => {
    for (const seed of w5_03.seeds) {
      const count = withPrefix(w5_03, seed, 'sub-').length;
      const { met } = diverge(w5_03, seed, 'in-order', (sim, botId) => {
        const { link, power } = playerApi(sim, botId, 'w5-03');
        for (let i = 1; i <= count; i++) link('reactor', `sub-${String(i)}`);
        for (let i = 1; i <= count; i++) power(`sub-${String(i)}`, 'on');
      });
      expect(met, `seed ${String(seed)}`).toBe(false);
    }
  });

  test('one-wave-at-a-time names the station, its tick and the wave left behind', () => {
    const { stations } = gridPlan(1);
    const order = lowestIdOrder(stations);
    const waves = stationWaves(stations);
    const { met, divergence } = diverge(w5_03, 1, 'one-wave-at-a-time', (sim, botId) => {
      const { link, power } = playerApi(sim, botId, 'w5-03');
      for (const station of stations) {
        for (const upstream of station.prereqs) link(upstream, station.id);
      }
      for (const id of order) power(id, 'on');
    });

    expect(met).toBe(false);
    const shown = must(divergence, 'a divergence');
    const match = must(/^tick (\d+) · (sub-\d+), wave (\d+)$/.exec(shown.where), shown.where);
    const [, , id, wave] = match;
    expect(Number(wave)).toBe(waves.get(id ?? ''));
    expect(shown.expected).toMatch(/^wave \d+ all up$/);
    expect(Number(/\d+/.exec(shown.expected)?.[0])).toBeLessThan(Number(wave));
    expect(shown.received).toMatch(/^sub-\d+ still off$/);
    for (const text of [shown.where, shown.expected, shown.received]) {
      expect(text.length).toBeLessThanOrEqual(44);
    }
  });
});

describe('w5-04 — the consumer, the segment and the reserve', () => {
  test('on-a-tap names the first consumer left on nothing, and its tile', () => {
    const first = must(withPrefix(w5_04, 1, 'consumer-')[0], 'consumer-1');
    const { met, divergence } = nowhere(w5_04, 1, 'on-a-tap');
    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: `consumer-1 · ${at(first.at)}`,
      expected: 'exactly 1 tap',
      received: '(nothing)',
    });
  });

  test('a consumer cabled twice, or to a junction, is told what it ended up on', () => {
    const first = must(withPrefix(w5_04, 1, 'consumer-')[0], 'consumer-1');
    const twice = diverge(w5_04, 1, 'on-a-tap', (sim, botId) => {
      const { link } = playerApi(sim, botId, 'w5-04');
      link('tap-1', 'consumer-1');
      link('tap-2', 'consumer-1');
    });
    expect(twice.met).toBe(false);
    expect(twice.divergence).toEqual({
      where: `consumer-1 · ${at(first.at)}`,
      expected: 'exactly 1 tap',
      received: 'tap-1, tap-2',
    });
    const junction = diverge(w5_04, 1, 'on-a-tap', (sim, botId) => {
      playerApi(sim, botId, 'w5-04').link('junction-1', 'consumer-1');
    });
    expect(junction.divergence?.received).toBe('junction-1');
  });

  test('within-ceiling names the segment, its ceiling and what it ended up carrying', () => {
    const consumers = withPrefix(w5_04, 1, 'consumer-');
    const load = consumers.reduce((sum, consumer) => sum + (consumer.vars.draw ?? 0), 0);
    const trunk = must(
      withPrefix(w5_04, 1, 'junction-').find((machine) => machine.id === 'junction-1'),
      'junction-1',
    );

    const { met, divergence } = diverge(w5_04, 1, 'within-ceiling', (sim, botId) => {
      const { link } = playerApi(sim, botId, 'w5-04');
      for (const consumer of consumers) link('tap-1', consumer.id);
    });
    expect(met).toBe(false);
    const shown = must(divergence, 'a divergence');
    expect(shown).toEqual({
      where: `reactor → ${trunk.id}`,
      expected: `at most ${String(trunk.vars.ceiling ?? 0)}`,
      received: `${String(load)}, from ${String(consumers.length)} consumers`,
    });
    for (const text of [shown.where, shown.expected, shown.received]) {
      expect(text.length).toBeLessThanOrEqual(44);
    }
  });

  test('reserve-kept names the segment above the reserve that ran short, and its load', () => {
    const world = w5_04.build(1);
    const reserved = must(
      world.machines.find((machine) => machine.vars.reserve !== undefined),
      'the reserve',
    );
    const ceiling = reserved.vars.ceiling ?? 0;
    const eights = world.machines.filter(
      (machine) => machine.id.startsWith('consumer-') && machine.vars.draw === 8,
    );
    const parent = must(
      Object.keys(reserved.vars).find((name) => name.startsWith('fed:')),
      'fed:',
    ).slice('fed:'.length);

    const { met, divergence } = diverge(w5_04, 1, 'reserve-kept', (sim, botId) => {
      playerApi(sim, botId, 'w5-04').link(reserved.id, must(eights[0], 'an 8').id);
    });
    expect(met).toBe(false);
    const shown = must(divergence, 'a divergence');
    expect(shown.where).toBe(`${parent} → ${reserved.id}`);
    expect(shown.expected).toBe('8 spare');
    expect(shown.received).toBe(`8 of ${String(ceiling)} carried`);
    for (const text of [shown.where, shown.expected, shown.received]) {
      expect(text.length).toBeLessThanOrEqual(44);
    }
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

  test('energised looks past a switch-on the run came back and made good', () => {
    const { met, divergence } = diverge(w5_05, 1, 'energised', (sim, botId) => {
      const { link, power } = playerApi(sim, botId, 'w5-05');
      power('sub-1', 'on');
      link('reactor', 'sub-1');
      power('sub-1', 'on');
    });
    const second = must(withPrefix(w5_05, 1, 'sub-')[1], 'sub-2');
    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: `sub-2 · ${at(second.at)}`,
      expected: 'on',
      received: 'off',
    });
  });

  test('name-the-weak-link tells a malformed line what shape was wanted', () => {
    const { met, divergence } = diverge(w5_05, 1, 'name-the-weak-link', (sim, botId) => {
      playerApi(sim, botId, 'w5-05').print('weak sub-1');
    });
    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: 'the outage report',
      expected: 'a line reading `weak <id> <n>`',
      received: 'weak sub-1',
    });
  });

  test('name-the-weak-link says a line was wanted when the run filed none', () => {
    const world = w5_05.build(1);
    const stations = world.machines.filter((machine) => machine.id.startsWith('sub-'));
    const { met, divergence } = diverge(
      w5_05,
      1,
      'name-the-weak-link',
      starDriver(stations.length),
    );
    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: 'the outage report',
      expected: 'a line naming what the district hangs off',
      received: '(nothing)',
    });
  });

  test('name-the-weak-link tells a wrong station what it actually carries', () => {
    const world = w5_05.build(1);
    const count = world.machines.filter((machine) => machine.id.startsWith('sub-')).length;
    const leaf = must(withPrefix(w5_05, 1, 'sub-')[0], 'sub-1');
    const { met, divergence } = diverge(w5_05, 1, 'name-the-weak-link', (sim, botId) => {
      const api = playerApi(sim, botId, 'w5-05');
      api.link('reactor', `sub-${String(count)}`);
      for (let i = count - 1; i >= 1; i--) api.link(`sub-${String(i + 1)}`, `sub-${String(i)}`);
      api.print('weak sub-1 99');
    });
    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: `sub-1 · ${at(leaf.at)}`,
      expected: 'the station the district most hangs off',
      received: '1 dark with it',
    });
  });

  test('name-the-weak-link refuses a name that is not a substation', () => {
    const { met, divergence } = diverge(w5_05, 1, 'name-the-weak-link', (sim, botId) => {
      playerApi(sim, botId, 'w5-05').print('weak reactor 10');
    });
    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: 'the outage report',
      expected: 'a substation in the district',
      received: 'reactor',
    });
  });

  test('name-the-weak-link confirms nothing but the station when the count is off', () => {
    const world = w5_05.build(1);
    const count = world.machines.filter((machine) => machine.id.startsWith('sub-')).length;
    const last = must(withPrefix(w5_05, 1, 'sub-')[count - 1], `sub-${String(count)}`);
    const { met, divergence } = diverge(w5_05, 1, 'name-the-weak-link', (sim, botId) => {
      const api = playerApi(sim, botId, 'w5-05');
      api.link('reactor', `sub-${String(count)}`);
      for (let i = count - 1; i >= 1; i--) api.link(`sub-${String(i + 1)}`, `sub-${String(i)}`);
      api.print(`weak sub-${String(count)} 1`);
    });
    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: `sub-${String(count)} · ${at(last.at)}`,
      expected: 'the count of what goes dark with it',
      received: '1',
    });
  });
});
