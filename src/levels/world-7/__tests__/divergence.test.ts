import { describe, expect, test } from 'vitest';
import type {
  Objective,
  ObjectiveContext,
  Sim,
  Trace,
  TraceEvent,
  World,
} from '../../../engine/index.ts';
import { Dir, cloneWorld, evaluateObjectives, vec } from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { runLevel } from '../../harness.ts';
import { roundRobinDispatch } from '../../__tests__/naive.ts';
import type { LevelDef } from '../../types.ts';
import { w7_01 } from '../w7-01.ts';
import { w7_02 } from '../w7-02.ts';
import { w7_03 } from '../w7-03.ts';
import { w7_04 } from '../w7-04.ts';
import { w7_05 } from '../w7-05.ts';

function objectiveIn(level: LevelDef, id: string): Objective {
  return must(
    [...level.objectives, ...(level.bonus ?? [])].find((each) => each.id === id),
    id,
  );
}

function diverge(
  level: LevelDef,
  seed: number,
  id: string,
  drive: (sim: Sim, bot: number) => void,
) {
  const result = runLevel(level, seed, drive);
  const ctx: ObjectiveContext = {
    world: result.world,
    trace: result.trace,
    initialWorld: result.initialWorld,
    ops: result.ops,
  };
  const [report] = evaluateObjectives([objectiveIn(level, id)], ctx);
  return { report: must(report, id), ticks: result.trace.endTick };
}

describe('w7-01 names the bot rather than counting them', () => {
  test('a fleet that never moved is told which bot, its pad and where it stands', () => {
    const world = w7_01.build(1);
    const start = must(world.bots[0], 'the first bot').at;
    const { report } = diverge(w7_01, 1, 'both-parked', () => undefined);

    expect(report.met).toBe(false);
    expect(report.divergence).toEqual({
      where: 'bot #0',
      expected: '(8, 1)',
      received: `(${String(start.x)}, ${String(start.y)})`,
    });
  });

  test('a bot that never asked its inbox is told so', () => {
    const { report } = diverge(w7_01, 1, 'both-heard', () => undefined);

    expect(report.met).toBe(false);
    expect(report.divergence).toEqual({
      where: 'bot #0',
      expected: 'a message from the other bot',
      received: 'never called recv()',
    });
  });

  test('a bot that asked too early is told how many reads came back empty', () => {
    const { report } = diverge(w7_01, 1, 'both-heard', (sim) => {
      sim.recv(0);
      sim.recv(0);
      sim.recv(0);
    });

    expect(report.met).toBe(false);
    expect(report.divergence).toEqual({
      where: 'bot #0',
      expected: 'a message from the other bot',
      received: '3 empty recv() calls',
    });
  });

  test('a message sent before the walk is told where it was sent from', () => {
    const { report } = diverge(w7_01, 1, 'both-heard', (sim) => {
      sim.send(1, 0, 'early');
      for (const id of sim.botIds()) while (sim.canMove(id, Dir.East)) sim.move(id, Dir.East);
      sim.recv(0);
    });

    expect(report.met).toBe(false);
    expect(report.divergence).toEqual({
      where: 'bot #0',
      expected: "a message sent from bot #1's pad",
      received: 'one sent from (1, 3)',
    });
  });

  test('a fleet that filed no idle report is told which bot is missing from it', () => {
    const { report } = diverge(w7_01, 1, 'name-the-idle', () => undefined);

    expect(report.met).toBe(false);
    expect(report.divergence).toEqual({
      where: 'bot #0',
      expected: 'a line saying how long it waited',
      received: '(nothing)',
    });
  });

  test('a wrong idle figure is answered with the run own line, never with the answer', () => {
    const { report } = diverge(w7_01, 2, 'name-the-idle', (sim) => {
      for (let n = 0; n < 5; n++) sim.move(1, Dir.East);
      sim.sync();
      for (const id of sim.botIds()) sim.print(id, `idle ${String(id)} 0`);
    });
    const shown = must(report.divergence, 'a divergence');

    expect(report.met).toBe(false);
    expect(shown.where).toBe('bot #0');
    expect(shown.expected).toBe('ticks past its walk and one send');
    expect(shown.received).toBe('idle 0 0');
  });
});

