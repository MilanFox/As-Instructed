/**
 * What World 7's objectives say when they are missed.
 *
 * A fleet is the hardest thing in the game to read a `not met` off, because there is no single
 * bot to look at: the clock stops when the last one stops, and `3 of 6` never says which three.
 * Every test here drives a fleet that is wrong in one specific way — one bot left in its
 * corridor, one that never caught up in time to hear anything, one that walked into a wall, one
 * job left four uses short — and asserts the report names the bot, the tick or the tile.
 *
 * `w7-05/sites-up` gets the opposite assertion: it must never print a site's coordinates, because
 * the sites are on no plan and finding them is the level.
 */
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

function diverge(level: LevelDef, seed: number, id: string, drive: (sim: Sim, bot: number) => void) {
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

// ---------------------------------------------------------------------------
// w7-01 — two bots
// ---------------------------------------------------------------------------

describe('w7-01 names the bot rather than counting them', () => {
  test('a fleet that never moved is told which bot, its pad and where it stands', () => {
    const world = w7_01.build(1);
    const start = must(world.bots[0], 'the first bot').at;
    const { report } = diverge(w7_01, 1, 'both-parked', () => undefined);

    expect(report.met).toBe(false);
    expect(report.divergence).toEqual({
      where: 'bot #0',
      expected: '(7, 1)',
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

  /**
   * `recv` hands back null until the reader's own clock reaches the tick the message was sent at,
   * which is the whole difficulty of the level. A bot that asked three times too early and a bot
   * that never asked at all are different mistakes and used to read identically.
   */
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

  test('a fleet that filed no idle report is told which bot is missing from it', () => {
    const { report } = diverge(w7_01, 1, 'name-the-idle', () => undefined);

    expect(report.met).toBe(false);
    expect(report.divergence).toEqual({
      where: 'bot #0',
      expected: 'a line saying how long it stood still',
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
    expect(shown.expected).toBe('a different figure');
    expect(shown.received).toBe('idle 0 0');
  });
});

// ---------------------------------------------------------------------------
// w7-02 — the field
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// w7-03 — the tunnel
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// w7-04 — dispatch
// ---------------------------------------------------------------------------

describe('w7-04 names the job and how far into it the fleet got', () => {
  test('an untouched board is told the first job and what it costs', () => {
    const { report } = diverge(w7_04, 1, 'board-clear', () => undefined);
    const shown = must(report.divergence, 'a divergence');

    expect(report.met).toBe(false);
    expect(shown.where).toBe('job-0');
    expect(shown.expected).toBe('done');
    expect(shown.received).toMatch(/^0 of \d+ uses$/);
  });

  /**
   * Dealing the board out in advance is correct on the flat seed and roughly doubles the shift on
   * the skewed one, which is the whole level. What it could not read before is *which* job it
   * left behind and how far in.
   */
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
      expected: 'a line naming the job that finished last',
      received: '(nothing)',
    });
  });

  /** Naming the wrong job gives back that job's own closing tick, never the right job. */
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

// ---------------------------------------------------------------------------
// w7-05 — chain of command
// ---------------------------------------------------------------------------

/** The order rule reads only the `use` and `recv` log, so the log is written rather than driven. */
function contextFrom(initialWorld: World, events: readonly TraceEvent[]): ObjectiveContext {
  const trace: Trace = {
    initialWorld,
    events: [...events],
    keyframes: [],
    endTick: Math.max(0, ...events.map((event) => event.t + 1)),
  };
  return { world: cloneWorld(initialWorld), initialWorld, trace };
}

describe('w7-05 names the site and the bot that jumped its orders', () => {
  test('a fleet that never left the muster is told how near it got to the first site', () => {
    const { report } = diverge(w7_05, 1, 'sites-up', () => undefined);

    expect(report.met).toBe(false);
    expect(report.divergence).toEqual({
      where: 'site-0',
      expected: 'on',
      received: 'cold, never reached',
    });
  });

  /**
   * `probe()` with no argument is the only thing on this level that finds a site. A coordinate in
   * the report would not be a diff, it would be the search.
   */
  test('no part of the report says where a site is', () => {
    const world = w7_05.build(1);
    const site = must(
      world.machines.find((machine) => machine.id === 'site-0'),
      'site-0',
    );
    const { report } = diverge(w7_05, 1, 'sites-up', () => undefined);
    const shown = must(report.divergence, 'a divergence');
    const whole = `${shown.where} ${shown.expected} ${shown.received}`;

    expect(whole).not.toContain(String(site.at.x));
    expect(whole).not.toMatch(/\(\d+, \d+\)/);
  });

  test('a bot that switched a site on with an empty inbox is told the tick it did it', () => {
    const initialWorld = w7_05.build(1);
    const site = must(
      initialWorld.machines.find((machine) => machine.id === 'site-0'),
      'site-0',
    );
    const objective = objectiveIn(w7_05, 'told-where-to-go');
    const ctx = contextFrom(initialWorld, [
      { t: 12, botId: 2, dt: 1, kind: 'use', at: site.at, machineId: site.id, ok: true },
    ]);

    expect(objective.evaluate(ctx)).toBe(false);
    expect(objective.divergence?.(ctx)).toEqual({
      where: 'bot #2 · tick 12',
      expected: 'an order read before this',
      received: 'no order all shift',
    });
  });

  /**
   * The rule is read against the *bot's own clock*, not the order the calls were written in: a
   * message stamped at tick 30 has not been handed to a bot standing at tick 12, however early
   * the `recv` appears in the program.
   */
  test('a bot that read an order stamped later is told both ticks', () => {
    const initialWorld = w7_05.build(1);
    const site = must(
      initialWorld.machines.find((machine) => machine.id === 'site-0'),
      'site-0',
    );
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

  test('a fleet that stood about is told its idle total and which bot was worst', () => {
    const { report } = diverge(w7_05, 1, 'workers-busy', (sim) => {
      for (const id of sim.botIds()) sim.wait(id, 5);
    });
    const shown = must(report.divergence, 'a divergence');

    expect(report.met).toBe(false);
    expect(shown.where).toMatch(/^bot #\d+ waited longest$/);
    expect(shown.expected).toMatch(/^under \d+ idle ticks in all$/);
    expect(shown.received).toMatch(/^\d+ in all, \d+ on this bot$/);
  });
});
