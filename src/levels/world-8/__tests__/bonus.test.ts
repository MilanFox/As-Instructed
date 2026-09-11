import { describe, expect, test } from 'vitest';
import type { ObjectiveContext, Sim, Trace } from '../../../engine/index.ts';
import { evaluateObjectives, machineById, manhattan } from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { runLevel, runReference } from '../../harness.ts';
import { SOLUTIONS } from '../../__tests__/solutions.ts';
import type { LevelDef, ReferenceSolution } from '../../types.ts';
import { w8_01 } from '../w8-01.ts';
import { w8_02 } from '../w8-02.ts';
import { w8_04 } from '../w8-04.ts';
import { w8_05 } from '../w8-05.ts';

function starsOn(level: LevelDef, ctx: ObjectiveContext) {
  const scored = evaluateObjectives(level.bonus ?? [], ctx);
  return (id: string): boolean =>
    must(
      scored.find((star) => star.id === id),
      id,
    ).met;
}

function referenceEarns(level: LevelDef, id: string): void {
  const solution = SOLUTIONS[level.id] as ReferenceSolution;
  for (const seed of level.seeds) {
    const result = runReference(level, seed, solution);
    const met = starsOn(level, {
      world: result.world,
      trace: result.trace,
      initialWorld: result.initialWorld,
      ops: result.ops,
    });
    expect(result.verdict.passed, `${level.id} seed ${String(seed)}`).toBe(true);
    expect(met(id), `${level.id} seed ${String(seed)}`).toBe(true);
  }
}

function reportedAs(
  level: LevelDef,
  seed: number,
  keyword: string,
  rewrite: (line: string) => string | null,
) {
  const solution = SOLUTIONS[level.id] as ReferenceSolution;
  const result = runReference(level, seed, solution);
  const events = result.trace.events.flatMap((event) => {
    if (event.kind !== 'print' || !event.text.startsWith(`${keyword} `)) return [event];
    const line = rewrite(event.text);
    return line === null ? [] : [{ ...event, text: line }];
  });
  const trace: Trace = { ...result.trace, events };
  return {
    passed: result.verdict.passed,
    met: starsOn(level, {
      world: result.world,
      trace,
      initialWorld: result.initialWorld,
      ops: result.ops,
    }),
  };
}

const idle = (sim: Sim, botId: number): void => {
  sim.print(botId, 'nothing');
};

