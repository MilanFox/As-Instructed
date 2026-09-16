import { describe, expect, test } from 'vitest';
import type { ObjectiveContext, Sim, Trace, Vec } from '../../../engine/index.ts';
import {
  ALL_DIRS,
  Dir,
  ItemKind,
  evaluateObjectives,
  isPassable,
  machineById,
  manhattan,
  step,
  tileAt,
} from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { runLevel, runReference } from '../../harness.ts';
import { fieldSweep, frontierScavenger, lockerCanvasser } from '../../__tests__/naive.ts';
import { SOLUTIONS } from '../../__tests__/solutions.ts';
import type { LevelDef, ReferenceSolution } from '../../types.ts';
import { pathOn } from '../shared.ts';
import { w8_01 } from '../w8-01.ts';
import { w8_02 } from '../w8-02.ts';
import { w8_03 } from '../w8-03.ts';
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

function fixedLoadHauler(load: number) {
  return (sim: Sim, botId: number): void => {
    const silo = sim.probe(botId, 'silo')?.at ?? sim.pos(botId);
    const across = sim.pos(botId).x === 0 ? Dir.East : Dir.West;
    const along = sim.pos(botId).y === 0 ? Dir.South : Dir.North;
    const ripe: Vec[] = [];
    do {
      for (const view of sim.look(botId, across, sim.world.w)) {
        if (view.crop !== null && view.growth >= view.maxGrowth) ripe.push(view.at);
      }
    } while (sim.canMove(botId, along) && sim.move(botId, along));

    const perRow = new Map<number, number>();
    for (const at of ripe) perRow.set(at.y, (perRow.get(at.y) ?? 0) + 1);
    let bestRow = 0;
    let bestCount = -1;
    for (const [y, held] of perRow) {
      if (held <= bestCount) continue;
      bestCount = held;
      bestRow = y;
    }
    sim.print(botId, `row ${String(bestRow)} ${String(bestCount)}`);

    const gap = (a: Vec, b: Vec): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    const go = (to: Vec): void => {
      while (sim.pos(botId).x !== to.x) {
        sim.move(botId, sim.pos(botId).x < to.x ? Dir.East : Dir.West);
      }
      while (sim.pos(botId).y !== to.y) {
        sim.move(botId, sim.pos(botId).y < to.y ? Dir.South : Dir.North);
      }
    };

    let held = 0;
    while (ripe.length > 0) {
      const here = sim.pos(botId);
      ripe.sort((a, b) => gap(a, here) - gap(b, here));
      go(ripe[0] as Vec);
      const taken = sim.harvest(botId) !== null;
      if (taken) {
        ripe.shift();
        held++;
      }
      if (!taken || held >= load || ripe.length === 0) {
        go(silo);
        sim.drop(botId, ItemKind.Crop, held);
        held = 0;
      }
    }
  };
}

function w8_01Run(seed: number, drive: (sim: Sim, botId: number) => void) {
  const result = runLevel(w8_01, seed, drive);
  return {
    refused: result.verdict.objectives.filter((each) => !each.met).map((each) => each.id),
    met: starsOn(w8_01, {
      world: result.world,
      trace: result.trace,
      initialWorld: result.initialWorld,
      ops: result.ops,
    }),
  };
}

