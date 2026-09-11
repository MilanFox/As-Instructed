import { describe, expect, test } from 'vitest';
import type { ObjectiveContext, Sim, Vec } from '../../../engine/index.ts';
import { Dir, ItemKind, evaluateObjectives, vec } from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { runLevel, runReference } from '../../harness.ts';
import { SOLUTIONS } from '../../__tests__/solutions.ts';
import type { LevelDef, ReferenceSolution } from '../../types.ts';
import { w7_01 } from '../w7-01.ts';
import { w7_02 } from '../w7-02.ts';
import { AISLE, SILO_X, siteFor, w7_03 } from '../w7-03.ts';
import { w7_04 } from '../w7-04.ts';

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
    met: (id: string) =>
      must(
        stars.find((star) => star.id === id),
        id,
      ).met,
  };
}

const idle = (sim: Sim, botId: number): void => {
  sim.print(botId, 'nothing');
};

function referenceEarns(level: LevelDef, id: string): void {
  const solution = SOLUTIONS[level.id] as ReferenceSolution;
  for (const seed of level.seeds) {
    const result = runReference(level, seed, solution);
    const stars = evaluateObjectives(level.bonus ?? [], {
      world: result.world,
      trace: result.trace,
      initialWorld: result.initialWorld,
      ops: result.ops,
    });
    expect(result.verdict.passed, `seed ${String(seed)}`).toBe(true);
    expect(
      must(
        stars.find((star) => star.id === id),
        id,
      ).met,
      `seed ${String(seed)}`,
    ).toBe(true);
  }
}