describe('w7-02 names a crop rather than counting them', () => {
  test('an unharvested field is told the first crop still standing', () => {
    const { report } = diverge(w7_02, 1, 'field-cleared', () => undefined);

    expect(report.met).toBe(false);
    expect(report.divergence).toEqual({
      where: '(3, 3)',
      expected: 'harvested',
      received: 'still standing, 32 left',
    });
  });

  test('a fleet that let one bot do everything is told which bot, and by how much', () => {
    const { report } = diverge(w7_02, 1, 'even-share', (sim, botId) => {
      for (let row = 3; row <= 10; row++) {
        for (let column = 3; column <= 6; column++) {
          for (let guard = 0; guard < 32 && sim.pos(botId).y !== row; guard++) {
            sim.move(botId, sim.pos(botId).y < row ? Dir.South : Dir.North);
          }
          for (let guard = 0; guard < 32 && sim.pos(botId).x !== column; guard++) {
            sim.move(botId, sim.pos(botId).x < column ? Dir.East : Dir.West);
          }
          sim.harvest(botId);
        }
      }
    });

    expect(report.met).toBe(false);
    expect(report.divergence).toEqual({
      where: 'bot #0',
      expected: '8 crops or fewer',
      received: '32 crops',
    });
  });
});

describe('w7-03 names a crate and the move that bounced', () => {
  test('a yard nobody cleared is told which crate is in which column', () => {
    const { report } = diverge(w7_03, 1, 'crates-in-silo', () => undefined);
    const shown = must(report.divergence, 'a divergence');

    expect(report.met).toBe(false);
    expect(shown.where).toMatch(/^\(\d+, \d+\)$/);
    expect(shown.expected).toBe('column 1');
    expect(shown.received).toMatch(/^column \d+$/);
    expect(shown.received).not.toBe(shown.expected);
  });

  test('a fleet that pushed into the west wall is told the bot, the tick and the tile', () => {
    const { report } = diverge(w7_03, 1, 'no-bumps', (sim) => {
      for (const id of sim.botIds()) {
        for (let n = 0; n < 10; n++) sim.move(id, Dir.West);
      }
    });

    expect(report.met).toBe(false);
    expect(report.divergence).toEqual({
      where: 'bot #0 · tick 1',
      expected: 'a clear tile at (0, 1)',
      received: 'a wall',
    });
  });
});

describe('w7-04 names the job and how far into it the fleet got', () => {
  test('an untouched board is told the first job and what it costs', () => {
    const { report } = diverge(w7_04, 1, 'board-clear', () => undefined);
    const shown = must(report.divergence, 'a divergence');

    expect(report.met).toBe(false);
    expect(shown.where).toBe('job-0');
    expect(shown.expected).toBe('done');
    expect(shown.received).toMatch(/^0 of \d+ uses$/);
  });

  test('the round-robin deal is told which job it left short', () => {
    const { report } = diverge(w7_04, 3, 'board-clear', (sim, botId) => {
      roundRobinDispatch.run(sim, botId);
    });
    const shown = must(report.divergence, 'a divergence');

    expect(report.met).toBe(false);
    expect(shown.where).toMatch(/^job-\d+$/);
    expect(shown.expected).toBe('done');
    expect(shown.received).toMatch(/^\d+ of \d+ uses$/);
  });

  test('a shift report that files no line at all is told what is missing', () => {
    const { report } = diverge(w7_04, 1, 'name-the-decider', (sim, botId) => {
      roundRobinDispatch.run(sim, botId);
    });

    expect(report.met).toBe(false);
    expect(report.divergence).toEqual({
      where: 'the shift report',
      expected: 'a line naming the last job to finish',
      received: '(nothing)',
    });
  });

  test('naming a job that closed earlier is priced against the run own makespan', () => {
    const { report } = diverge(w7_04, 1, 'name-the-decider', (sim, botId) => {
      roundRobinDispatch.run(sim, botId);
      sim.print(botId, 'last job-0 1');
    });
    const shown = must(report.divergence, 'a divergence');

    expect(report.met).toBe(false);
    expect(shown.where).toBe('job-0');
    expect(shown.expected).toMatch(/^a job that closed at tick \d+$/);
    expect(shown.received).toMatch(/^closed at tick \d+$/);
  });
});

