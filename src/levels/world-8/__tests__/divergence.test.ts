import { describe, expect, test } from 'vitest';
import type { Objective, ObjectiveContext, Sim, Trace, Vec } from '../../../engine/index.ts';
import {
  DIVERGENCE_VALUE_CHARS,
  FED_BY,
  ItemKind,
  NOTHING,
  SILVER_FACTOR,
  Terrain,
  cloneWorld,
  isPassable,
  machineById,
  step,
  tileAt,
} from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { fieldSweep, frontierScavenger, literalPlanFollower } from '../../__tests__/naive.ts';
import { runLevel } from '../../harness.ts';
import type { LevelDef } from '../../types.ts';
import { key, pathOn, point } from '../shared.ts';
import { w8_01 } from '../w8-01.ts';
import { w8_02 } from '../w8-02.ts';
import { w8_03 } from '../w8-03.ts';
import { surveyFor, w8_04 } from '../w8-04.ts';
import { w8_05 } from '../w8-05.ts';

function objectiveIn(level: LevelDef, id: string): Objective {
  return must(
    [...level.objectives, ...(level.bonus ?? [])].find((each) => each.id === id),
    id,
  );
}

function report(
  level: LevelDef,
  seed: number,
  id: string,
  drive: (sim: Sim, botId: number) => void,
) {
  const result = runLevel(level, seed, drive);
  const objective = objectiveIn(level, id);
  const ctx: ObjectiveContext = {
    world: result.world,
    trace: result.trace,
    initialWorld: result.initialWorld,
    ops: result.ops,
  };
  return { met: objective.evaluate(ctx), divergence: objective.divergence?.(ctx), result };
}

const idle = (): void => undefined;

function walkTo(sim: Sim, botId: number, to: Vec): void {
  const route = pathOn(sim.world, (at) => isPassable(sim.world, at), sim.pos(botId), to);
  if (route === null) return;
  for (const dir of route) sim.move(botId, dir);
}

describe('w8-01 separates a crop left in the ground from a crop left in the arms', () => {
  const seed = 1;

  const firstRipe = (): Vec => {
    const world = w8_01.build(seed);
    const index = world.tiles.findIndex(
      (tile) => tile.crop !== undefined && (tile.growth ?? 0) >= (tile.maxGrowth ?? 1),
    );
    return { x: index % world.w, y: Math.floor(index / world.w) };
  };

  test('a shift that harvested nothing is given a tile that was ripe when it started', () => {
    const { met, divergence } = report(w8_01, seed, 'ripe-to-silo', idle);

    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: point(firstRipe()),
      expected: 'harvested and taken to the silo',
      received: 'still standing; it was ripe at the start',
    });
  });

  test('a shift that harvested everything and delivered none of it is counted at the silo', () => {
    const initialWorld = w8_01.build(seed);
    const world = cloneWorld(initialWorld);
    let ripe = 0;
    for (const tile of world.tiles) {
      if (tile.crop === undefined || (tile.growth ?? 0) < (tile.maxGrowth ?? 1)) continue;
      ripe++;
      delete tile.crop;
    }
    const bot = must(world.bots[0], 'the bot');
    bot.inventory = [{ kind: ItemKind.Crop, count: 3 }];

    const objective = objectiveIn(w8_01, 'ripe-to-silo');
    const ctx: ObjectiveContext = {
      world,
      initialWorld,
      trace: { initialWorld, events: [], keyframes: [], endTick: 0 },
    };

    expect(objective.evaluate(ctx)).toBe(false);
    expect(objective.divergence?.(ctx)).toEqual({
      where: `the silo at ${point(must(machineById(initialWorld, 'silo'), 'the silo').at)}`,
      expected: `${String(ripe)} crops`,
      received: '0 crops, 3 still in the arms',
    });
  });

  test('the World 2 sweep is told its audit note is missing, and not which row', () => {
    const { met, divergence } = report(w8_01, seed, 'name-the-row', (sim, botId) => {
      fieldSweep.run(sim, botId);
    });

    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: 'the audit note',
      expected: 'a line naming the row that carried the most',
      received: NOTHING,
    });
  });

  test('a note naming the wrong row is priced against that row, not against the right one', () => {
    const { met, divergence } = report(w8_01, seed, 'name-the-row', (sim, botId) => {
      sim.print(botId, 'row 6 3');
      fieldSweep.run(sim, botId);
    });

    expect(met).toBe(false);
    const shown = must(divergence, 'a divergence');
    expect(shown.where).toBe('row 6');
    expect(`${shown.expected} ${shown.received}`).toMatch(/\d/);
    expect(`${shown.expected} ${shown.received}`).not.toMatch(/row \d/);
  });
});