describe('w7-01 name-the-idle', () => {
  test('the reference solution earns it on every seed', () => {
    referenceEarns(w7_01, 'name-the-idle');
  });

  test('a run that parks both bots and files nothing is refused', () => {
    for (const seed of w7_01.seeds) {
      const run = scored(w7_01, seed, (sim) => {
        const ids = sim.botIds();
        for (const id of ids) while (sim.canMove(id, Dir.East)) sim.move(id, Dir.East);
        for (const id of ids) sim.send(id, ids[(ids.indexOf(id) + 1) % ids.length] as number, id);
        sim.sync();
        for (const id of ids) sim.recv(id);
      });
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.met('name-the-idle'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('reporting no idle at all is only right on the balanced pair', () => {
    const guess = (sim: Sim): void => {
      const ids = sim.botIds();
      for (const id of ids) while (sim.canMove(id, Dir.East)) sim.move(id, Dir.East);
      for (const id of ids) sim.send(id, ids[(ids.indexOf(id) + 1) % ids.length] as number, id);
      sim.sync();
      for (const id of ids) {
        sim.recv(id);
        sim.print(id, `idle ${String(id)} 0`);
      }
    };
    expect(scored(w7_01, 1, guess).met('name-the-idle')).toBe(false);
    expect(scored(w7_01, 2, guess).met('name-the-idle')).toBe(false);
    expect(scored(w7_01, 3, guess).met('name-the-idle')).toBe(true);
  });
});

function equalBands(sim: Sim, botId: number): void {
  const depot = sim.probe(botId, 'depot');
  if (!depot) return;
  const fleet = depot.vars['requisition'] ?? 1;
  const total = depot.vars['crops'] ?? 0;
  const crops: Vec[] = [];
  for (let i = 0; i < total; i++) {
    const packed = depot.vars[`c${i}`] ?? 0;
    crops.push(vec(packed % 24, Math.floor(packed / 24)));
  }

  const ids = [botId];
  let parent = botId;
  while (ids.length < fleet) {
    const child = sim.spawn(parent, Dir.East);
    if (child < 0) break;
    ids.push(child);
    parent = child;
  }

  const width = Math.ceil(22 / ids.length);
  ids.forEach((id, band) => {
    const mine = crops.filter(
      (crop) => crop.x - 1 >= band * width && crop.x - 1 < (band + 1) * width,
    );
    for (const crop of mine) {
      for (let guard = 0; guard < 64; guard++) {
        const here = sim.pos(id);
        if (here.x === crop.x && here.y === crop.y) break;
        const dir =
          here.y !== crop.y
            ? here.y < crop.y
              ? Dir.South
              : Dir.North
            : here.x < crop.x
              ? Dir.East
              : Dir.West;
        if (sim.canMove(id, dir)) sim.move(id, dir);
        else sim.wait(id, 1);
      }
      sim.harvest(id);
    }
  });
}

describe('w7-02 even-share', () => {
  test('the reference solution earns it on every seed', () => {
    referenceEarns(w7_02, 'even-share');
  });

  test('cutting the field into equal bands clears it and misses the star', () => {
    const run = scored(w7_02, 1, equalBands);

    expect(run.passed).toBe(true);
    expect(run.met('even-share')).toBe(false);
  });

  test('working the field single-handed is refused on every multi-bot seed', () => {
    for (const seed of w7_02.seeds) {
      const run = scored(w7_02, seed, (sim, botId) => {
        const depot = sim.probe(botId, 'depot');
        if (!depot) return;
        const total = depot.vars['crops'] ?? 0;
        for (let i = 0; i < total; i++) {
          const packed = depot.vars[`c${i}`] ?? 0;
          const crop = vec(packed % 24, Math.floor(packed / 24));
          for (let guard = 0; guard < 64; guard++) {
            const here = sim.pos(botId);
            if (here.x === crop.x && here.y === crop.y) break;
            const dir =
              here.y !== crop.y
                ? here.y < crop.y
                  ? Dir.South
                  : Dir.North
                : here.x < crop.x
                  ? Dir.East
                  : Dir.West;
            sim.move(botId, dir);
          }
          sim.harvest(botId);
        }
      });
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.met('even-share'), `seed ${String(seed)}`).toBe(seed === 2);
    }
  });
});

function everyBotForItself(sim: Sim, seed: number): void {
  const site = siteFor(seed);
  const eastX = 8 + site.tunnel;
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

  const MOUTH_X = 7;
  ids.forEach((id, index) => {
    const row = 1 + index;
    const pile = vec(eastX + (site.columns[index] ?? 1), row);
    for (let load = 0; load < (site.loads[index] ?? 1); load++) {
      walkTo(id, vec(MOUTH_X, row));
      walkTo(id, vec(MOUTH_X, AISLE));
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

describe('w7-03 no-bumps', () => {
  test('the reference solution earns it on every seed', () => {
    referenceEarns(w7_03, 'no-bumps');
  });

  test('hauling with no right of way clears the yard and misses the star', () => {
    for (const seed of w7_03.seeds) {
      const run = scored(w7_03, seed, (sim) => {
        everyBotForItself(sim, seed);
      });
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.met('no-bumps'), `seed ${String(seed)}`).toBe(false);
    }
  });
});

function reportedAs(seed: number, rewrite: (line: string) => string | null) {
  const solution = SOLUTIONS[w7_04.id] as ReferenceSolution;
  const result = runReference(w7_04, seed, solution);
  const events = result.trace.events.flatMap((event) => {
    if (event.kind !== 'print' || !event.text.startsWith('last ')) return [event];
    const line = rewrite(event.text);
    return line === null ? [] : [{ ...event, text: line }];
  });
  const stars = evaluateObjectives(w7_04.bonus ?? [], {
    world: result.world,
    initialWorld: result.initialWorld,
    trace: { ...result.trace, events },
    ops: result.ops,
  });
  return { passed: result.verdict.passed, met: must(stars[0], 'the star').met };
}

describe('w7-04 name-the-decider', () => {
  test('the reference solution earns it on every seed', () => {
    referenceEarns(w7_04, 'name-the-decider');
  });

  test('the same run without its report line is refused on every seed', () => {
    for (const seed of w7_04.seeds) {
      const run = reportedAs(seed, () => null);
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.met, `seed ${String(seed)}`).toBe(false);
    }
  });

  test('the right tick under the wrong job is refused on every seed', () => {
    for (const seed of w7_04.seeds) {
      const run = reportedAs(seed, (line) => `last job-0 ${line.split(' ')[2] ?? ''}`);
      expect(run.met, `seed ${String(seed)}`).toBe(false);
    }
  });

  test('the right job under a wrong tick is refused on every seed', () => {
    for (const seed of w7_04.seeds) {
      const run = reportedAs(seed, (line) => {
        const parts = line.split(' ');
        return `last ${parts[1] ?? ''} ${String(Number(parts[2]) - 1)}`;
      });
      expect(run.met, `seed ${String(seed)}`).toBe(false);
    }
  });
});

describe('a program that does nothing earns neither report', () => {
  test('w7-01 name-the-idle', () => {
    for (const seed of w7_01.seeds) {
      expect(scored(w7_01, seed, idle).met('name-the-idle'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('w7-04 name-the-decider', () => {
    for (const seed of w7_04.seeds) {
      expect(scored(w7_04, seed, idle).met('name-the-decider'), `seed ${String(seed)}`).toBe(false);
    }
  });
});