describe('w8-01 name-the-row', () => {
  test('the reference solution earns it on every seed', () => {
    referenceEarns(w8_01, 'name-the-row');
  });

  test('the same run without its audit note is refused on every seed', () => {
    for (const seed of w8_01.seeds) {
      const run = reportedAs(w8_01, seed, 'row', () => null);
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.met('name-the-row'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('the right count under the wrong row is refused', () => {
    const earned = w8_01.seeds.filter((seed) =>
      reportedAs(w8_01, seed, 'row', (line) => `row 0 ${line.split(' ')[2] ?? ''}`).met(
        'name-the-row',
      ),
    );
    expect(earned.length).toBeLessThan(w8_01.seeds.length);
  });

  test('one memorised line does not carry the campaign', () => {
    for (const guess of ['row 2 4', 'row 9 3', 'row 0 1']) {
      const all = w8_01.seeds.every((seed) =>
        reportedAs(w8_01, seed, 'row', () => guess).met('name-the-row'),
      );
      expect(all, guess).toBe(false);
    }
  });

  test('a program that does nothing is refused it on every seed', () => {
    for (const seed of w8_01.seeds) {
      const result = runLevel(w8_01, seed, idle);
      const met = starsOn(w8_01, {
        world: result.world,
        trace: result.trace,
        initialWorld: result.initialWorld,
        ops: result.ops,
      });
      expect(met('name-the-row'), `seed ${String(seed)}`).toBe(false);
    }
  });
});

describe('w8-04 read-the-plan', () => {
  test('the reference solution earns it on every seed', () => {
    referenceEarns(w8_04, 'read-the-plan');
  });

  test('the same run without its reading is refused on every seed', () => {
    for (const seed of w8_04.seeds) {
      const run = reportedAs(w8_04, seed, 'plan', () => null);
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.met('read-the-plan'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('a guessed shift is refused, and no one shift is right on every layout', () => {
    for (const guess of [13, 41, 58, 77, 94]) {
      const all = w8_04.seeds.every((seed) =>
        reportedAs(
          w8_04,
          seed,
          'plan',
          (line) => `plan ${String(guess)} ${line.split(' ')[2] ?? ''}`,
        ).met('read-the-plan'),
      );
      expect(all, String(guess)).toBe(false);
    }
  });

  test('the shift a run that never decoded would file is refused on every seed', () => {
    for (const seed of w8_04.seeds) {
      const run = reportedAs(w8_04, seed, 'plan', (line) => `plan 0 ${line.split(' ')[2] ?? ''}`);
      expect(run.met('read-the-plan'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('the right shift under a wrong leg count is refused on every seed', () => {
    for (const seed of w8_04.seeds) {
      const run = reportedAs(w8_04, seed, 'plan', (line) => {
        const parts = line.split(' ');
        return `plan ${parts[1] ?? ''} ${String(Number(parts[2]) + 1)}`;
      });
      expect(run.met('read-the-plan'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('a program that does nothing is refused it on every seed', () => {
    for (const seed of w8_04.seeds) {
      const result = runLevel(w8_04, seed, idle);
      const met = starsOn(w8_04, {
        world: result.world,
        trace: result.trace,
        initialWorld: result.initialWorld,
        ops: result.ops,
      });
      expect(met('read-the-plan'), `seed ${String(seed)}`).toBe(false);
    }
  });
});

function otherStation(seed: number, id: string): string {
  const world = w8_05.build(seed);
  return must(
    world.machines.find((machine) => machine.id.startsWith('sub-') && machine.id !== id),
    'a second substation',
  ).id;
}

function rootStation(seed: number): string {
  const world = w8_05.build(seed);
  return must(
    world.machines.find(
      (machine) => machine.id.startsWith('sub-') && (machine.vars['deps'] ?? 0) === 0,
    ),
    'a substation with no feeder',
  ).id;
}

describe('w8-05 name-the-hold', () => {
  test('the reference solution earns it on every seed', () => {
    referenceEarns(w8_05, 'name-the-hold');
  });

  test('the same run without its hand-over note is refused on every seed', () => {
    for (const seed of w8_05.seeds) {
      const run = reportedAs(w8_05, seed, 'held', () => null);
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.met('name-the-hold'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('the right figure under the wrong station is refused on every seed', () => {
    for (const seed of w8_05.seeds) {
      const root = rootStation(seed);
      const run = reportedAs(
        w8_05,
        seed,
        'held',
        (line) => `held ${root} ${line.split(' ')[2] ?? ''}`,
      );
      expect(run.met('name-the-hold'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('the right station under a wrong figure is refused on every seed', () => {
    for (const seed of w8_05.seeds) {
      const run = reportedAs(w8_05, seed, 'held', (line) => {
        const parts = line.split(' ');
        return `held ${parts[1] ?? ''} ${String(Number(parts[2]) - 1)}`;
      });
      expect(run.met('name-the-hold'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('a program that does nothing is refused it on every seed', () => {
    for (const seed of w8_05.seeds) {
      const result = runLevel(w8_05, seed, idle);
      const met = starsOn(w8_05, {
        world: result.world,
        trace: result.trace,
        initialWorld: result.initialWorld,
        ops: result.ops,
      });
      expect(met('name-the-hold'), `seed ${String(seed)}`).toBe(false);
    }
  });
});

describe('w8-05 mind-the-gate', () => {
  test('the reference solution earns it on every seed', () => {
    referenceEarns(w8_05, 'mind-the-gate');
  });

  test('the same run without its gate note is refused on every seed', () => {
    for (const seed of w8_05.seeds) {
      const run = reportedAs(w8_05, seed, 'gate', () => null);
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.met('mind-the-gate'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('the right figure under the wrong substation is refused on every seed', () => {
    for (const seed of w8_05.seeds) {
      const run = reportedAs(w8_05, seed, 'gate', (line) => {
        const parts = line.split(' ');
        return `gate ${otherStation(seed, parts[1] ?? '')} ${parts[2] ?? ''}`;
      });
      expect(run.met('mind-the-gate'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('the right substation under a wrong figure is refused on every seed', () => {
    for (const seed of w8_05.seeds) {
      const run = reportedAs(w8_05, seed, 'gate', (line) => {
        const parts = line.split(' ');
        return `gate ${parts[1] ?? ''} ${String(Number(parts[2]) + 1)}`;
      });
      expect(run.met('mind-the-gate'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('a guess at the station nearest the gate is refused somewhere in the seed list', () => {
    const refused = w8_05.seeds.filter((seed) => {
      const world = w8_05.build(seed);
      const airlock = must(machineById(world, 'airlock'), 'the airlock');
      const nearest = must(
        world.machines
          .filter((machine) => machine.id.startsWith('sub-'))
          .sort((a, b) => manhattan(a.at, airlock.at) - manhattan(b.at, airlock.at))[0],
        'a substation',
      );
      const run = reportedAs(
        w8_05,
        seed,
        'gate',
        (line) => `gate ${nearest.id} ${line.split(' ')[2] ?? ''}`,
      );
      return !run.met('mind-the-gate');
    });

    expect(refused.length).toBeGreaterThan(0);
  });

  test('the two stars do not answer the same question', () => {
    for (const seed of w8_05.seeds) {
      const run = reportedAs(w8_05, seed, 'gate', (line) => line);
      expect(run.met('mind-the-gate'), `seed ${String(seed)}`).toBe(true);
      expect(run.met('name-the-hold'), `seed ${String(seed)}`).toBe(true);
    }
    const swapped = reportedAs(w8_05, w8_05.seeds[0] as number, 'gate', () => null);
    expect(swapped.met('name-the-hold')).toBe(true);
    expect(swapped.met('mind-the-gate')).toBe(false);
  });

  test('a program that does nothing is refused it on every seed', () => {
    for (const seed of w8_05.seeds) {
      const result = runLevel(w8_05, seed, idle);
      const met = starsOn(w8_05, {
        world: result.world,
        trace: result.trace,
        initialWorld: result.initialWorld,
        ops: result.ops,
      });
      expect(met('mind-the-gate'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('a program that only files the note is refused it on every seed', () => {
    for (const seed of w8_05.seeds) {
      const result = runLevel(w8_05, seed, (sim, botId) => {
        sim.print(botId, 'gate sub-0 0');
      });
      const met = starsOn(w8_05, {
        world: result.world,
        trace: result.trace,
        initialWorld: result.initialWorld,
        ops: result.ops,
      });
      expect(met('mind-the-gate'), `seed ${String(seed)}`).toBe(false);
    }
  });
});

describe('the star World 8 kept is earned on every seed, not on seed one', () => {
  test('w8-02 ship-while-you-look', { timeout: 60_000 }, () => {
    referenceEarns(w8_02, 'ship-while-you-look');
  });

  test('w8-02 ship-while-you-look is refused a program that does nothing', () => {
    for (const seed of w8_02.seeds) {
      const result = runLevel(w8_02, seed, idle);
      const met = starsOn(w8_02, {
        world: result.world,
        trace: result.trace,
        initialWorld: result.initialWorld,
        ops: result.ops,
      });
      expect(met('ship-while-you-look'), `seed ${String(seed)}`).toBe(false);
    }
  });
});