describe('w8-02 names the class that came up short, and the bay that took the wrong crate', () => {
  const seed = 1;

  test('a shift that carried nothing is told which class is short and by how much', () => {
    const { met, divergence } = report(w8_02, seed, 'depot-sorted', idle);

    expect(met).toBe(false);
    const shown = must(divergence, 'a divergence');
    expect(shown.where).toMatch(/^depot-[a-z]+$/);
    expect(shown.expected).toMatch(/^\d+ [a-z]+ on the bay$/);
    expect(shown.received).toMatch(/^no [a-z]+ there$/);
  });

  test('a crate dropped on somebody else’s bay is reported at that bay', () => {
    const world = w8_02.build(seed);
    const bays = world.machines.filter((machine) => machine.id.startsWith('depot-'));
    const bay = must(bays[0], 'a bay');
    const wanted = bay.id.slice('depot-'.length);
    const crate = must(
      world.items.find((stack) => stack.kind !== wanted),
      'a crate of another class',
    );

    const { met, divergence } = report(w8_02, seed, 'depot-sorted', (sim, botId) => {
      walkTo(sim, botId, crate.at);
      sim.pickup(botId, crate.kind, 1);
      walkTo(sim, botId, bay.at);
      sim.drop(botId, crate.kind, 1);
    });

    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: point(bay.at),
      expected: `this bay takes ${wanted}`,
      received: `1 ${crate.kind} lying on it`,
    });
  });

  test('a shift that never saw the whole floor is told that, and not a tick', () => {
    const { met, divergence } = report(w8_02, seed, 'ship-while-you-look', idle);

    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: 'the last crate or bay',
      expected: 'in view at some point in the shift',
      received: 'never came into view',
    });
  });

  test('a survey run that shipped nothing on the way is priced at the last sighting', () => {
    const world = w8_02.build(seed);
    const stops = [...world.items.map((stack) => stack.at), ...world.machines.map((m) => m.at)];

    const { met, divergence } = report(w8_02, seed, 'ship-while-you-look', (sim, botId) => {
      for (const at of stops) walkTo(sim, botId, at);
    });

    expect(met).toBe(false);
    const shown = must(divergence, 'a divergence');
    expect(shown.where).toMatch(/^tick \d+, the last sighting$/);
    expect(shown.expected).toMatch(/^\d+ crates already on their bays$/);
    expect(shown.received).toBe('0 were');
  });
});

describe('w8-03 pins an overrun on the bot that was still going', () => {
  const seed = 1;
  const LOITER = 600;

  test('within-shift names the last bot to stop and both ticks', () => {
    const { met, divergence } = report(w8_03, seed, 'within-shift', (sim, botId) => {
      sim.wait(botId, LOITER);
    });

    expect(met).toBe(false);
    const shown = must(divergence, 'a divergence');
    expect(shown.where).toMatch(/^RIG-8\d+, the last to stop$/);
    expect(shown.expected).toMatch(/^tick \d+$/);
    expect(shown.received).toBe(`tick ${String(LOITER)}`);
  });
});

describe('w8-03 grades and fails on one axis, so the ladder sits under the shift', () => {
  const silverCut = Math.max(w8_03.par.ticks + 1, Math.floor(w8_03.par.ticks * SILVER_FACTOR));

  test('every rung is inside the shift on every seed', () => {
    for (const seed of w8_03.seeds) {
      const world = w8_03.build(seed);
      const shift = must(
        objectiveIn(w8_03, 'within-shift').progress?.({
          world,
          initialWorld: world,
          trace: { initialWorld: world, events: [], keyframes: [], endTick: 0 },
        }),
        'a progress pair',
      )[1];
      expect([seed, silverCut < shift]).toEqual([seed, true]);
    }
  });
});