function contextFrom(initialWorld: World, events: readonly TraceEvent[]): ObjectiveContext {
  const trace: Trace = {
    initialWorld,
    events: [...events],
    keyframes: [],
    endTick: Math.max(0, ...events.map((event) => event.t + 1)),
  };
  return { world: cloneWorld(initialWorld), initialWorld, trace };
}

const firstSite = (world: World) =>
  must(
    world.machines.find((machine) => machine.id.startsWith('site-')),
    'a relay site',
  );

describe('w7-05 names the site and the bot that jumped its orders', () => {
  test('a fleet that never left the muster is told how near it got to the first site', () => {
    const { report } = diverge(w7_05, 1, 'sites-up', () => undefined);

    expect(report.met).toBe(false);
    expect(report.divergence).toEqual({
      where: firstSite(w7_05.build(1)).id,
      expected: 'on',
      received: 'cold, never reached',
    });
  });

  test('no part of the report says where a site is', () => {
    const site = firstSite(w7_05.build(1));
    const { report } = diverge(w7_05, 1, 'sites-up', () => undefined);
    const shown = must(report.divergence, 'a divergence');
    const whole = `${shown.where} ${shown.expected} ${shown.received}`;

    expect(whole).not.toContain(String(site.at.x));
    expect(whole).not.toMatch(/\(\d+, \d+\)/);
  });

  test('a bot that switched a site on with an empty inbox is told the tick it did it', () => {
    const initialWorld = w7_05.build(1);
    const site = firstSite(initialWorld);
    const objective = objectiveIn(w7_05, 'told-where-to-go');
    const ctx = contextFrom(initialWorld, [
      { t: 12, botId: 2, dt: 1, kind: 'use', at: site.at, machineId: site.id, ok: true },
    ]);

    expect(objective.evaluate(ctx)).toBe(false);
    expect(objective.divergence?.(ctx)).toEqual({
      where: 'bot #2 · tick 12',
      expected: 'an order read before this',
      received: 'no order in the run',
    });
  });

  test('a bot that read an order stamped later is told both ticks', () => {
    const initialWorld = w7_05.build(1);
    const site = firstSite(initialWorld);
    const objective = objectiveIn(w7_05, 'told-where-to-go');
    const ctx = contextFrom(initialWorld, [
      { t: 30, botId: 2, dt: 0, kind: 'recv', from: 0, body: 'go' },
      { t: 12, botId: 2, dt: 1, kind: 'use', at: site.at, machineId: site.id, ok: true },
    ]);

    expect(objective.evaluate(ctx)).toBe(false);
    expect(objective.divergence?.(ctx)).toEqual({
      where: 'bot #2 · tick 12',
      expected: 'an order read before this',
      received: 'first order at tick 30',
    });
  });

  test('a run that reached no site at all is given the count instead', () => {
    const initialWorld = w7_05.build(1);
    const objective = objectiveIn(w7_05, 'told-where-to-go');
    const ctx = contextFrom(initialWorld, [
      { t: 3, botId: 1, dt: 1, kind: 'use', at: vec(2, 2), machineId: null, ok: true },
    ]);

    expect(objective.evaluate(ctx)).toBe(false);
    expect(objective.divergence?.(ctx)).toEqual({
      where: 'the relay sites',
      expected: 'all 6 switched on under orders',
      received: '0 of 6',
    });
  });

  test('a relay that deals the same site twice is told which bot already had it', () => {
    const initialWorld = w7_05.build(1);
    const objective = objectiveIn(w7_05, 'one-order-per-site');
    const ctx = contextFrom(initialWorld, [
      { t: 3, botId: 0, dt: 0, kind: 'send', to: 2, body: 412, ok: true },
      { t: 5, botId: 0, dt: 0, kind: 'send', to: 4, body: 412, ok: true },
    ]);

    expect(objective.evaluate(ctx)).toBe(false);
    expect(objective.divergence?.(ctx)).toEqual({
      where: 'bot #4 · tick 5',
      expected: 'an order no other bot had',
      received: 'the order bot #2 already had',
    });
  });
});
