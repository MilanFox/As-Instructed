import { describe, expect, test } from 'vitest';
import type { ObjectiveContext, Sim } from '../../../engine/index.ts';
import { Dir, evaluateObjectives } from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { runLevel, runReference } from '../../harness.ts';
import { SOLUTIONS } from '../../__tests__/solutions.ts';
import type { ReferenceSolution } from '../../types.ts';
import { w7_01 } from '../w7-01.ts';

function scored(seed: number, drive: (sim: Sim, bot: number) => void) {
  const result = runLevel(w7_01, seed, drive);
  const ctx: ObjectiveContext = {
    world: result.world,
    trace: result.trace,
    initialWorld: result.initialWorld,
    ops: result.ops,
  };
  const required = evaluateObjectives(w7_01.objectives, ctx);
  const stars = evaluateObjectives(w7_01.bonus ?? [], ctx);
  const find = (reports: typeof required, id: string) =>
    must(
      reports.find((report) => report.id === id),
      id,
    );
  return {
    passed: result.verdict.passed,
    ticks: result.trace.endTick,
    required: (id: string) => find(required, id),
    star: (id: string) => find(stars, id),
  };
}

function scoredReference(seed: number) {
  const solution = SOLUTIONS[w7_01.id] as ReferenceSolution;
  return scored(seed, (sim, botId) => solution.run(sim, botId));
}

const parkAndGreet = (sim: Sim, extraWaits: (index: number) => number): number[] => {
  const ids = sim.botIds();
  const waited = ids.map(() => 0);
  ids.forEach((id, index) => {
    const pause = extraWaits(index);
    if (pause > 0) {
      sim.wait(id, pause);
      waited[index] = pause;
    }
    while (sim.canMove(id, Dir.East)) sim.move(id, Dir.East);
  });
  for (const id of ids) sim.send(id, ids[(ids.indexOf(id) + 1) % ids.length] as number, id);
  return waited;
};

function honestReport(extraWaits: (index: number) => number) {
  return (sim: Sim): void => {
    const ids = sim.botIds();
    const waited = parkAndGreet(sim, extraWaits);
    const before = ids.map((id) => sim.clock(id));
    const aligned = sim.sync();
    for (const id of ids) sim.recv(id);
    ids.forEach((id, index) => {
      const idle = (waited[index] as number) + (aligned - (before[index] as number));
      sim.print(id, `idle ${String(id)} ${String(idle)}`);
    });
  };
}

function ownWaitsOnly(extraWaits: (index: number) => number) {
  return (sim: Sim): void => {
    const ids = sim.botIds();
    const waited = parkAndGreet(sim, extraWaits);
    sim.sync();
    for (const id of ids) sim.recv(id);
    ids.forEach((id, index) => {
      sim.print(id, `idle ${String(id)} ${String(waited[index] as number)}`);
    });
  };
}

const NO_EXTRA = (): number => 0;
const LOPSIDED = (index: number): number => index * 4;

describe('w7-01 required objectives', () => {
  test('the reference clears both of them on every seed', () => {
    for (const seed of w7_01.seeds) {
      const run = scoredReference(seed);
      expect(run.required('both-parked').met, `seed ${String(seed)}`).toBe(true);
      expect(run.required('both-heard').met, `seed ${String(seed)}`).toBe(true);
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.ticks, `seed ${String(seed)}`).toBeLessThanOrEqual(w7_01.par.ticks);
    }
  });

  test('neither of them is a dead objective — a run that does nothing fails both', () => {
    for (const seed of w7_01.seeds) {
      const run = scored(seed, () => undefined);
      expect(run.required('both-parked').met, `seed ${String(seed)}`).toBe(false);
      expect(run.required('both-heard').met, `seed ${String(seed)}`).toBe(false);
    }
  });

  test('parking without ever reading the inbox fails only both-heard', () => {
    for (const seed of w7_01.seeds) {
      const run = scored(seed, (sim) => {
        for (const id of sim.botIds()) while (sim.canMove(id, Dir.East)) sim.move(id, Dir.East);
      });
      expect(run.required('both-parked').met, `seed ${String(seed)}`).toBe(true);
      expect(run.required('both-heard').met, `seed ${String(seed)}`).toBe(false);
    }
  });
});