describe('w8-01 fewest-loads', () => {
  test('the reference solution earns it on every seed', () => {
    referenceEarns(w8_01, 'fewest-loads');
  });

  test('a hauler that never risks a full hopper is refused it on every seed', () => {
    for (const seed of w8_01.seeds) {
      const run = w8_01Run(seed, fixedLoadHauler(2));
      expect(run.refused, `seed ${String(seed)}`).not.toContain('ripe-to-silo');
      expect(run.met('fewest-loads'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('carrying three a trip clears every required objective and still loses the star', () => {
    const kept = w8_01.seeds.filter((seed) => {
      const run = w8_01Run(seed, fixedLoadHauler(3));
      expect(run.refused, `seed ${String(seed)}`).toEqual([]);
      return run.met('fewest-loads');
    });

    expect(kept.length).toBeLessThan(w8_01.seeds.length);
  });

  test('a program that does nothing is refused it on every seed', () => {
    for (const seed of w8_01.seeds) {
      expect(w8_01Run(seed, idle).met('fewest-loads'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('the two stars do not answer the same question', () => {
    for (const seed of w8_01.seeds) {
      const run = w8_01Run(seed, fixedLoadHauler(2));
      expect(run.met('name-the-row'), `seed ${String(seed)}`).toBe(true);
      expect(run.met('fewest-loads'), `seed ${String(seed)}`).toBe(false);
    }
    const stripped = reportedAs(w8_01, w8_01.seeds[0] as number, 'row', () => null);
    expect(stripped.met('name-the-row')).toBe(false);
    expect(stripped.met('fewest-loads')).toBe(true);
  });
});

describe('w8-01 prices every way of reading the field', () => {
  test('a survey walked on scan alone is refused the shift on every seed', () => {
    for (const seed of w8_01.seeds) {
      const result = runReference(w8_01, seed, fieldSweep);
      const refused = result.verdict.objectives.filter((each) => !each.met).map((each) => each.id);
      expect(refused, `seed ${String(seed)}`).toContain('within-16-scan');
    }
  });
});

describe('w8-03 files a plan before the fleet moves', () => {
  const noted = (seed: number, edit: (events: Trace['events']) => Trace['events']) => {
    const result = runReference(w8_03, seed, SOLUTIONS['w8-03'] as ReferenceSolution);
    const trace: Trace = { ...result.trace, events: edit(result.trace.events) };
    return {
      passed: result.verdict.passed,
      met: starsOn(w8_03, {
        world: result.world,
        trace,
        initialWorld: result.initialWorld,
        ops: result.ops,
      }),
    };
  };
  const isNote = (event: Trace['events'][number]): boolean =>
    event.kind === 'print' && (event.text.startsWith('order ') || event.text.startsWith('finish '));

  test('the reference solution earns both stars on every seed', () => {
    referenceEarns(w8_03, 'file-the-order');
    referenceEarns(w8_03, 'call-the-clock');
  });

  test('the same run with no filing is refused the order on every seed', () => {
    for (const seed of w8_03.seeds) {
      const run = reportedAs(w8_03, seed, 'order', () => null);
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.met('file-the-order'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('a filing handed in after the fleet moved is refused on every seed', () => {
    for (const seed of w8_03.seeds) {
      const run = noted(seed, (events) => [
        ...events.filter((e) => !isNote(e)),
        ...events.filter(isNote),
      ]);
      expect(run.met('file-the-order'), `seed ${String(seed)}`).toBe(false);
      expect(run.met('call-the-clock'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('the same stations filed the other way up are refused on every seed', () => {
    for (const seed of w8_03.seeds) {
      const run = noted(seed, (events) => {
        const lines = events.filter((e) => e.kind === 'print' && e.text.startsWith('order '));
        let next = lines.length;
        return events.map((event) => {
          if (event.kind !== 'print' || !event.text.startsWith('order ')) return event;
          next -= 1;
          return { ...event, text: (lines[next] as { text: string }).text };
        });
      });
      expect(run.met('file-the-order'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('a station left off the filing is refused on every seed', () => {
    for (const seed of w8_03.seeds) {
      let dropped = false;
      const run = noted(seed, (events) =>
        events.filter((event) => {
          if (dropped || event.kind !== 'print' || !event.text.startsWith('order ')) return true;
          dropped = true;
          return false;
        }),
      );
      expect(run.met('file-the-order'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('the same run with no finish note is refused the clock on every seed', () => {
    for (const seed of w8_03.seeds) {
      const run = reportedAs(w8_03, seed, 'finish', () => null);
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.met('call-the-clock'), `seed ${String(seed)}`).toBe(false);
      expect(run.met('file-the-order'), `seed ${String(seed)}`).toBe(true);
    }
  });

  test('two ticks out is filed, three is not, on every seed', () => {
    const posted = (seed: number, slip: number) =>
      reportedAs(
        w8_03,
        seed,
        'finish',
        (line) => `finish ${String(Number(line.split(' ')[1]) + slip)}`,
      ).met('call-the-clock');
    for (const seed of w8_03.seeds) {
      expect(posted(seed, 2), `seed ${String(seed)}`).toBe(true);
      expect(posted(seed, 3), `seed ${String(seed)}`).toBe(false);
      expect(posted(seed, -3), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('one memorised tick does not carry the campaign', () => {
    for (const guess of [48, 51, 63, 71, 84]) {
      const all = w8_03.seeds.every((seed) =>
        reportedAs(w8_03, seed, 'finish', () => `finish ${String(guess)}`).met('call-the-clock'),
      );
      expect(all, String(guess)).toBe(false);
    }
  });

  test('a program that does nothing is refused both on every seed', () => {
    for (const seed of w8_03.seeds) {
      const result = runLevel(w8_03, seed, idle);
      const met = starsOn(w8_03, {
        world: result.world,
        trace: result.trace,
        initialWorld: result.initialWorld,
        ops: result.ops,
      });
      expect(met('file-the-order'), `seed ${String(seed)}`).toBe(false);
      expect(met('call-the-clock'), `seed ${String(seed)}`).toBe(false);
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

describe('w8-04 walk-the-plan', () => {
  function starsFor(seed: number, drive: (sim: Sim, botId: number) => void) {
    const result = runLevel(w8_04, seed, drive);
    return {
      passed: result.verdict.passed,
      met: starsOn(w8_04, {
        world: result.world,
        trace: result.trace,
        initialWorld: result.initialWorld,
        ops: result.ops,
      }),
    };
  }

  function readingOn(seed: number): string {
    const result = runReference(w8_04, seed, SOLUTIONS['w8-04'] as ReferenceSolution);
    const said = result.trace.events.flatMap((event) =>
      event.kind === 'print' && event.text.startsWith('plan ') ? [event.text] : [],
    );
    return must(said[0], 'the reference reading');
  }

  test('the reference solution earns it on every seed', () => {
    referenceEarns(w8_04, 'walk-the-plan');
  });

  test('a run that searches the site instead clears the shift and is refused it', () => {
    for (const searcher of [frontierScavenger, lockerCanvasser]) {
      for (const seed of w8_04.seeds) {
        const run = starsFor(seed, (sim, botId) => {
          searcher.run(sim, botId);
        });
        expect(run.passed, `${searcher.levelId} seed ${String(seed)}`).toBe(true);
        expect(run.met('walk-the-plan'), `${searcher.levelId} seed ${String(seed)}`).toBe(false);
      }
    }
  });

  test('a program that does nothing is refused it on every seed', () => {
    for (const seed of w8_04.seeds) {
      const run = starsFor(seed, idle);
      expect(run.met('walk-the-plan'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('the two stars come apart in both directions on every seed', () => {
    for (const seed of w8_04.seeds) {
      const quiet = reportedAs(w8_04, seed, 'plan', () => null);
      expect(quiet.met('walk-the-plan'), `seed ${String(seed)}`).toBe(true);
      expect(quiet.met('read-the-plan'), `seed ${String(seed)}`).toBe(false);

      const reading = readingOn(seed);
      const spoken = starsFor(seed, (sim, botId) => {
        sim.print(botId, reading);
        frontierScavenger.run(sim, botId);
      });
      expect(spoken.met('read-the-plan'), `seed ${String(seed)}`).toBe(true);
      expect(spoken.met('walk-the-plan'), `seed ${String(seed)}`).toBe(false);
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

function airlockAt(seed: number): Vec {
  return must(machineById(w8_05.build(seed), 'airlock'), 'the airlock').at;
}

function hammersTheGate(seed: number): (sim: Sim) => void {
  const gate = airlockAt(seed);
  return (sim) => {
    const id = sim.botIds()[0] as number;
    const clear = (at: Vec): boolean =>
      isPassable(sim.world, at) && tileAt(sim.world, at)?.occupant === undefined;
    const onGate = (at: Vec): boolean => at.x === gate.x && at.y === gate.y;
    for (let guard = 0; guard < 200; guard++) {
      const here = sim.pos(id);
      const beside = ALL_DIRS.find((dir) => onGate(step(here, dir)));
      if (beside !== undefined) {
        for (let turn = 0; turn < 12; turn++) sim.use(id, beside);
        return;
      }
      const path = pathOn(sim.world, (at) => clear(at) || onGate(at), here, gate);
      const first = path?.[0];
      if (first === undefined || !sim.move(id, first)) return;
    }
  };
}

function withAnExtraTurn(seed: number): (id: string) => boolean {
  const result = runReference(w8_05, seed, SOLUTIONS['w8-05'] as ReferenceSolution);
  const trace: Trace = {
    ...result.trace,
    events: [
      { t: 0, botId: 0, dt: 1, kind: 'use', at: airlockAt(seed), machineId: 'airlock', ok: false },
      ...result.trace.events,
    ],
  };
  return starsOn(w8_05, {
    world: result.world,
    trace,
    initialWorld: result.initialWorld,
    ops: result.ops,
  });
}

describe('w8-05 nine-turns', () => {
  test('the reference solution earns it on every seed', () => {
    referenceEarns(w8_05, 'nine-turns');
  });

  test('a handle worked while the gate is dark is refused on every seed', () => {
    for (const seed of w8_05.seeds) {
      const result = runLevel(w8_05, seed, hammersTheGate(seed));
      const turns = result.trace.events.filter(
        (event) => event.kind === 'use' && event.machineId === 'airlock',
      );
      expect(turns.length, `seed ${String(seed)}`).toBeGreaterThan(0);
      expect(
        turns.every((event) => event.kind === 'use' && !event.ok),
        `seed ${String(seed)}`,
      ).toBe(true);
      expect(must(machineById(result.world, 'airlock'), 'the airlock').state).toBe('sealed');
      const met = starsOn(w8_05, {
        world: result.world,
        trace: result.trace,
        initialWorld: result.initialWorld,
        ops: result.ops,
      });
      expect(met('nine-turns'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('one turn more than the gate wanted is refused on every seed', () => {
    for (const seed of w8_05.seeds) {
      expect(withAnExtraTurn(seed)('nine-turns'), `seed ${String(seed)}`).toBe(false);
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
      expect(met('nine-turns'), `seed ${String(seed)}`).toBe(false);
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
      const filed = reportedAs(w8_05, seed, 'gate', () => null);
      expect(filed.met('nine-turns'), `seed ${String(seed)}`).toBe(true);
      expect(filed.met('mind-the-gate'), `seed ${String(seed)}`).toBe(false);

      const spent = withAnExtraTurn(seed);
      expect(spent('mind-the-gate'), `seed ${String(seed)}`).toBe(true);
      expect(spent('nine-turns'), `seed ${String(seed)}`).toBe(false);
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

const isBayLine = (event: Trace['events'][number]): boolean =>
  event.kind === 'print' && event.text.startsWith('bay ');

function w8_02Reworked(seed: number, rework: (events: Trace['events']) => Trace['events']) {
  const result = runReference(w8_02, seed, SOLUTIONS['w8-02'] as ReferenceSolution);
  const trace: Trace = { ...result.trace, events: rework(result.trace.events) };
  return {
    passed: result.verdict.passed,
    met: starsOn(w8_02, {
      world: result.world,
      trace,
      initialWorld: result.initialWorld,
      ops: result.ops,
    }),
  };
}

describe('w8-02 ship-while-you-look', () => {
  test('the reference solution earns it on every seed', { timeout: 60_000 }, () => {
    referenceEarns(w8_02, 'ship-while-you-look');
  });

  test('the same run with every delivery held to the end is refused on every seed', () => {
    for (const seed of w8_02.seeds) {
      const run = w8_02Reworked(seed, (events) =>
        events.map((event) => (event.kind === 'drop' ? { ...event, t: event.t + 10_000 } : event)),
      );
      expect(run.met('ship-while-you-look'), `seed ${String(seed)}`).toBe(false);
      expect(run.met('name-the-bays'), `seed ${String(seed)}`).toBe(true);
    }
  });

  test('a program that does nothing is refused it on every seed', () => {
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

describe('w8-02 name-the-bays', () => {
  test('the reference solution earns it on every seed', { timeout: 60_000 }, () => {
    referenceEarns(w8_02, 'name-the-bays');
  });

  test('the same run without its bay list is refused on every seed', () => {
    for (const seed of w8_02.seeds) {
      const run = reportedAs(w8_02, seed, 'bay', () => null);
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.met('name-the-bays'), `seed ${String(seed)}`).toBe(false);
      expect(run.met('ship-while-you-look'), `seed ${String(seed)}`).toBe(true);
    }
  });

  test('the right bay ids under a wrong tile are refused on every seed', () => {
    for (const seed of w8_02.seeds) {
      const run = reportedAs(w8_02, seed, 'bay', (line) => {
        const parts = line.split(' ');
        return `bay ${parts[1] ?? ''} ${String(Number(parts[2]) + 1)} ${parts[3] ?? ''}`;
      });
      expect(run.met('name-the-bays'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('a bay list filed after the bot set off is refused on every seed', () => {
    for (const seed of w8_02.seeds) {
      const run = w8_02Reworked(seed, (events) => [
        ...events.filter((event) => !isBayLine(event)),
        ...events.filter(isBayLine),
      ]);
      expect(run.met('name-the-bays'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('a bay named twice is refused on every seed', () => {
    for (const seed of w8_02.seeds) {
      const run = w8_02Reworked(seed, (events) => {
        const first = events.find(isBayLine);
        return first === undefined ? events : [first, ...events];
      });
      expect(run.met('name-the-bays'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('a program that only files the list is refused it on every seed', () => {
    for (const seed of w8_02.seeds) {
      const bays = w8_02
        .build(seed)
        .machines.filter((machine) => machine.id.startsWith('depot-'));
      const result = runLevel(w8_02, seed, (sim, botId) => {
        for (const bay of bays) {
          sim.print(botId, `bay ${bay.id} ${String(bay.at.x)} ${String(bay.at.y)}`);
        }
      });
      const met = starsOn(w8_02, {
        world: result.world,
        trace: result.trace,
        initialWorld: result.initialWorld,
        ops: result.ops,
      });
      expect(result.verdict.passed, `seed ${String(seed)}`).toBe(false);
      expect(met('name-the-bays'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('a program that does nothing is refused it on every seed', () => {
    for (const seed of w8_02.seeds) {
      const result = runLevel(w8_02, seed, idle);
      const met = starsOn(w8_02, {
        world: result.world,
        trace: result.trace,
        initialWorld: result.initialWorld,
        ops: result.ops,
      });
      expect(met('name-the-bays'), `seed ${String(seed)}`).toBe(false);
    }
  });
});