describe('w8-04 says whether the run reached the locker, and never says where it is', () => {
  const arrivedEmptyHanded = (sim: Sim, botId: number): void => {
    walkTo(sim, botId, surveyFor(5).locker);
  };

  test('a run that never arrived and a run that arrived are told apart', () => {
    const never = report(w8_04, 5, 'form-recovered', (sim, botId) => {
      literalPlanFollower.run(sim, botId);
    });
    const stood = report(w8_04, 5, 'form-recovered', arrivedEmptyHanded);

    expect(never.met).toBe(false);
    expect(never.divergence).toEqual({
      where: 'KD-0001-T at the end of the run',
      expected: 'in the bot',
      received: 'still in the locker; nobody reached it',
    });
    expect(stood.met).toBe(false);
    expect(stood.divergence?.received).toBe('still in the locker; the bot stood on it');
  });

  test('no coordinate of the locker appears in either report', () => {
    const drives = [
      (sim: Sim, botId: number): void => {
        literalPlanFollower.run(sim, botId);
      },
      arrivedEmptyHanded,
    ];
    for (const drive of drives) {
      const shown = must(report(w8_04, 5, 'form-recovered', drive).divergence, 'a divergence');
      expect(`${shown.where} ${shown.expected} ${shown.received}`).not.toMatch(/\(\d/);
    }
  });

  test('walk-the-plan names the tick and the tile of the first step off the route', () => {
    const { met, divergence } = report(w8_04, 5, 'walk-the-plan', (sim, botId) => {
      frontierScavenger.run(sim, botId);
    });

    expect(met).toBe(false);
    const shown = must(divergence, 'a divergence');
    expect(shown.where).toMatch(/^tick \d+ · \(\d+, \d+\)$/);
    expect(shown.expected).toBe('a tile the filed route covers');
    expect(shown.received).toMatch(/^\d+ tiles in the old workings$/);
  });

  test('walk-the-plan tells a run that strayed nowhere but stopped short', () => {
    const { met, divergence } = report(w8_04, 5, 'walk-the-plan', () => undefined);

    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: 'the far end of the filed route',
      expected: 'the bot standing on it',
      received: 'the run stopped short',
    });
  });
});

describe('w8-04 charges the re-survey to the run’s own footprints', () => {
  const seed = 1;

  function planned(): Set<string> {
    const survey = surveyFor(seed);
    const tiles = new Set<string>();
    for (const leg of survey.legs) {
      let at = leg.from;
      tiles.add(key(at));
      for (let i = 0; i < leg.length; i++) {
        at = step(at, leg.dir);
        tiles.add(key(at));
      }
    }
    return tiles;
  }

  function wander(count: number) {
    const world = w8_04.build(seed);
    const onPlan = planned();
    const strays: Vec[] = [];
    for (let y = 0; y < world.h && strays.length < count; y++) {
      for (let x = 0; x < world.w && strays.length < count; x++) {
        const at = { x, y };
        if (onPlan.has(key(at)) || tileAt(world, at)?.terrain !== Terrain.Floor) continue;
        strays.push(at);
      }
    }
    return (sim: Sim, botId: number): void => {
      for (const at of strays) walkTo(sim, botId, at);
    };
  }

  test('a run that walked the workings and filed nothing is told only that', () => {
    const { met, divergence } = report(w8_04, seed, 'read-the-plan', wander(12));

    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: 'the reading',
      expected: 'a line reading `plan <cipher> <legs>`',
      received: NOTHING,
    });
  });

  test('a wrong reading is told it is wrong and never told the right one', () => {
    const survey = surveyFor(seed);
    const wrongShift = report(w8_04, seed, 'read-the-plan', (sim, botId) => {
      sim.print(botId, `plan ${String((survey.cipherKey + 7) % 95)} ${String(survey.legs.length)}`);
    });
    expect(wrongShift.met).toBe(false);
    const cipher = must(wrongShift.divergence, 'a divergence');
    expect(cipher.where).toBe('the cipher');
    expect(`${cipher.expected} ${cipher.received}`).not.toContain(String(survey.cipherKey));

    const wrongLegs = report(w8_04, seed, 'read-the-plan', (sim, botId) => {
      sim.print(botId, `plan ${String(survey.cipherKey)} ${String(survey.legs.length + 2)}`);
    });
    expect(wrongLegs.met).toBe(false);
    const legs = must(wrongLegs.divergence, 'a divergence');
    expect(legs.where).toBe('the plan');
    expect(`${legs.expected} ${legs.received}`).not.toContain(String(survey.legs.length));
    expect(`${legs.expected} ${legs.received}`).not.toMatch(/[NESW]/);
  });
});