describe('w7-01 name-the-idle grades the report, not the walk', () => {
  test('the reference takes the star on every seed', () => {
    for (const seed of w7_01.seeds) {
      expect(scoredReference(seed).star('name-the-idle').met, `seed ${String(seed)}`).toBe(true);
    }
  });

  test('a slow run that still counts honestly takes the star on every seed', () => {
    for (const seed of w7_01.seeds) {
      const run = scored(seed, honestReport(LOPSIDED));
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.star('name-the-idle').met, `seed ${String(seed)}`).toBe(true);
      expect(run.ticks, `seed ${String(seed)}`).toBeGreaterThan(scoredReference(seed).ticks);
    }
  });

  test('counting only its own wait calls misses the star wherever sync() costs anything', () => {
    const missed = w7_01.seeds.filter(
      (seed) => !scored(seed, ownWaitsOnly(NO_EXTRA)).star('name-the-idle').met,
    );

    expect(missed).toEqual([1, 2]);
    expect(scored(3, ownWaitsOnly(NO_EXTRA)).star('name-the-idle').met).toBe(true);
  });

  test('sending before walking fails both-heard on every seed', () => {
    for (const seed of w7_01.seeds) {
      const run = scored(seed, (sim) => {
        const ids = sim.botIds();
        for (const id of ids) sim.send(id, ids[(ids.indexOf(id) + 1) % ids.length] as number, id);
        for (const id of ids) while (sim.canMove(id, Dir.East)) sim.move(id, Dir.East);
        for (const id of ids) {
          sim.recv(id);
          sim.print(id, `idle ${String(id)} 0`);
        }
      });
      expect(run.required('both-parked').met, `seed ${String(seed)}`).toBe(true);
      expect(run.required('both-heard').met, `seed ${String(seed)}`).toBe(false);
      expect(run.passed, `seed ${String(seed)}`).toBe(false);
    }
  });

  test('polling with wait() and counting its own clock takes the star on every seed', () => {
    for (const seed of w7_01.seeds) {
      const run = scored(seed, (sim) => {
        const ids = sim.botIds();
        const walked = ids.map((id) => {
          let steps = 0;
          while (sim.canMove(id, Dir.East)) {
            sim.move(id, Dir.East);
            steps++;
          }
          return steps;
        });
        for (const id of ids)
          sim.send(id, ids[(ids.indexOf(id) + 1) % ids.length] as number, 'here');
        [...ids].reverse().forEach((id) => {
          while (sim.recv(id) === null) sim.wait(id);
          const idle = sim.clock(id) - (walked[ids.indexOf(id)] as number) - 1;
          sim.print(id, `idle ${String(id)} ${String(idle)}`);
        });
      });
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.ticks, `seed ${String(seed)}`).toBeLessThanOrEqual(w7_01.par.ticks);
      expect(run.star('name-the-idle').met, `seed ${String(seed)}`).toBe(true);
    }
  });

  test('burning ticks on a wall instead of wait() still counts as waiting', () => {
    const blind = (sim: Sim): void => {
      const ids = sim.botIds();
      for (const id of ids) while (sim.canMove(id, Dir.East)) sim.move(id, Dir.East);
      for (const id of ids) sim.send(id, ids[(ids.indexOf(id) + 1) % ids.length] as number, id);
      for (const id of ids) {
        while (sim.recv(id) === null) sim.move(id, Dir.North);
        sim.print(id, `idle ${String(id)} 0`);
      }
    };
    const missed = w7_01.seeds.filter((seed) => {
      const run = scored(seed, blind);
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      return !run.star('name-the-idle').met;
    });
    expect(missed).toEqual([1, 2]);
  });

  test('once the two bots are out of step, ignoring sync() misses the star on every seed', () => {
    for (const seed of w7_01.seeds) {
      const run = scored(seed, ownWaitsOnly(LOPSIDED));
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.star('name-the-idle').met, `seed ${String(seed)}`).toBe(false);
    }
  });
});

describe('w7-01 says where the report went wrong', () => {
  test('a wrong figure names the bot and what the line should have counted', () => {
    const run = scored(1, ownWaitsOnly(NO_EXTRA));
    const shown = must(run.star('name-the-idle').divergence, 'a divergence');

    expect(shown.where).toBe('bot #1');
    expect(shown.expected).toBe('ticks past its walk and one send');
    expect(shown.received).toBe('idle 1 0');
  });

  test('every string the star can print fits the divergence cap', () => {
    const drives: ((sim: Sim, bot: number) => void)[] = [
      () => undefined,
      ownWaitsOnly(NO_EXTRA),
      ownWaitsOnly(LOPSIDED),
      (sim) => {
        honestReport(NO_EXTRA)(sim);
        sim.print(0, 'idle 9 9');
      },
      (sim) => {
        parkAndGreet(sim, NO_EXTRA);
        sim.sync();
        for (const id of sim.botIds()) sim.recv(id);
        sim.print(1, 'idle 1 0');
      },
    ];
    for (const seed of w7_01.seeds) {
      for (const drive of drives) {
        const shown = scored(seed, drive).star('name-the-idle').divergence;
        if (!shown) continue;
        expect(shown.where.length, shown.where).toBeLessThanOrEqual(44);
        expect(shown.expected.length, shown.expected).toBeLessThanOrEqual(44);
        expect(shown.received.length, shown.received).toBeLessThanOrEqual(44);
        expect(shown.expected).not.toBe('a different figure');
      }
    }
  });
});

describe('w7-01 brief', () => {
  test('it stays vibe, and the star has a reason in it', () => {
    const words = w7_01.brief.trim().split(/\s+/).filter(Boolean).length;

    const flat = w7_01.brief.replace(/\s+/g, ' ');

    expect(words).toBeLessThanOrEqual(68);
    expect(flat).toContain('the office wants to know how long each bot waited');
    expect(flat).not.toMatch(/finish time of the last one/i);
  });

  test('the scoring rule the brief used to explain lives in facts', () => {
    const facts = w7_01.facts ?? [];

    expect(facts.find((fact) => fact.label === 'Score')?.value).toMatch(/last/i);
    expect(facts.find((fact) => fact.label === 'Clocks')?.value).toMatch(/at once/i);
  });
});

function referenceSanity(seed: number): void {
  const solution = SOLUTIONS[w7_01.id] as ReferenceSolution;
  const result = runReference(w7_01, seed, solution);
  expect(result.verdict.passed, `seed ${String(seed)}`).toBe(true);
}

describe('w7-01 reference', () => {
  test('runs clean on every seed', () => {
    for (const seed of w7_01.seeds) referenceSanity(seed);
  });
});