describe('w8-05 reports the finale without driving the finale', () => {
  const seed = 1;

  test('quota names the class depot that is short and where its crates are', () => {
    const { met, divergence } = report(w8_05, seed, 'quota', idle);

    expect(met).toBe(false);
    const shown = must(divergence, 'a divergence');
    expect(shown.where).toMatch(/^depot-[a-z]+ at \(\d+, \d+\)$/);
    expect(shown.expected).toMatch(/^\d+ [a-z]+ on the tile$/);
    expect(shown.received).toMatch(/^no [a-z]+ there$/);
  });

  test('the deadline names the bot that was still going, and the tick it stopped on', () => {
    const shift = must(
      report(w8_05, seed, 'deadline', (sim: Sim, botId: number) => {
        sim.wait(botId, 3200);
      }).divergence,
      'a divergence',
    );

    expect(shift.where).toMatch(/^KD-\d+, the last to stop$/);
    expect(shift.received).toBe('tick 3200');
    expect(shift.expected).toMatch(/^tick \d+$/);
  });

  test('nine-turns names the gate and the turns that moved nothing', () => {
    const airlock = must(machineById(w8_05.build(seed), 'airlock'), 'the airlock');
    const { met, divergence } = report(w8_05, seed, 'nine-turns', (sim, botId) => {
      walkTo(sim, botId, airlock.at);
      for (let turn = 0; turn < 4; turn++) sim.use(botId);
    });

    expect(met).toBe(false);
    const shown = must(divergence, 'a divergence');
    expect(shown.where).toBe(`airlock at ${point(airlock.at)}`);
    expect(shown.expected).toMatch(/^every turn with sub-\d+ on$/);
    expect(shown.received).toBe('4 of 4 at a dark gate');
  });

  test('a gate nobody reached for is told that, and not a figure it missed', () => {
    const { met, divergence } = report(w8_05, seed, 'nine-turns', idle);

    expect(met).toBe(false);
    const shown = must(divergence, 'a divergence');
    expect(shown.expected).toBe('9 turns of the handle');
    expect(shown.received).toBe('nobody turned it');
  });

  test('a gate opened before its substation was thrown has no interval to file', () => {
    const world = w8_05.build(seed);
    const airlock = must(machineById(world, 'airlock'), 'the airlock');
    const feeder = must(
      Object.entries(airlock.vars).find(([name, value]) => value === 1 && name.startsWith(FED_BY)),
      'the airlock feeder',
    )[0].slice(FED_BY.length);
    const trace: Trace = {
      initialWorld: world,
      events: [
        { t: 41, botId: 0, dt: 1, kind: 'use', at: airlock.at, machineId: 'airlock', ok: true },
        { t: 689, botId: 1, dt: 1, kind: 'use', at: airlock.at, machineId: feeder, ok: true },
        { t: 700, kind: 'print', text: `gate ${feeder} -648` },
      ],
      keyframes: [],
      endTick: 701,
    };
    const ctx: ObjectiveContext = { world: cloneWorld(world), initialWorld: world, trace };
    const objective = objectiveIn(w8_05, 'mind-the-gate');

    expect(objective.evaluate(ctx)).toBe(false);
    expect(objective.divergence?.(ctx)).toEqual({
      where: 'the airlock',
      expected: `a gate moved after ${feeder} was thrown`,
      received: 'moved at tick 41, thrown at tick 689',
    });
  });

  test('a gate note under the wrong substation is told which one it wanted', () => {
    const { met, divergence } = report(w8_05, seed, 'mind-the-gate', (sim, botId) => {
      sim.print(botId, 'gate sub-99 40');
    });

    expect(met).toBe(false);
    const shown = must(divergence, 'a divergence');
    expect(shown.where).toBe('sub-99');
    expect(shown.expected).toBe('the substation the airlock draws from');
  });
});

describe('the empty program is told where it fell short on every World 8 seed', () => {
  for (const level of [w8_01, w8_02, w8_03, w8_04, w8_05]) {
    test(`${level.id} names a point on all ${String(level.seeds.length)} seeds`, () => {
      for (const seed of level.seeds) {
        const result = runLevel(level, seed, idle);
        const ctx: ObjectiveContext = {
          world: result.world,
          trace: result.trace,
          initialWorld: result.initialWorld,
          ops: result.ops,
        };
        for (const objective of [...level.objectives, ...(level.bonus ?? [])]) {
          if (objective.evaluate(ctx)) continue;
          const named = `${level.id}/${objective.id} seed ${String(seed)}`;
          const shown = must(objective.divergence?.(ctx), named);
          for (const value of [shown.where, shown.expected, shown.received]) {
            expect(value, named).not.toBe('');
            expect(value.length, `${named}: ${value}`).toBeLessThanOrEqual(DIVERGENCE_VALUE_CHARS);
          }
        }
      }
    });
  }
});
